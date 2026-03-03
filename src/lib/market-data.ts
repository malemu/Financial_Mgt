import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

type LatestPriceResult = {
  ticker: string;
  asset_type: "stock" | "crypto" | "unknown";
  price: number | null;
  date: string | null;
  source: string | null;
  error?: string;
};

type HistoricalPriceResult = {
  ticker: string;
  asset_type: "stock" | "crypto" | "unknown";
  prices: { date: string; close: number }[];
  source: string | null;
  error?: string;
};

type NewsItem = {
  title: string;
  url: string;
  time_published: string;
  source: string;
  summary: string;
};

type NewsResult = {
  ticker: string;
  items: NewsItem[];
  source: string | null;
  error?: string;
};

type FundamentalsResult = {
  ticker: string;
  source: string | null;
  data: Record<string, string | number | null> | null;
  error?: string;
};

const MAX_HISTORY_ROWS = 5000;

const alphaVantageKey = () => process.env.ALPHA_VANTAGE_API_KEY;

const normalizeTicker = (ticker: string) => ticker.trim().toUpperCase();

const getLatestFromDb = async (ticker: string) => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("price_history")
    .select("date, close, data_source")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to read price history for ${ticker}: ${error.message}`);
  }
  return data as { date: string; close: number; data_source: string } | undefined;
};

const fetchAlphaVantageQuote = async (ticker: string) => {
  const apiKey = alphaVantageKey();
  if (!apiKey) {
    return { price: null, date: null, error: "Alpha Vantage API key missing." };
  }
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) {
    return { price: null, date: null, error: `Alpha Vantage error (${response.status}).` };
  }
  const payload = (await response.json()) as {
    "Global Quote"?: { "05. price"?: string; "07. latest trading day"?: string };
  };
  const quote = payload["Global Quote"];
  const price = quote?.["05. price"] ? Number(quote["05. price"]) : null;
  const date = quote?.["07. latest trading day"] ?? null;
  if (!price || Number.isNaN(price)) {
    return { price: null, date: null, error: "Alpha Vantage quote unavailable." };
  }
  return { price, date, error: undefined };
};

const fetchCoinbaseSpot = async (ticker: string) => {
  const base = normalizeTicker(ticker);
  const url = `https://api.exchange.coinbase.com/products/${base}-USD/ticker`;
  const response = await fetch(url.toString());
  if (!response.ok) {
    return { price: null, date: null, error: `Coinbase error (${response.status}).` };
  }
  const payload = (await response.json()) as { price?: string; time?: string };
  const price = payload.price ? Number(payload.price) : null;
  if (!price || Number.isNaN(price)) {
    return { price: null, date: null, error: "Coinbase price unavailable." };
  }
  return { price, date: payload.time ?? null, error: undefined };
};

export const getLatestPrice = async (
  ticker: string,
  assetType: "stock" | "crypto" | "unknown"
): Promise<LatestPriceResult> => {
  const normalized = normalizeTicker(ticker);
  const fromDb = await getLatestFromDb(normalized);
  if (fromDb) {
    return {
      ticker: normalized,
      asset_type: assetType,
      price: fromDb.close,
      date: fromDb.date,
      source: fromDb.data_source,
    };
  }
  if (assetType === "crypto") {
    const result = await fetchCoinbaseSpot(normalized);
    return {
      ticker: normalized,
      asset_type: assetType,
      price: result.price,
      date: result.date,
      source: "Coinbase Exchange (Ticker)",
      error: result.error,
    };
  }
  const result = await fetchAlphaVantageQuote(normalized);
  return {
    ticker: normalized,
    asset_type: assetType,
    price: result.price,
    date: result.date,
    source: "Alpha Vantage (Global Quote)",
    error: result.error,
  };
};

export const getHistoricalPrice = async (
  ticker: string,
  assetType: "stock" | "crypto" | "unknown",
  startDate?: string | null,
  endDate?: string | null,
  limit?: number | null
): Promise<HistoricalPriceResult> => {
  const normalized = normalizeTicker(ticker);
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("price_history")
    .select("date, close")
    .eq("ticker", normalized);
  if (startDate) {
    query = query.gte("date", startDate);
  }
  if (endDate) {
    query = query.lte("date", endDate);
  }
  const effectiveLimit = limit && limit > 0 ? limit : MAX_HISTORY_ROWS;
  const { data, error } = await query
    .order("date", { ascending: false })
    .limit(effectiveLimit);
  if (error) {
    throw new Error(`Failed to load historical prices: ${error.message}`);
  }
  const rows = (data ?? [])
    .map((row) => ({ date: row.date as string, close: Number(row.close) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) {
    return {
      ticker: normalized,
      asset_type: assetType,
      prices: [],
      source: null,
      error: "No historical prices in database.",
    };
  }
  let filtered = rows;
  if (limit && limit > 0 && filtered.length > limit) {
    filtered = filtered.slice(-limit);
  }
  return {
    ticker: normalized,
    asset_type: assetType,
    prices: filtered,
    source: "Supabase price_history",
  };
};

export const getCompanyNews = async (
  ticker: string,
  limit = 6
): Promise<NewsResult> => {
  const normalized = normalizeTicker(ticker);
  const apiKey = alphaVantageKey();
  if (!apiKey) {
    return {
      ticker: normalized,
      items: [],
      source: null,
      error: "Alpha Vantage API key missing.",
    };
  }
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "NEWS_SENTIMENT");
  url.searchParams.set("tickers", normalized);
  url.searchParams.set("limit", Math.min(Math.max(limit, 1), 20).toString());
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) {
    return {
      ticker: normalized,
      items: [],
      source: null,
      error: `Alpha Vantage error (${response.status}).`,
    };
  }
  const payload = (await response.json()) as {
    feed?: Array<{
      title?: string;
      url?: string;
      time_published?: string;
      source?: string;
      summary?: string;
    }>;
    Information?: string;
    Note?: string;
  };
  if (!payload.feed || payload.feed.length === 0) {
    return {
      ticker: normalized,
      items: [],
      source: "Alpha Vantage (News)",
      error: payload.Information ?? payload.Note ?? "News unavailable.",
    };
  }
  return {
    ticker: normalized,
    items: payload.feed
      .slice(0, limit)
      .map((item) => ({
        title: item.title ?? "Untitled",
        url: item.url ?? "",
        time_published: item.time_published ?? "",
        source: item.source ?? "Unknown",
        summary: item.summary ?? "",
      })),
    source: "Alpha Vantage (News)",
  };
};

export const getFundamentals = async (ticker: string): Promise<FundamentalsResult> => {
  const normalized = normalizeTicker(ticker);
  const apiKey = alphaVantageKey();
  if (!apiKey) {
    return {
      ticker: normalized,
      data: null,
      source: null,
      error: "Alpha Vantage API key missing.",
    };
  }
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "OVERVIEW");
  url.searchParams.set("symbol", normalized);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) {
    return {
      ticker: normalized,
      data: null,
      source: null,
      error: `Alpha Vantage error (${response.status}).`,
    };
  }
  const payload = (await response.json()) as Record<string, string>;
  if (!payload || Object.keys(payload).length === 0) {
    return {
      ticker: normalized,
      data: null,
      source: "Alpha Vantage (Overview)",
      error: "Fundamentals unavailable.",
    };
  }
  return {
    ticker: normalized,
    data: payload,
    source: "Alpha Vantage (Overview)",
  };
};
