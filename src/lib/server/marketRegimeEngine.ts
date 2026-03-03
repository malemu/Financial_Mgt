import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import {
  NDX_TICKER,
  RUSSELL_TICKER,
  SP500_TICKER,
  VIX_TICKER,
} from "@/lib/market-regime-constants";
import { MarketCycleRegime, MarketRegimeSummary } from "@/lib/types";
import { fetchLatestPriceHistoryRows } from "@/lib/server/priceHistory";

const MAX_HISTORY_ROWS = 10000;

const getAdminClient = () => createSupabaseAdminClient();

type PriceRow = { date: string; close: number };
type MarketMetricsRow = {
  date: string;
  regime: MarketCycleRegime;
  sp500_close: number;
  sp500_50dma: number;
  sp500_200dma: number;
  sp500_above_200: boolean;
  ndx_close: number;
  ndx_200dma: number;
  ndx_above_200: boolean;
  vix_level: number;
  drawdown_from_ath: number;
};

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const readSeries = async (ticker: string, date: string) => {
  try {
    return await fetchLatestPriceHistoryRows<PriceRow>({
      ticker,
      select: "date, close",
      limit: MAX_HISTORY_ROWS,
      end: date,
    });
  } catch (error) {
    throw new Error(
      `Failed to load ${ticker} history: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const toSummary = (row: MarketMetricsRow): MarketRegimeSummary => {
  const sp500Vs200Pct =
    row.sp500_200dma > 0
      ? ((row.sp500_close - row.sp500_200dma) / row.sp500_200dma) * 100
      : 0;
  const ndxVs200Pct =
    row.ndx_200dma > 0
      ? ((row.ndx_close - row.ndx_200dma) / row.ndx_200dma) * 100
      : 0;
  return {
    date: row.date,
    regime: row.regime,
    sp500Above200: !!row.sp500_above_200,
    ndxAbove200: !!row.ndx_above_200,
    vixLevel: row.vix_level,
    drawdownFromATH: row.drawdown_from_ath,
    sp500Close: row.sp500_close,
    sp500_50dma: row.sp500_50dma,
    sp500_200dma: row.sp500_200dma,
    sp500Vs200Pct,
    ndxClose: row.ndx_close,
    ndx_200dma: row.ndx_200dma,
    ndxVs200Pct,
  };
};

const classifyRegime = (params: {
  sp500Above200: boolean;
  ndxAbove200: boolean;
  vixLevel: number;
  drawdownFromATH: number;
}): MarketCycleRegime => {
  const drawdownAbsPct = Math.abs(params.drawdownFromATH);

  if (
    params.sp500Above200 &&
    params.ndxAbove200 &&
    params.vixLevel < 22 &&
    drawdownAbsPct < 15
  ) {
    return "Bull";
  }

  if (
    !params.sp500Above200 &&
    !params.ndxAbove200 &&
    params.vixLevel > 30 &&
    drawdownAbsPct > 20
  ) {
    return "Bear";
  }

  return "Transitional";
};

export const calculateDailyMarketMetrics = async (inputDate: Date) => {
  const date = toIsoDate(inputDate);
  const [spyRows, qqqRows, , vixRows] = await Promise.all([
    readSeries(SP500_TICKER, date),
    readSeries(NDX_TICKER, date),
    readSeries(RUSSELL_TICKER, date),
    readSeries(VIX_TICKER, date),
  ]);

  if (spyRows.length < 200 || qqqRows.length < 200 || vixRows.length < 200) {
    throw new Error(
      `Insufficient market history to compute regime. SPY=${spyRows.length}, QQQ=${qqqRows.length}, VIX=${vixRows.length}. Need at least 200 rows each.`
    );
  }

  const sp500Close = spyRows[spyRows.length - 1].close;
  const ndxClose = qqqRows[qqqRows.length - 1].close;
  const vixLevel = vixRows[vixRows.length - 1].close;
  const sp500_50dma = average(spyRows.slice(-50).map((row) => row.close));
  const sp500_200dma = average(spyRows.slice(-200).map((row) => row.close));
  const ndx_200dma = average(qqqRows.slice(-200).map((row) => row.close));
  const sp500Ath = Math.max(...spyRows.map((row) => row.close));
  const drawdownFromATH =
    sp500Ath > 0 ? ((sp500Close - sp500Ath) / sp500Ath) * 100 : 0;

  const sp500Above200 = sp500Close > sp500_200dma;
  const ndxAbove200 = ndxClose > ndx_200dma;
  const regime = classifyRegime({
    sp500Above200,
    ndxAbove200,
    vixLevel,
    drawdownFromATH,
  });

  const sp500Vs200Pct = sp500_200dma
    ? ((sp500Close - sp500_200dma) / sp500_200dma) * 100
    : 0;
  const ndxVs200Pct = ndx_200dma
    ? ((ndxClose - ndx_200dma) / ndx_200dma) * 100
    : 0;

  return {
    date,
    regime,
    sp500Close,
    sp500_50dma,
    sp500_200dma,
    sp500Vs200Pct,
    sp500Above200,
    ndxClose,
    ndx_200dma,
    ndxVs200Pct,
    ndxAbove200,
    vixLevel,
    drawdownFromATH,
  } satisfies MarketRegimeSummary;
};

export const updateMarketMetrics = async (inputDate = new Date()) => {
  const summary = await calculateDailyMarketMetrics(inputDate);
  if (!summary) {
    return null;
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from("market_metrics").upsert({
    id: `market_metrics_${summary.date}`,
    date: summary.date,
    sp500_close: summary.sp500Close,
    sp500_50dma: summary.sp500_50dma,
    sp500_200dma: summary.sp500_200dma,
    sp500_above_200: summary.sp500Above200,
    ndx_close: summary.ndxClose,
    ndx_200dma: summary.ndx_200dma,
    ndx_above_200: summary.ndxAbove200,
    vix_level: summary.vixLevel,
    drawdown_from_ath: summary.drawdownFromATH,
    regime: summary.regime,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to persist market metrics: ${error.message}`);
  }

  return summary;
};

export const getCurrentMarketRegimeSummary = async () => {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("market_metrics")
    .select(
      "date, regime, sp500_close, sp500_50dma, sp500_200dma, sp500_above_200, ndx_close, ndx_200dma, ndx_above_200, vix_level, drawdown_from_ath"
    )
    .order("date", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load market metrics: ${error.message}`);
  }

  const latest = (data ?? [])[0];
  if (latest) {
    return toSummary(latest as MarketMetricsRow);
  }

  try {
    const computed = await updateMarketMetrics(new Date());
    if (computed) {
      return computed;
    }
  } catch {
    return null;
  }

  return null;
};
