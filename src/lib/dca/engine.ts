import type { AssetType } from "@/lib/types";
import { BEAR_TIER1_ASSETS } from "@/lib/market-regime-constants";
import { MarketCycleRegime } from "@/lib/types";

export type PricePoint = {
  date: string;
  close: number;
};

export type DcaFrequency = "daily" | "weekly" | "bi-weekly" | "monthly";

export type DcaSettings = {
  frequency: DcaFrequency;
  baseContribution: number;
  startDate?: string;
  endDate?: string;
  minScoreAction: "skip" | "minimum";
  minMultiplier: number;
  highMultiplierMin: number;
  highMultiplierMax: number;
  lookbackYears?: number;
};

export type DcaMetrics = {
  drawdown52wPct: number;
  drawdownAthPct: number;
  maDistancePct: number;
  volatilityPercentile: number;
  forwardReturnAvgPct: number;
  score: number;
};

export type DcaScheduleEntry = {
  date: string;
  index: number;
  price: number;
  metrics: DcaMetrics;
  multiplier: number;
  allocation: number;
};

export type DcaSimulationSummary = {
  totalInvested: number;
  totalUnits: number;
  avgCost: number;
  endingValue: number;
  cagr: number;
};

export type DcaSimulationResult = {
  standard: DcaSimulationSummary;
  optimized: DcaSimulationSummary;
  performanceDeltaPct: number;
  schedule: DcaScheduleEntry[];
};

export type DcaEngineResult = {
  history: PricePoint[];
  maSeries: (number | null)[];
  metricsSeries: DcaMetrics[];
  schedule: DcaScheduleEntry[];
  simulation: DcaSimulationResult;
};

export type DcaRegimeContext = {
  regime: MarketCycleRegime;
  assetId: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const scaleToScore = (value: number, min: number, max: number) => {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
};

const parseDateMs = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).getTime();

const mean = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const stdDev = (values: number[]) => {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
};

const buildMovingAverage = (values: number[], window: number) => {
  const result = Array(values.length).fill(null) as (number | null)[];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) {
      sum -= values[i - window];
    }
    if (i >= window - 1) {
      result[i] = sum / window;
    }
  }
  return result;
};

const buildDrawdowns = (history: PricePoint[]) => {
  const drawdown52w: number[] = [];
  const drawdownAth: number[] = [];
  let ath = 0;
  for (let i = 0; i < history.length; i += 1) {
    const { date, close } = history[i];
    const cutoff = parseDateMs(date) - 365 * MS_PER_DAY;
    let high52w = 0;
    for (let j = i; j >= 0; j -= 1) {
      if (parseDateMs(history[j].date) < cutoff) break;
      high52w = Math.max(high52w, history[j].close);
    }
    ath = Math.max(ath, close);
    const dd52 = high52w ? ((high52w - close) / high52w) * 100 : 0;
    const ddAth = ath ? ((ath - close) / ath) * 100 : 0;
    drawdown52w.push(clamp(dd52, 0, 100));
    drawdownAth.push(clamp(ddAth, 0, 100));
  }
  return { drawdown52w, drawdownAth };
};

const buildVolatilityPercentiles = (closes: number[]) => {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    returns.push(closes[i] / closes[i - 1] - 1);
  }
  const volWindow = 30;
  const volSeries: (number | null)[] = Array(closes.length).fill(null);
  for (let i = volWindow; i < closes.length; i += 1) {
    const slice = returns.slice(i - volWindow, i);
    volSeries[i] = stdDev(slice);
  }
  const lookback = 252 * 5;
  const percentiles: number[] = Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i += 1) {
    const currentVol = volSeries[i];
    if (currentVol == null) {
      percentiles[i] = 0;
      continue;
    }
    const start = Math.max(0, i - lookback);
    const window = volSeries
      .slice(start, i + 1)
      .filter((value): value is number => value != null);
    if (!window.length) {
      percentiles[i] = 0;
      continue;
    }
    const below = window.filter((value) => value <= currentVol).length;
    percentiles[i] = clamp((below / window.length) * 100, 0, 100);
  }
  return percentiles;
};

const buildForwardReturns = (closes: number[]) => {
  const horizons = [126, 252, 504];
  const forwardReturns = horizons.map(() => Array(closes.length).fill(null) as (number | null)[]);
  horizons.forEach((offset, index) => {
    for (let i = 0; i < closes.length; i += 1) {
      const futureIndex = i + offset;
      if (futureIndex < closes.length) {
        forwardReturns[index][i] = (closes[futureIndex] / closes[i] - 1) * 100;
      }
    }
  });
  return { horizons, forwardReturns };
};

const computeForwardAverage = (
  index: number,
  drawdownSeverity: number[],
  maDistanceBelow: number[],
  forwardReturns: (number | null)[][]
) => {
  let band = 5;
  let candidates: number[] = [];
  while (band <= 15 && candidates.length < 8) {
    candidates = [];
    for (let i = 0; i < index; i += 1) {
      if (
        Math.abs(drawdownSeverity[i] - drawdownSeverity[index]) <= band &&
        Math.abs(maDistanceBelow[i] - maDistanceBelow[index]) <= band
      ) {
        candidates.push(i);
      }
    }
    band += 5;
  }
  if (!candidates.length) return 0;
  const horizonAverages = forwardReturns.map((series) => {
    const values = candidates
      .map((candidate) => series[candidate])
      .filter((value): value is number => value != null);
    return values.length ? mean(values) : 0;
  });
  return mean(horizonAverages);
};

export const computeBuyQualityScore = (params: {
  drawdownSeverity: number;
  maDistanceBelow: number;
  forwardReturnAvgPct: number;
  volatilityPercentile: number;
}) => {
  const drawdownScore = scaleToScore(params.drawdownSeverity, 0, 60);
  const maScore = scaleToScore(params.maDistanceBelow, 0, 40);
  const forwardScore = scaleToScore(params.forwardReturnAvgPct, -20, 60);
  const volatilityScore = 100 - params.volatilityPercentile;
  const composite =
    drawdownScore * 0.4 +
    maScore * 0.3 +
    forwardScore * 0.2 +
    volatilityScore * 0.1;
  return clamp(composite, 0, 100);
};

export const mapScoreToMultiplier = (
  score: number,
  settings?: Pick<DcaSettings, "minMultiplier" | "highMultiplierMin" | "highMultiplierMax">
) => {
  const minMultiplier = settings?.minMultiplier ?? 0.25;
  const highMultiplierMin = settings?.highMultiplierMin ?? 1.5;
  const highMultiplierMax = settings?.highMultiplierMax ?? 2.0;
  if (score >= 85) return highMultiplierMax;
  if (score >= 70) return highMultiplierMin;
  if (score >= 55) return 1.0;
  if (score >= 40) return 0.5;
  return minMultiplier;
};

const buildSchedule = (
  history: PricePoint[],
  settings: DcaSettings,
  metricsSeries: DcaMetrics[],
  regimeContext?: DcaRegimeContext
) => {
  if (!history.length) return [];
  const start = settings.startDate ?? history[0].date;
  const end = settings.endDate ?? history[history.length - 1].date;
  let current = parseDateMs(start);
  const endMs = parseDateMs(end);
  const schedule: DcaScheduleEntry[] = [];
  const stepDays =
    settings.frequency === "daily"
      ? 1
      : settings.frequency === "weekly"
      ? 7
      : settings.frequency === "bi-weekly"
      ? 14
      : 30;

  const regimeMultiplier =
    !regimeContext
      ? 1
      : regimeContext.regime === "Bull"
      ? 1
      : regimeContext.regime === "Transitional"
      ? 0.7
      : BEAR_TIER1_ASSETS.has(regimeContext.assetId.toUpperCase())
      ? 1.25
      : 1;

  while (current <= endMs) {
    const scheduledDate = new Date(current).toISOString().slice(0, 10);
    const index = history.findIndex((point) => point.date >= scheduledDate);
    if (index === -1) break;
    const point = history[index];
    const metrics = metricsSeries[index];
    const multiplier = mapScoreToMultiplier(metrics.score, settings);
    schedule.push({
      date: point.date,
      index,
      price: point.close,
      metrics,
      multiplier,
      allocation: settings.baseContribution * multiplier * regimeMultiplier,
    });
    current += stepDays * MS_PER_DAY;
  }
  return schedule;
};

const buildSimulationSummary = (
  schedule: DcaScheduleEntry[],
  baseContribution: number,
  useMultipliers: boolean,
  lastPrice: number
): DcaSimulationSummary => {
  let totalInvested = 0;
  let totalUnits = 0;
  schedule.forEach((entry) => {
    const amount = useMultipliers
      ? entry.allocation
      : baseContribution;
    if (amount <= 0) return;
    totalInvested += amount;
    totalUnits += amount / entry.price;
  });
  const endingValue = totalUnits * lastPrice;
  const firstDate = schedule[0]?.date;
  const lastDate = schedule[schedule.length - 1]?.date;
  const years =
    firstDate && lastDate
      ? (parseDateMs(lastDate) - parseDateMs(firstDate)) / (365 * MS_PER_DAY)
      : 0;
  const cagr =
    years > 0 && totalInvested > 0
      ? (endingValue / totalInvested) ** (1 / years) - 1
      : 0;
  const avgCost = totalUnits > 0 ? totalInvested / totalUnits : 0;
  return {
    totalInvested,
    totalUnits,
    avgCost,
    endingValue,
    cagr,
  };
};

export const runDcaEngine = (
  historyInput: PricePoint[],
  assetType: AssetType,
  settings: DcaSettings,
  regimeContext?: DcaRegimeContext
): DcaEngineResult => {
  const history = [...historyInput]
    .filter((point) => point.date && Number.isFinite(point.close))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (!history.length) {
    return {
      history,
      maSeries: [],
      metricsSeries: [],
      schedule: [],
      simulation: {
        standard: {
          totalInvested: 0,
          totalUnits: 0,
          avgCost: 0,
          endingValue: 0,
          cagr: 0,
        },
        optimized: {
          totalInvested: 0,
          totalUnits: 0,
          avgCost: 0,
          endingValue: 0,
          cagr: 0,
        },
        performanceDeltaPct: 0,
        schedule: [],
      },
    };
  }

  const effectiveLookbackYears =
    settings.lookbackYears && settings.lookbackYears > 0
      ? settings.lookbackYears
      : assetType === "crypto"
      ? 4
      : 5;
  const lastDate = history[history.length - 1].date;
  const cutoffMs =
    parseDateMs(lastDate) - effectiveLookbackYears * 365 * MS_PER_DAY;
  const windowedHistory = history.filter(
    (point) => parseDateMs(point.date) >= cutoffMs
  );
  const closes = windowedHistory.map((point) => point.close);
  const maWindow = assetType === "crypto" ? 300 : 200;
  const maSeries = buildMovingAverage(closes, maWindow);
  const { drawdown52w, drawdownAth } = buildDrawdowns(windowedHistory);
  const volatilityPercentiles = buildVolatilityPercentiles(closes);
  const { forwardReturns } = buildForwardReturns(closes);

  const drawdownSeverity = drawdown52w.map((value, index) =>
    Math.max(value, drawdownAth[index])
  );
  const maDistanceBelow = maSeries.map((ma, index) => {
    if (ma == null) return 0;
    const distance = ((windowedHistory[index].close - ma) / ma) * 100;
    return clamp(-distance, 0, 100);
  });

  const metricsSeries: DcaMetrics[] = windowedHistory.map((point, index) => {
    const forwardReturnAvgPct = computeForwardAverage(
      index,
      drawdownSeverity,
      maDistanceBelow,
      forwardReturns
    );
    const score = computeBuyQualityScore({
      drawdownSeverity: drawdownSeverity[index],
      maDistanceBelow: maDistanceBelow[index],
      forwardReturnAvgPct,
      volatilityPercentile: volatilityPercentiles[index],
    });
    return {
      drawdown52wPct: drawdown52w[index],
      drawdownAthPct: drawdownAth[index],
      maDistancePct: maSeries[index]
        ? ((point.close - (maSeries[index] ?? 0)) / (maSeries[index] ?? 1)) * 100
        : 0,
      volatilityPercentile: volatilityPercentiles[index],
      forwardReturnAvgPct,
      score,
    };
  });

  const schedule = buildSchedule(windowedHistory, settings, metricsSeries, regimeContext);
  const lastPrice = windowedHistory[windowedHistory.length - 1].close;
  const standard = buildSimulationSummary(
    schedule,
    settings.baseContribution,
    false,
    lastPrice
  );
  const optimized = buildSimulationSummary(
    schedule,
    settings.baseContribution,
    true,
    lastPrice
  );
  const performanceDeltaPct =
    standard.endingValue > 0
      ? ((optimized.endingValue - standard.endingValue) /
          standard.endingValue) *
        100
      : 0;

  return {
    history: windowedHistory,
    maSeries,
    metricsSeries,
    schedule,
    simulation: {
      standard,
      optimized,
      performanceDeltaPct,
      schedule,
    },
  };
};
