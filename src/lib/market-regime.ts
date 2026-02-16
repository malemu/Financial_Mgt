import { MarketRegime } from "./types";

type PricePoint = { date: string; close: number };
type HoldingInput = { asset_id: string; shares: number };
type PortfolioPoint = { date: string; value: number };

type RegimeMetrics = {
  latest: number;
  ma200: number;
  trend_pct: number;
  vol_pct: number;
  drawdown_pct: number;
  sample: number;
  start: string;
  end: string;
};

export type RegimeResult = {
  regime: MarketRegime;
  score: number | null;
  metrics: RegimeMetrics | null;
  notes: string[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const stdev = (values: number[]) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
};

const intersectDates = (maps: Map<string, number>[]) => {
  if (!maps.length) return [];
  const base = maps[0];
  const dates = Array.from(base.keys());
  return dates.filter((date) => maps.every((map) => map.has(date))).sort();
};

export const buildPortfolioSeries = (
  holdings: HoldingInput[],
  histories: Map<string, PricePoint[]>
): PortfolioPoint[] => {
  const priceMaps = holdings
    .map((holding) => ({
      holding,
      prices: histories.get(holding.asset_id) ?? [],
    }))
    .filter((entry) => entry.prices.length > 0)
    .map((entry) => ({
      holding: entry.holding,
      map: new Map(entry.prices.map((row) => [row.date, row.close])),
    }));

  if (!priceMaps.length) return [];
  const commonDates = intersectDates(priceMaps.map((entry) => entry.map));
  if (!commonDates.length) return [];

  return commonDates.map((date) => {
    const value = priceMaps.reduce((sum, entry) => {
      const price = entry.map.get(date) ?? 0;
      return sum + entry.holding.shares * price;
    }, 0);
    return { date, value };
  });
};

export const computeRegimeFromSeries = (series: PortfolioPoint[]): RegimeResult => {
  if (series.length < 30) {
    return {
      regime: "neutral",
      score: null,
      metrics: null,
      notes: ["Not enough history to compute regime."],
    };
  }

  const latest = series[series.length - 1];
  const closes = series.map((point) => point.value);
  const tail = (count: number) => closes.slice(-count);
  const maWindow = tail(Math.min(200, closes.length));
  const ma200 = average(maWindow);
  const trendPct = ma200 ? ((latest.value / ma200) - 1) * 100 : 0;

  const returns = closes.slice(1).map((value, index) => {
    const prev = closes[index];
    return prev ? (value / prev - 1) : 0;
  });
  const volWindow = returns.slice(-Math.min(63, returns.length));
  const volPct = stdev(volWindow) * Math.sqrt(252) * 100;

  const ddWindow = tail(Math.min(252, closes.length));
  let runningMax = -Infinity;
  let drawdownPct = 0;
  ddWindow.forEach((value) => {
    runningMax = Math.max(runningMax, value);
    const dd = runningMax ? ((value / runningMax) - 1) * 100 : 0;
    drawdownPct = Math.min(drawdownPct, dd);
  });

  const scoreRaw = 50 + 0.6 * trendPct - 0.4 * volPct + 0.3 * drawdownPct;
  const score = clamp(scoreRaw, 0, 100);
  const regime: MarketRegime =
    score >= 60 ? "risk-on" : score <= 40 ? "risk-off" : "neutral";

  return {
    regime,
    score,
    metrics: {
      latest: latest.value,
      ma200,
      trend_pct: trendPct,
      vol_pct: volPct,
      drawdown_pct: drawdownPct,
      sample: series.length,
      start: series[0].date,
      end: latest.date,
    },
    notes: [],
  };
};
