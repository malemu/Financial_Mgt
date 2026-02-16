import { getDb } from "@/lib/db";

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

const alphaVantageKey = () => process.env.ALPHA_VANTAGE_API_KEY;

const normalizeTicker = (ticker: string) => ticker.trim().toUpperCase();

const getLatestFromDb = (ticker: string) => {
  const db = getDb();
  return db
    .prepare(
      "select date, close, data_source from price_history where ticker = ? order by date desc limit 1"
    )
    .get(ticker) as { date: string; close: number; data_source: string } | undefined;
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
  const fromDb = getLatestFromDb(normalized);
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
  const db = getDb();
  const rows = db
    .prepare(
      "select date, close from price_history where ticker = ? order by date asc"
    )
    .all(normalized) as { date: string; close: number }[];
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
  if (startDate) {
    filtered = filtered.filter((row) => row.date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((row) => row.date <= endDate);
  }
  if (limit && limit > 0 && filtered.length > limit) {
    filtered = filtered.slice(-limit);
  }
  return {
    ticker: normalized,
    asset_type: assetType,
    prices: filtered,
    source: "DB price_history",
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
    items: payload.feed.slice(0, limit).map((item) => ({
      title: item.title ?? "Untitled",
      url: item.url ?? "",
      time_published: item.time_published ?? "",
      source: item.source ?? "Unknown",
      summary: item.summary ?? "",
    })),
    source: "Alpha Vantage (News)",
  };
};

export const getBasicFundamentals = async (
  ticker: string
): Promise<FundamentalsResult> => {
  const normalized = normalizeTicker(ticker);
  const apiKey = alphaVantageKey();
  if (!apiKey) {
    return {
      ticker: normalized,
      source: null,
      data: null,
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
      source: null,
      data: null,
      error: `Alpha Vantage error (${response.status}).`,
    };
  }
  const payload = (await response.json()) as Record<string, string>;
  if (!payload || !payload.Symbol) {
    return {
      ticker: normalized,
      source: "Alpha Vantage (Overview)",
      data: null,
      error: "Fundamentals unavailable.",
    };
  }
  return {
    ticker: normalized,
    source: "Alpha Vantage (Overview)",
    data: {
      symbol: payload.Symbol ?? normalized,
      name: payload.Name ?? null,
      sector: payload.Sector ?? null,
      industry: payload.Industry ?? null,
      market_cap: payload.MarketCapitalization
        ? Number(payload.MarketCapitalization)
        : null,
      pe_ratio: payload.PERatio ? Number(payload.PERatio) : null,
      forward_pe: payload.ForwardPE ? Number(payload.ForwardPE) : null,
      eps: payload.EPS ? Number(payload.EPS) : null,
      profit_margin: payload.ProfitMargin ? Number(payload.ProfitMargin) : null,
      revenue_ttm: payload.RevenueTTM ? Number(payload.RevenueTTM) : null,
      diluted_eps_ttm: payload.DilutedEPSTTM ? Number(payload.DilutedEPSTTM) : null,
      beta: payload.Beta ? Number(payload.Beta) : null,
      analyst_target_price: payload.AnalystTargetPrice
        ? Number(payload.AnalystTargetPrice)
        : null,
      fiscal_year_end: payload.FiscalYearEnd ?? null,
    },
  };
};

