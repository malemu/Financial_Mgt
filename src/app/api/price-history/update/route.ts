import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type RequestPayload = {
  tickers?: string[];
  allocations?: { asset_id: string; asset_type: string }[];
};

const mostRecentTradingDay = (now: Date) => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
};

export async function POST(request: Request) {
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
      if (allocation.asset_type === "stock") {
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

  const db = getDb();
  const fetchedAt = new Date().toISOString();
  const latestTradingDay = mostRecentTradingDay(new Date());
  const insert = db.prepare(
    `insert or ignore into price_history (
      ticker, date, open, high, low, close, volume, data_source, fetched_at, sort_order
    ) values (
      @ticker, @date, @open, @high, @low, @close, @volume, @data_source, @fetched_at, @sort_order
    )`
  );

  const results: Record<string, any> = {};
  let totalInserted = 0;

  for (const ticker of tickers) {
    const isCrypto = cryptoTickers.has(ticker);
    const latestRow = db
      .prepare(
        "select date, close from price_history where ticker = ? order by date desc limit 1"
      )
      .get(ticker) as { date: string | null; close: number | null };
    const latestDate = latestRow?.date ?? null;

    let rows: {
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
    }[] = [];

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
    } else {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "TIME_SERIES_DAILY");
      url.searchParams.set("symbol", ticker);
      url.searchParams.set("outputsize", "compact");
      url.searchParams.set("apikey", process.env.ALPHA_VANTAGE_API_KEY);

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
      const series = data["Time Series (Daily)"];
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
            volume,
            data_source: "Alpha Vantage (Daily)",
            fetched_at: fetchedAt,
            sort_order,
          };
        })
        .filter(Boolean) as typeof rows;
    }

    const tx = db.transaction((items: typeof rows) => {
      let inserted = 0;
      items.forEach((row) => {
        const info = insert.run(row);
        if (info.changes) inserted += 1;
      });
      return inserted;
    });
    const inserted = rows.length ? tx(rows) : 0;
    totalInserted += inserted;

    const latestInserted = rows.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const latestEffective = latestInserted ?? {
      date: latestRow?.date ?? null,
      close: latestRow?.close ?? null,
    };
    results[ticker] = {
      inserted,
      last_price_date: latestEffective.date ?? null,
      last_price: latestEffective.close ?? null,
      fetched_at: fetchedAt,
      data_source: isCrypto
        ? "Coinbase Exchange (Daily)"
        : "Alpha Vantage (Daily)",
      is_stale: latestEffective.date
        ? latestEffective.date < latestTradingDay
        : true,
    };

    // Alpha Vantage free tier: 1 request/sec
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  return NextResponse.json({
    fetched_at: fetchedAt,
    latest_trading_day: latestTradingDay,
    inserted: totalInserted,
    results,
    skipped,
    warning: totalInserted
      ? undefined
      : "No new price history rows were inserted. Existing latest prices are shown.",
  });
}
