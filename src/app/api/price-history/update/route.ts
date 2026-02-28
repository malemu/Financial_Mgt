import { NextResponse } from "next/server";
import { MARKET_INDEX_TICKERS } from "@/lib/market-regime-constants";
import { updateMarketMetrics } from "@/lib/server/marketRegimeEngine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

type RequestPayload = {
  tickers?: string[];
  allocations?: { asset_id: string; asset_type: string }[];
};

type HistoryRow = {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  data_source: string;
  fetched_at: string;
  sort_order: number;
};

type AlphaDailyRow = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume": string;
};

const getAdminClient = () => createSupabaseAdminClient();

const countTickerRows = async (ticker: string) => {
  const supabase = getAdminClient();
  const { count, error } = await supabase
    .from("price_history")
    .select("ticker", { count: "exact", head: true })
    .eq("ticker", ticker);
  if (error) {
    throw new Error(`Failed to count rows for ${ticker}: ${error.message}`);
  }
  return count ?? 0;
};

const getLatestTickerRow = async (ticker: string) => {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("price_history")
    .select("date, close")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to read latest row for ${ticker}: ${error.message}`);
  }
  return (data as { date: string | null; close: number | null } | null) ?? null;
};

const insertPriceHistoryRows = async (rows: HistoryRow[]) => {
  if (!rows.length) return;
  const supabase = getAdminClient();
  const { error } = await supabase
    .from("price_history")
    .upsert(rows, { onConflict: "ticker,date", ignoreDuplicates: true });
  if (error) {
    throw new Error(`Failed to insert price history rows: ${error.message}`);
  }
};

const mostRecentTradingDay = (now: Date) => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
};

const fetchFredVixSeries = async (
  ticker: string,
  latestDate: string | null,
  fetchedAt: string
): Promise<{ rows: HistoryRow[]; error?: string }> => {
  const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS";
  const response = await fetch(url);
  if (!response.ok) {
    return { rows: [], error: `FRED fetch failed (${response.status}).` };
  }

  const text = await response.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], error: "FRED returned empty VIX series." };
  }

  const rows: HistoryRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [dateRaw, valueRaw] = lines[i].split(",");
    const date = (dateRaw ?? "").trim();
    const valueText = (valueRaw ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (latestDate && date <= latestDate) continue;
    if (!valueText || valueText === ".") continue;
    const close = Number(valueText);
    if (!Number.isFinite(close)) continue;

    rows.push({
      ticker,
      date,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
      data_source: "FRED (VIXCLS)",
      fetched_at: fetchedAt,
      sort_order: Number(date.replace(/-/g, "")),
    });
  }

  return { rows };
};

const REGIME_REQUIRED_TICKERS = ["SPY", "QQQ", "VIX"] as const;
const BACKFILL_TICKERS = new Set(["SPY", "QQQ", "IWM"]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RequestPayload;
  const allocations = payload.allocations ?? [];
  const inputTickers = payload.tickers ?? [];

  const stockTickers = new Set<string>();
  const cryptoTickers = new Set<string>();
  const skipped: { ticker: string; reason: string }[] = [];

  if (allocations.length) {
    allocations.forEach((allocation) => {
      const ticker = allocation.asset_id?.toUpperCase();
      if (!ticker) return;
      if (allocation.asset_type === "stock" || allocation.asset_type === "index") {
        stockTickers.add(ticker);
      } else if (allocation.asset_type === "crypto") {
        if (ticker === "BTC") {
          cryptoTickers.add("BTC");
        } else {
          skipped.push({ ticker, reason: "Unsupported crypto ticker." });
        }
      } else {
        skipped.push({ ticker, reason: "Non-stock asset type." });
      }
    });
  } else {
    inputTickers.forEach((ticker) => {
      const normalized = ticker?.toUpperCase();
      if (!normalized) return;
      if (normalized === "BTC") {
        cryptoTickers.add("BTC");
      } else if (normalized === "CASH") {
        skipped.push({ ticker: normalized, reason: "Cash has no market history." });
      } else {
        stockTickers.add(normalized);
      }
    });
  }

  MARKET_INDEX_TICKERS.forEach((ticker) => stockTickers.add(ticker));

  const tickers = [...stockTickers, ...cryptoTickers];
  if (!tickers.length) {
    return NextResponse.json(
      { error: "No supported tickers provided.", skipped },
      { status: 400 }
    );
  }
  if (stockTickers.size > 0 && !process.env.ALPHA_VANTAGE_API_KEY) {
    return NextResponse.json(
      { error: "ALPHA_VANTAGE_API_KEY is not set for stock updates." },
      { status: 500 }
    );
  }

  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY ?? "";
  const fetchedAt = new Date().toISOString();
  const latestTradingDay = mostRecentTradingDay(new Date());

  const results: Record<string, any> = {};
  let totalInserted = 0;

  for (const ticker of tickers) {
    try {
      const isCrypto = cryptoTickers.has(ticker);
      const existingCount = await countTickerRows(ticker);
      const needsBackfill = BACKFILL_TICKERS.has(ticker) && existingCount < 200;
      const latestRow = await getLatestTickerRow(ticker);
      const latestDate = latestRow?.date ?? null;

      let rows: HistoryRow[] = [];

      if (isCrypto) {
        const productId = ticker === "BTC" ? "BTC-USD" : `${ticker}-USD`;
        const url = new URL(
          `https://api.exchange.coinbase.com/products/${productId}/candles`
        );
        url.searchParams.set("granularity", "86400");

        const response = await fetch(url.toString());
        if (!response.ok) {
          results[ticker] = { error: `Fetch failed (${response.status}).` };
          continue;
        }
        const data = (await response.json()) as Array<
          [number, number, number, number, number, number]
        >;
        if (!Array.isArray(data) || !data.length) {
          results[ticker] = {
            error: "No time series returned from Coinbase Exchange.",
          };
          continue;
        }

        rows = data
          .map((entry) => {
            const [time, low, high, open, close, volume] = entry;
            const date = new Date(time * 1000).toISOString().slice(0, 10);
            if (
              !Number.isFinite(open) ||
              !Number.isFinite(high) ||
              !Number.isFinite(low) ||
              !Number.isFinite(close)
            ) {
              return null;
            }
            if (latestDate && date <= latestDate) {
              return null;
            }
            const sort_order = Number(date.replace(/-/g, ""));
            return {
              ticker,
              date,
              open,
              high,
              low,
              close,
              volume: Number.isFinite(volume) ? volume : 0,
              data_source: "Coinbase Exchange (Daily)",
              fetched_at: fetchedAt,
              sort_order,
            };
          })
          .filter(Boolean) as typeof rows;
      } else if (ticker === "VIX") {
        const vix = await fetchFredVixSeries(ticker, latestDate, fetchedAt);
        if (vix.error) {
          results[ticker] = { error: vix.error };
          continue;
        }
        rows = vix.rows;
      } else {
        const url = new URL("https://www.alphavantage.co/query");
        url.searchParams.set("function", "TIME_SERIES_DAILY");
        url.searchParams.set("symbol", ticker);
        url.searchParams.set("outputsize", needsBackfill ? "full" : "compact");
        url.searchParams.set("apikey", alphaKey);

        const response = await fetch(url.toString());
        if (!response.ok) {
          results[ticker] = { error: `Fetch failed (${response.status}).` };
          continue;
        }
        const rawText = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          results[ticker] = { error: "Invalid JSON from Alpha Vantage.", raw: rawText };
          continue;
        }
        const series = data["Time Series (Daily)"] as Record<string, AlphaDailyRow> | undefined;
        if (!series) {
          results[ticker] = {
            error:
              data["Error Message"] ??
              data["Note"] ??
              data["Information"] ??
              "No time series returned.",
            meta: data["Meta Data"] ?? null,
          };
          continue;
        }

        rows = Object.entries(series)
          .map(([date, values]) => {
            const open = Number(values["1. open"]);
            const high = Number(values["2. high"]);
            const low = Number(values["3. low"]);
            const close = Number(values["4. close"]);
            const volumeRaw = values["5. volume"];
            const volume = Number.isFinite(Number(volumeRaw)) ? Number(volumeRaw) : 0;
            if (
              !Number.isFinite(open) ||
              !Number.isFinite(high) ||
              !Number.isFinite(low) ||
              !Number.isFinite(close)
            ) {
              return null;
            }
            if (!needsBackfill && latestDate && date <= latestDate) {
              return null;
            }
            const sort_order = Number(date.replace(/-/g, ""));
            return {
              ticker,
              date,
              open,
              high,
              low,
              close,
              volume,
              data_source: "Alpha Vantage (Daily)",
              fetched_at: fetchedAt,
              sort_order,
            };
          })
          .filter(Boolean) as typeof rows;
      }

      const beforeCount = existingCount;
      await insertPriceHistoryRows(rows);
      const afterCount = await countTickerRows(ticker);
      const inserted = Math.max(0, afterCount - beforeCount);
      totalInserted += inserted;

      const latestEffective = (await getLatestTickerRow(ticker)) ?? latestRow ?? {
        date: null,
        close: null,
      };
      results[ticker] = {
        inserted,
        last_price_date: latestEffective.date ?? null,
        last_price: latestEffective.close ?? null,
        fetched_at: fetchedAt,
        data_source: isCrypto
          ? "Coinbase Exchange (Daily)"
          : ticker === "VIX"
          ? "FRED (VIXCLS)"
          : "Alpha Vantage (Daily)",
        is_stale: latestEffective.date ? latestEffective.date < latestTradingDay : true,
      };

      // Alpha Vantage free tier: 1 request/sec
      if (!isCrypto && ticker !== "VIX") {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    } catch (error) {
      results[ticker] = {
        error: error instanceof Error ? error.message : "Unknown import failure.",
      };
    }
  }

  const regimeCounts: Record<string, number> = {};
  for (const ticker of REGIME_REQUIRED_TICKERS) {
    try {
      regimeCounts[ticker] = await countTickerRows(ticker);
    } catch (error) {
      return NextResponse.json(
        {
          error: `Price import completed, but regime counts failed for ${ticker}.`,
          detail: error instanceof Error ? error.message : "Unknown count failure.",
          fetched_at: fetchedAt,
          latest_trading_day: latestTradingDay,
          inserted: totalInserted,
          results,
          skipped,
        },
        { status: 500 }
      );
    }
  }

  const insufficient = Object.entries(regimeCounts).filter(([, count]) => count < 200);
  if (insufficient.length) {
    return NextResponse.json(
      {
        error: "Price import completed, but market metrics requirements are not met.",
        detail: `Insufficient market history to compute regime. ${insufficient
          .map(([ticker, count]) => `${ticker}=${count}`)
          .join(", ")}. Need at least 200 rows each.`,
        fetched_at: fetchedAt,
        latest_trading_day: latestTradingDay,
        inserted: totalInserted,
        results,
        skipped,
      },
      { status: 500 }
    );
  }

  let marketMetrics = null;
  try {
    marketMetrics = await updateMarketMetrics(new Date());
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Failed to rebuild market metrics after price import.";
    return NextResponse.json(
      {
        error: "Price import completed, but market metrics rebuild failed.",
        detail,
        fetched_at: fetchedAt,
        latest_trading_day: latestTradingDay,
        inserted: totalInserted,
        results,
        skipped,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    fetched_at: fetchedAt,
    latest_trading_day: latestTradingDay,
    inserted: totalInserted,
    results,
    skipped,
    market_metrics: marketMetrics,
    warning: totalInserted
      ? undefined
      : "No new price history rows were inserted. Existing latest prices are shown.",
  });
  } catch (error) {
    console.error("Price history update failed:", error);
    return NextResponse.json(
      {
        error: "Price update failed.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
