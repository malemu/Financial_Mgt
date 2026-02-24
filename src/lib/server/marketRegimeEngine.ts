import { getDb } from "@/lib/db";
import {
  NDX_TICKER,
  RUSSELL_TICKER,
  SP500_TICKER,
  VIX_TICKER,
} from "@/lib/market-regime-constants";
import { MarketCycleRegime, MarketRegimeSummary } from "@/lib/types";

type PriceRow = { date: string; close: number };
type MarketMetricsRow = {
  date: string;
  regime: MarketCycleRegime;
  sp500_close: number;
  sp500_50dma: number;
  sp500_200dma: number;
  sp500_above_200: number;
  ndx_close: number;
  ndx_200dma: number;
  ndx_above_200: number;
  vix_level: number;
  drawdown_from_ath: number;
};

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const readSeries = (ticker: string, date: string) => {
  const db = getDb();
  return db
    .prepare(
      "select date, close from price_history where ticker = ? and date <= ? order by date asc"
    )
    .all(ticker, date) as PriceRow[];
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

export const calculateDailyMarketMetrics = (inputDate: Date) => {
  const date = toIsoDate(inputDate);
  const spyRows = readSeries(SP500_TICKER, date);
  const qqqRows = readSeries(NDX_TICKER, date);
  const iwmRows = readSeries(RUSSELL_TICKER, date);
  const vixRows = readSeries(VIX_TICKER, date);

  console.log("SPY rows:", spyRows.length);
  console.log("QQQ rows:", qqqRows.length);
  console.log("IWM rows:", iwmRows.length);
  console.log("VIX rows:", vixRows.length);

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

  return {
    date,
    regime,
    sp500Close,
    sp500_50dma,
    sp500_200dma,
    sp500Above200,
    ndxClose,
    ndx_200dma,
    ndxAbove200,
    vixLevel,
    drawdownFromATH,
  } satisfies MarketRegimeSummary;
};

export const updateMarketMetrics = (inputDate = new Date()) => {
  const summary = calculateDailyMarketMetrics(inputDate);
  if (!summary) {
    return null;
  }

  const db = getDb();
  db.prepare(
    `insert into market_metrics (
      id, date, sp500_close, sp500_50dma, sp500_200dma, sp500_above_200,
      ndx_close, ndx_200dma, ndx_above_200, vix_level, drawdown_from_ath, regime, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(date) do update set
      sp500_close = excluded.sp500_close,
      sp500_50dma = excluded.sp500_50dma,
      sp500_200dma = excluded.sp500_200dma,
      sp500_above_200 = excluded.sp500_above_200,
      ndx_close = excluded.ndx_close,
      ndx_200dma = excluded.ndx_200dma,
      ndx_above_200 = excluded.ndx_above_200,
      vix_level = excluded.vix_level,
      drawdown_from_ath = excluded.drawdown_from_ath,
      regime = excluded.regime,
      created_at = excluded.created_at`
  ).run(
    `market_metrics_${summary.date}`,
    summary.date,
    summary.sp500Close,
    summary.sp500_50dma,
    summary.sp500_200dma,
    summary.sp500Above200 ? 1 : 0,
    summary.ndxClose,
    summary.ndx_200dma,
    summary.ndxAbove200 ? 1 : 0,
    summary.vixLevel,
    summary.drawdownFromATH,
    summary.regime,
    new Date().toISOString()
  );

  return summary;
};

export const getCurrentMarketRegimeSummary = () => {
  const db = getDb();
  const latest = db
    .prepare(
      `select date, regime, sp500_close, sp500_50dma, sp500_200dma, sp500_above_200,
              ndx_close, ndx_200dma, ndx_above_200, vix_level, drawdown_from_ath
       from market_metrics
       order by date desc
       limit 1`
    )
    .get() as MarketMetricsRow | undefined;

  if (latest) {
    return toSummary(latest);
  }

  try {
    const computed = updateMarketMetrics(new Date());
    if (computed) {
      return computed;
    }
  } catch {
    return null;
  }
  return null;
};
