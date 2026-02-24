"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  Allocation,
  AssetType,
  Holding,
  MarketRegimeSummary,
  PriceMap,
} from "@/lib/types";
import {
  defaultAllocations,
  defaultHoldings,
  defaultPriceMap,
} from "@/lib/mock-data";
import {
  DcaSettings,
  PricePoint,
  computeBuyQualityScore,
  mapScoreToMultiplier,
  runDcaEngine,
} from "@/lib/dca/engine";
import { useLocalStorageState } from "@/lib/use-local-storage";
import MarketStatusPanel from "@/components/MarketStatusPanel";
import WeeklyStockChart from "@/components/WeeklyStockChart";

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const downsampleIndexes = (total: number, maxPoints: number) => {
  if (total <= 0) return [];
  if (total <= maxPoints) return Array.from({ length: total }, (_, i) => i);
  const step = (total - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) =>
    Math.min(total - 1, Math.round(i * step))
  );
};

const defaultDcaSettings: DcaSettings = {
  frequency: "monthly",
  baseContribution: 500,
  startDate: "",
  endDate: "",
  minScoreAction: "minimum",
  minMultiplier: 0.25,
  highMultiplierMin: 1.5,
  highMultiplierMax: 2,
  lookbackYears: undefined,
};

const scoreToRegime = (score: number) => {
  if (score >= 80) return "heavy";
  if (score >= 60) return "normal";
  if (score >= 40) return "light";
  return "minimum";
};

const regimeColor = (regime: string) => {
  switch (regime) {
    case "heavy":
      return "rgba(15,107,93,0.12)";
    case "normal":
      return "rgba(15,107,93,0.08)";
    case "light":
      return "rgba(208,129,58,0.1)";
    default:
      return "rgba(179,59,46,0.09)";
  }
};

type HistoryState = {
  status: "idle" | "loading" | "ready" | "missing" | "error";
  rows: PricePoint[];
  error?: string;
};

type GuidanceRow = {
  assetId: string;
  assetType: AssetType;
  status: HistoryState["status"];
  latestPrice?: number;
  score?: number;
  avgScore?: number;
  label?: string;
  multiplier?: number;
  warning?: string;
};

type DetailState = {
  assetId: string;
  assetType: AssetType;
  history: PricePoint[];
};

const buildAccumulationLabel = (
  score: number
): { label: string; multiplier: number } => {
  const multiplier = mapScoreToMultiplier(score);
  if (score >= 80) return { label: "heavy", multiplier };
  if (score >= 60) return { label: "normal", multiplier };
  if (score >= 40) return { label: "light", multiplier };
  return { label: "minimum", multiplier };
};

export default function MarketMonitorPage() {
  const [allocations] = useLocalStorageState<Allocation[]>(
    "allocations",
    defaultAllocations
  );
  const [holdings] = useLocalStorageState<Holding[]>(
    "holdings",
    defaultHoldings
  );
  const [priceMap] = useLocalStorageState<PriceMap>(
    "prices",
    defaultPriceMap
  );
  const [settings, setSettings] = useLocalStorageState<DcaSettings>(
    "dca-settings",
    defaultDcaSettings
  );
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryState>>({});
  const [detailAsset, setDetailAsset] = useState<DetailState | null>(null);
  const [detailHoverIndex, setDetailHoverIndex] = useState<number | null>(null);
  const [showBacktest, setShowBacktest] = useState(false);
  const [backtestUseCostBias, setBacktestUseCostBias] = useState(true);
  const [backtestTotalCapital, setBacktestTotalCapital] = useState(25000);
  const [backtestBaselineFrequency, setBacktestBaselineFrequency] = useState<
    "daily" | "weekly" | "bi-weekly" | "monthly"
  >("monthly");
  const [marketSummary, setMarketSummary] = useState<MarketRegimeSummary | null>(
    null
  );
  const [marketSummaryWarning, setMarketSummaryWarning] = useState<string | null>(
    null
  );

  const normalizedSettings = useMemo(
    () => ({
      ...settings,
      startDate: settings.startDate || undefined,
      endDate: settings.endDate || undefined,
    }),
    [settings]
  );

  const trackedAssets = useMemo(
    () =>
      allocations.filter(
        (asset) =>
          asset.asset_type !== "cash" &&
          asset.asset_id &&
          asset.asset_id.trim().length > 0
      ),
    [allocations]
  );

  const allocationMap = useMemo(() => {
    const map = new Map<string, Allocation>();
    allocations.forEach((allocation) => map.set(allocation.asset_id, allocation));
    return map;
  }, [allocations]);

  const otherHoldingsValue = useMemo(() => {
    return holdings.reduce((sum, holding) => {
      if (detailAsset && holding.asset_id === detailAsset.assetId) return sum;
      return sum + holding.shares * (priceMap[holding.asset_id] ?? 0);
    }, 0);
  }, [holdings, priceMap, detailAsset]);

  useEffect(() => {
    let cancelled = false;
    const loadMarketSummary = async () => {
      try {
        const response = await fetch("/api/market-regime/current");
        if (!response.ok) {
          if (!cancelled) {
            setMarketSummary(null);
            setMarketSummaryWarning(
              response.status === 404
                ? "No market metrics found. Run price import."
                : "Market data unavailable"
            );
          }
          return;
        }
        const payload = (await response.json()) as MarketRegimeSummary;
        if (!cancelled) {
          setMarketSummary(payload);
          setMarketSummaryWarning(null);
        }
      } catch {
        if (!cancelled) {
          setMarketSummary(null);
          setMarketSummaryWarning("Market data unavailable");
        }
      }
    };
    void loadMarketSummary();
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    if (!trackedAssets.length) return;

    const controller = new AbortController();

    const loadHistories = async () => {
      const updates: Record<string, HistoryState> = {};
      trackedAssets.forEach((asset) => {
        updates[asset.asset_id] = {
          status: "loading",
          rows: [],
        };
      });
      setHistoryMap((prev) => ({ ...prev, ...updates }));

      await Promise.all(
        trackedAssets.map(async (asset) => {
          const assetId = asset.asset_id.trim();
          try {
            const response = await fetch(
              `/api/dca/history/${encodeURIComponent(assetId)}`
            );
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.error ?? "Failed to load history.");
            }
            const payload = (await response.json()) as {
              rows?: PricePoint[];
            };
            const rows = payload.rows ?? [];
            if (!rows.length) {
              updates[asset.asset_id] = {
                status: "missing",
                rows: [],
                error: "No price history found in the centralized database.",
              };
              return;
            }
            updates[asset.asset_id] = {
              status: "ready",
              rows,
            };
          } catch (error) {
            updates[asset.asset_id] = {
              status: "error",
              rows: [],
              error: error instanceof Error ? error.message : "Failed to load history.",
            };
          }
        })
      );

      if (!controller.signal.aborted) {
        setHistoryMap((prev) => ({ ...prev, ...updates }));
      }
    };

    void loadHistories();

    return () => controller.abort();
  }, [trackedAssets]);

  const guidanceRows: GuidanceRow[] = useMemo(() => {
    return trackedAssets.map((asset) => {
      const historyState = historyMap[asset.asset_id];
      if (!historyState || historyState.status === "loading") {
        return {
          assetId: asset.asset_id,
          assetType: asset.asset_type,
          status: "loading",
          warning: "Loading price history...",
        };
      }
      if (historyState.status === "missing" || historyState.status === "error") {
        return {
          assetId: asset.asset_id,
          assetType: asset.asset_type,
          status: historyState.status,
          warning: historyState.error,
        };
      }
      if (!historyState.rows.length) {
        return {
          assetId: asset.asset_id,
          assetType: asset.asset_type,
          status: "missing",
          warning: "No price history found in the centralized database.",
        };
      }

      const engine = runDcaEngine(
        historyState.rows,
        asset.asset_type,
        normalizedSettings,
        marketSummary
          ? { regime: marketSummary.regime, assetId: asset.asset_id }
          : undefined
      );
      const latestIndex = engine.history.length - 1;
      const latestPrice = engine.history[latestIndex]?.close;
      const score = engine.metricsSeries[latestIndex]?.score ?? 0;
      const avgScore =
        engine.metricsSeries.reduce((sum, metric) => sum + metric.score, 0) /
        Math.max(1, engine.metricsSeries.length);
      const { label, multiplier } = buildAccumulationLabel(score);

      return {
        assetId: asset.asset_id,
        assetType: asset.asset_type,
        status: "ready",
        latestPrice,
        score,
        avgScore,
        label,
        multiplier,
      };
    });
  }, [trackedAssets, historyMap, normalizedSettings, marketSummary]);

  const detailEngine = useMemo(() => {
    if (!detailAsset) return null;
    return runDcaEngine(
      detailAsset.history,
      detailAsset.assetType,
      normalizedSettings,
      marketSummary
        ? { regime: marketSummary.regime, assetId: detailAsset.assetId }
        : undefined
    );
  }, [detailAsset, normalizedSettings, marketSummary]);

  const detailChartWidth = 880;
  const detailChartHeight = 360;

  const detailLookbackRange = useMemo(() => {
    if (!detailEngine || !detailEngine.history.length) return null;
    return {
      start: detailEngine.history[0].date,
      end: detailEngine.history[detailEngine.history.length - 1].date,
      count: detailEngine.history.length,
    };
  }, [detailEngine]);

  const detailChart = useMemo(() => {
    if (!detailEngine) return null;
    const total = detailEngine.history.length;
    if (!total) return null;
    const indices = downsampleIndexes(total, 260);
    const prices = indices.map((index) => detailEngine.history[index].close);
    const maSeries = indices.map((index) => detailEngine.maSeries[index]);
    const scores = indices.map((index) => detailEngine.metricsSeries[index].score);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { indices, prices, maSeries, scores, min, max, total };
  }, [detailEngine]);

  const detailRegimes = useMemo(() => {
    if (!detailEngine) return [];
    const regimes = detailEngine.metricsSeries.map((item) =>
      scoreToRegime(item.score)
    );
    if (!regimes.length) return [];
    const segments: { start: number; end: number; regime: string }[] = [];
    let current = regimes[0];
    let start = 0;
    for (let i = 1; i < regimes.length; i += 1) {
      if (regimes[i] !== current) {
        segments.push({ start, end: i - 1, regime: current });
        current = regimes[i];
        start = i;
      }
    }
    segments.push({ start, end: regimes.length - 1, regime: current });
    const minSpan = 28;
    const smoothed: typeof segments = [];
    segments.forEach((segment) => {
      if (!smoothed.length) {
        smoothed.push({ ...segment });
        return;
      }
      const span = segment.end - segment.start + 1;
      if (span < minSpan) {
        smoothed[smoothed.length - 1].end = segment.end;
      } else {
        smoothed.push({ ...segment });
      }
    });
    return smoothed;
  }, [detailEngine]);

  const detailPricePath = useMemo(() => {
    if (!detailChart) return "";
    const { min, max, total, indices } = detailChart;
    const span = max - min || 1;
    const points: string[] = [];
    detailChart.prices.forEach((value, index) => {
      const sourceIndex = indices[index];
      const x = (sourceIndex / (total - 1)) * detailChartWidth;
      const y = detailChartHeight - ((value - min) / span) * detailChartHeight;
      points.push(`${points.length ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return points.join(" ");
  }, [detailChart, detailChartHeight, detailChartWidth]);

  const detailMaPath = useMemo(() => {
    if (!detailChart) return "";
    const { min, max, total, indices } = detailChart;
    const span = max - min || 1;
    const points: string[] = [];
    detailChart.maSeries.forEach((value, index) => {
      if (value == null) return;
      const sourceIndex = indices[index];
      const x = (sourceIndex / (total - 1)) * detailChartWidth;
      const y = detailChartHeight - ((value - min) / span) * detailChartHeight;
      points.push(`${points.length ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return points.join(" ");
  }, [detailChart, detailChartHeight, detailChartWidth]);

  const detailSchedule = detailEngine?.schedule ?? [];
  const detailMaxAllocation = Math.max(
    ...detailSchedule.map((entry) =>
      Math.max(entry.allocation, settings.baseContribution)
    ),
    1
  );

  const latestDetailPoint = detailEngine
    ? detailEngine.history[detailEngine.history.length - 1]
    : null;
  const latestDetailMetrics = detailEngine
    ? detailEngine.metricsSeries[detailEngine.metricsSeries.length - 1]
    : null;
  const latestDetailRegime = latestDetailMetrics
    ? scoreToRegime(latestDetailMetrics.score)
    : null;
  const latestDetailPrice = latestDetailPoint?.close ?? null;

  const regimeThresholds = useMemo(() => {
    if (!detailEngine || !latestDetailMetrics || latestDetailPrice == null) {
      return null;
    }
    const history = detailEngine.history;
    if (!history.length) return null;
    const lastDate = history[history.length - 1].date;
    const cutoffMs = new Date(`${lastDate}T00:00:00Z`).getTime() - 365 * 24 * 60 * 60 * 1000;
    const high52Values = history
      .filter((point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoffMs)
      .map((point) => point.close);
    if (!high52Values.length) return null;
    const high52 = Math.max(...high52Values);
    const ath = Math.max(...history.map((point) => point.close));
    const ma = detailEngine.maSeries[detailEngine.maSeries.length - 1];
    if (!Number.isFinite(high52) || !Number.isFinite(ath) || !ma) return null;

    const forwardReturnAvgPct = latestDetailMetrics.forwardReturnAvgPct;
    const volatilityPercentile = latestDetailMetrics.volatilityPercentile;

    const scoreAtPrice = (price: number) => {
      const dd52 = ((high52 - price) / high52) * 100;
      const ddAth = ((ath - price) / ath) * 100;
      const drawdownSeverity = Math.max(Math.max(dd52, ddAth), 0);
      const maDistanceBelow = Math.max(((ma - price) / ma) * 100, 0);
      return computeBuyQualityScore({
        drawdownSeverity,
        maDistanceBelow,
        forwardReturnAvgPct,
        volatilityPercentile,
      });
    };

    const solveForScore = (target: number) => {
      let low = Math.max(latestDetailPrice * 0.2, 0.01);
      let high = Math.max(latestDetailPrice * 2, ath * 1.1, ma * 1.1);
      let lowScore = scoreAtPrice(low);
      let highScore = scoreAtPrice(high);
      let iterations = 0;
      while (lowScore < target && iterations < 10) {
        low *= 0.6;
        lowScore = scoreAtPrice(low);
        iterations += 1;
      }
      iterations = 0;
      while (highScore > target && iterations < 10) {
        high *= 1.4;
        highScore = scoreAtPrice(high);
        iterations += 1;
      }
      if (lowScore < target || highScore > target) return null;
      for (let i = 0; i < 32; i += 1) {
        const mid = (low + high) / 2;
        const midScore = scoreAtPrice(mid);
        if (midScore >= target) {
          low = mid;
        } else {
          high = mid;
        }
      }
      return (low + high) / 2;
    };

    return {
      80: solveForScore(80),
      60: solveForScore(60),
      40: solveForScore(40),
    };
  }, [detailEngine, latestDetailMetrics, latestDetailPrice]);

  const hoverPoint =
    detailEngine && detailHoverIndex != null
      ? detailEngine.history[detailHoverIndex]
      : null;
  const hoverMetrics =
    detailEngine && detailHoverIndex != null
      ? detailEngine.metricsSeries[detailHoverIndex]
      : null;
  const backtestResult = useMemo(() => {
    if (!showBacktest || !detailEngine) return null;
    const schedule = detailEngine.schedule;
    if (schedule.length < 1) {
      return {
        error:
          "Insufficient price history to run a backtest. Need at least one scheduled contribution date within the lookback window.",
      };
    }
    if (!backtestTotalCapital || backtestTotalCapital <= 0) {
      return { error: "Total capital must be greater than zero." };
    }

    const allocation = allocationMap.get(detailAsset?.assetId ?? "");
    const targetWeight = allocation?.target_weight ?? 0;

    const baselineSchedule = runDcaEngine(
      detailEngine.history,
      detailAsset?.assetType ?? "stock",
      { ...normalizedSettings, frequency: backtestBaselineFrequency },
      marketSummary
        ? { regime: marketSummary.regime, assetId: detailAsset?.assetId ?? "" }
        : undefined
    ).schedule;
    if (!baselineSchedule.length) {
      return { error: "Baseline schedule has no dates in the lookback window." };
    }

    const baselineAmount = backtestTotalCapital / baselineSchedule.length;
    let baselineInvested = 0;
    let baselineUnits = 0;
    baselineSchedule.forEach((entry) => {
      baselineInvested += baselineAmount;
      baselineUnits += baselineAmount / entry.price;
    });

    let optimizedInvested = 0;
    let optimizedUnits = 0;
    let remainingCapital = backtestTotalCapital;

    schedule.forEach((entry, index) => {
      const price = entry.price;
      const priceFactor = mapScoreToMultiplier(entry.metrics.score);
      const assetValue = optimizedUnits * price;
      const portfolioValue = otherHoldingsValue + assetValue;
      const currentWeight =
        portfolioValue > 0 ? (assetValue / portfolioValue) * 100 : 0;
      const exposureGap = targetWeight - currentWeight;
      const exposureFactor =
        exposureGap >= 5
          ? 1.25
          : exposureGap >= 2
          ? 1.0
          : exposureGap > -2
          ? 0.75
          : 0.25;

      const avgCost = optimizedUnits > 0 ? optimizedInvested / optimizedUnits : 0;
      const costDistance = avgCost > 0 ? (price - avgCost) / avgCost : 0;
      const costBiasFactor = backtestUseCostBias
        ? costDistance <= -0.3
          ? 0.8
          : costDistance <= -0.1
          ? 0.9
          : costDistance <= 0.3
          ? 1.0
          : costDistance <= 1.0
          ? 0.9
          : 0.8
        : 1.0;

      let optimizedAmount =
        baselineAmount * priceFactor * exposureFactor * costBiasFactor;
      if (exposureGap > 0 && portfolioValue > 0) {
        const remainingExposureValue = (portfolioValue * exposureGap) / 100;
        if (remainingExposureValue > 0) {
          optimizedAmount = Math.min(optimizedAmount, remainingExposureValue);
        }
      }
      if (index === schedule.length - 1) {
        optimizedAmount = remainingCapital;
      }
      optimizedAmount = Math.min(optimizedAmount, remainingCapital);
      optimizedInvested += optimizedAmount;
      optimizedUnits += optimizedAmount / price;
      remainingCapital -= optimizedAmount;
    });

    if (Math.abs(backtestTotalCapital - optimizedInvested) > 0.01) {
      return { error: "Capital reconciliation failed for optimized DCA." };
    }

    const lastPrice = schedule[schedule.length - 1].price;
    const baselineValue = baselineUnits * lastPrice;
    const optimizedValue = optimizedUnits * lastPrice;
    const years =
      (new Date(schedule[schedule.length - 1].date).getTime() -
        new Date(schedule[0].date).getTime()) /
      (365 * 24 * 60 * 60 * 1000);
    const baselineCagr =
      years > 0 && baselineInvested > 0
        ? (baselineValue / baselineInvested) ** (1 / years) - 1
        : 0;
    const optimizedCagr =
      years > 0 && optimizedInvested > 0
        ? (optimizedValue / optimizedInvested) ** (1 / years) - 1
        : 0;
    const deltaPct =
      baselineValue > 0
        ? ((optimizedValue - baselineValue) / baselineValue) * 100
        : 0;

    return {
      baseline: {
        capital: backtestTotalCapital,
        units: baselineUnits,
        avgCost: baselineUnits > 0 ? baselineInvested / baselineUnits : 0,
        endingValue: baselineValue,
        cagr: baselineCagr,
      },
      optimized: {
        capital: backtestTotalCapital,
        units: optimizedUnits,
        avgCost: optimizedUnits > 0 ? optimizedInvested / optimizedUnits : 0,
        endingValue: optimizedValue,
        cagr: optimizedCagr,
      },
      deltaPct,
    };
  }, [
    showBacktest,
    detailEngine,
    normalizedSettings,
    allocationMap,
    detailAsset,
    otherHoldingsValue,
    backtestUseCostBias,
    backtestTotalCapital,
    backtestBaselineFrequency,
    marketSummary,
  ]);


  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,107,93,0.22),_transparent_70%)]" />
        <div className="absolute -bottom-52 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(208,129,58,0.22),_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.9),rgba(255,255,255,0.2))]" />
        <div className="absolute inset-0 opacity-60 mix-blend-multiply [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_26px,rgba(214,206,196,0.2)_27px,rgba(214,206,196,0.2)_28px)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 py-10 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Regime + Deployment
            </span>
            <h1 className="font-display text-3xl text-[color:var(--ink)] md:text-4xl">
              Market Monitor
            </h1>
            <p className="text-sm text-[color:var(--muted)] md:text-base">
              Macro regime awareness + disciplined capital deployment
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-[color:var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
            >
              Home
            </Link>
          </div>
        </header>

        <section className="grid min-h-[45vh] gap-4 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
          <div>
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Market Status
            </h2>
            <p className="text-xs text-[color:var(--muted)]">
              Regime engine output and key macro metrics.
            </p>
          </div>
          <MarketStatusPanel
            summary={marketSummary}
            fallbackMessage={marketSummaryWarning ?? "Market data unavailable"}
          />
        </section>

        <section className="grid gap-4 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
          <div>
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Weekly Market Structure
            </h2>
            <p className="text-xs text-[color:var(--muted)]">
              Daily history aggregated to weekly candlesticks with 50W and 200W moving averages.
            </p>
          </div>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[color:var(--muted)]">
                SPY Weekly Chart
              </h3>
              <WeeklyStockChart ticker="SPY" />
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[color:var(--muted)]">
                QQQ Weekly Chart
              </h3>
              <WeeklyStockChart ticker="QQQ" />
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[color:var(--muted)]">
                IWM Weekly Chart
              </h3>
              <WeeklyStockChart ticker="IWM" />
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-[color:var(--line)]" />

        <section className="grid gap-2">
          <h2 className="font-display text-xl text-[color:var(--ink)]">
            DCA Execution
          </h2>
          <p className="text-xs text-[color:var(--muted)]">
            Existing DCA controls and results.
          </p>
        </section>

        <section className="grid gap-4 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl text-[color:var(--ink)]">
                Live DCA Guidance
              </h2>
              <p className="text-xs text-[color:var(--muted)]">
                Computed from the centralized price history database. If history
                is missing, guidance is disabled until data is available.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {guidanceRows.map((row) => (
              <div
                key={row.assetId}
                className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-xs text-[color:var(--muted)] md:grid-cols-[1.2fr_repeat(5,_1fr)]"
              >
                <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Asset
                </div>
                  <button
                    onClick={() => {
                      const historyState = historyMap[row.assetId];
                      if (historyState?.status !== "ready") return;
                      setDetailAsset({
                        assetId: row.assetId,
                        assetType: row.assetType,
                        history: historyState.rows,
                      });
                    }}
                    className="mt-1 text-left text-base font-semibold text-[color:var(--ink)] underline decoration-[color:var(--line)] decoration-2 underline-offset-4"
                  >
                    {row.assetId}
                  </button>
                  <div className="text-[10px] uppercase tracking-[0.2em]">
                    {row.assetType}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Current Price
                  </div>
                  <div className="mt-1 text-[color:var(--ink)]">
                    {row.latestPrice ? formatCurrency(row.latestPrice) : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Buy Quality Score
                  </div>
                  <div
                    className="mt-1 text-[color:var(--ink)]"
                    title="Measures how favorable today’s price is for long-term accumulation based on historical patterns. Not a prediction or trading signal."
                  >
                    {row.score != null ? row.score.toFixed(0) : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Avg Score (Lookback)
                  </div>
                  <div className="mt-1 text-[color:var(--ink)]">
                    {row.avgScore != null ? row.avgScore.toFixed(0) : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Accumulation Label
                  </div>
                  <div className="mt-1 text-[color:var(--ink)]">
                    {row.label ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Suggested Multiplier
                  </div>
                  <div className="mt-1 text-[color:var(--ink)]">
                    {row.multiplier != null ? `${row.multiplier.toFixed(2)}x` : "-"}
                  </div>
                </div>
                {(row.status === "missing" ||
                  row.status === "error" ||
                  row.status === "loading") && (
                  <div className="md:col-span-6 rounded-xl border border-[color:var(--danger)] bg-white/80 px-3 py-2 text-[color:var(--danger)]">
                    {row.warning ?? "History unavailable."}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {detailAsset && detailEngine && detailChart && (
          <section className="grid gap-4 rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-xl text-[color:var(--ink)]">
                  {detailAsset.assetId} Accumulation Detail
                </h3>
                <p className="text-xs text-[color:var(--muted)]">
                  Historical price, long-term moving average, and DCA accumulation
                  overlays derived from Buy Quality Score.
                </p>
              </div>
              <button
                onClick={() => setDetailAsset(null)}
                className="rounded-full border border-[color:var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
              >
                Close
              </button>
            </div>

            <div className="overflow-x-auto">
              <svg
                width={detailChartWidth}
                height={detailChartHeight}
                viewBox={`0 0 ${detailChartWidth} ${detailChartHeight}`}
                className="rounded-2xl border border-[color:var(--line)] bg-white"
                onMouseLeave={() => setDetailHoverIndex(null)}
                onMouseMove={(event) => {
                  if (!detailEngine || !detailChart) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - rect.left;
                  const ratio = Math.min(Math.max(x / detailChartWidth, 0), 1);
                  const index = Math.round(ratio * (detailChart.total - 1));
                  setDetailHoverIndex(index);
                }}
              >
                {detailRegimes.map((segment) => {
                  const startX =
                    (segment.start / (detailChart.total - 1)) * detailChartWidth;
                  const endX =
                    (segment.end / (detailChart.total - 1)) * detailChartWidth;
                  return (
                    <rect
                      key={`regime-${segment.start}-${segment.end}`}
                      x={startX}
                      y={0}
                      width={Math.max(endX - startX, 1)}
                      height={detailChartHeight}
                      fill={regimeColor(segment.regime)}
                    />
                  );
                })}
                <path
                  d={detailPricePath}
                  fill="none"
                  stroke="#1c1b19"
                  strokeWidth={2.6}
                />
                <path
                  d={detailMaPath}
                  fill="none"
                  stroke="#0f6b5d"
                  strokeWidth={1.5}
                  strokeDasharray="6 6"
                  opacity={0.7}
                />
                {detailChart && (
                  <g>
                    {[0, 1, 2, 3, 4].map((tick) => {
                      const y = detailChartHeight - (tick / 4) * detailChartHeight;
                      const value =
                        detailChart.min +
                        (tick / 4) * (detailChart.max - detailChart.min);
                      return (
                        <g key={`y-tick-${tick}`}>
                          <line
                            x1={0}
                            y1={y}
                            x2={detailChartWidth}
                            y2={y}
                            stroke="rgba(28,27,25,0.06)"
                          />
                          <text
                            x={detailChartWidth - 6}
                            y={y - 4}
                            textAnchor="end"
                            fill="rgba(28,27,25,0.5)"
                            fontSize="10"
                            fontFamily="var(--font-space-grotesk)"
                          >
                            {formatCurrency(value)}
                          </text>
                        </g>
                      );
                    })}
                    {[0, 0.5, 1].map((tick, index) => {
                      const x = tick * detailChartWidth;
                      const idx = Math.round(tick * (detailChart.total - 1));
                      const date = detailEngine?.history[idx]?.date ?? "";
                      return (
                        <text
                          key={`x-tick-${index}`}
                          x={x}
                          y={detailChartHeight - 6}
                          textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"}
                          fill="rgba(28,27,25,0.5)"
                          fontSize="10"
                          fontFamily="var(--font-space-grotesk)"
                        >
                          {date}
                        </text>
                      );
                    })}
                  </g>
                )}
                {hoverPoint && hoverMetrics && (
                  <>
                    <line
                      x1={(detailHoverIndex ?? 0) / (detailChart.total - 1) * detailChartWidth}
                      y1={0}
                      x2={(detailHoverIndex ?? 0) / (detailChart.total - 1) * detailChartWidth}
                      y2={detailChartHeight}
                      stroke="rgba(28,27,25,0.2)"
                      strokeDasharray="3 6"
                    />
                    <line
                      x1={0}
                      y1={
                        detailChartHeight -
                        ((hoverPoint.close - detailChart.min) /
                          (detailChart.max - detailChart.min || 1)) *
                          detailChartHeight
                      }
                      x2={detailChartWidth}
                      y2={
                        detailChartHeight -
                        ((hoverPoint.close - detailChart.min) /
                          (detailChart.max - detailChart.min || 1)) *
                          detailChartHeight
                      }
                      stroke="rgba(28,27,25,0.18)"
                      strokeDasharray="3 6"
                    />
                    <g>
                      <rect
                        x={detailChartWidth - 92}
                        y={
                          detailChartHeight -
                          ((hoverPoint.close - detailChart.min) /
                            (detailChart.max - detailChart.min || 1)) *
                            detailChartHeight -
                          12
                        }
                        width={88}
                        height={20}
                        rx={10}
                        fill="rgba(28,27,25,0.85)"
                      />
                      <text
                        x={detailChartWidth - 48}
                        y={
                          detailChartHeight -
                          ((hoverPoint.close - detailChart.min) /
                            (detailChart.max - detailChart.min || 1)) *
                            detailChartHeight +
                          2
                        }
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontFamily="var(--font-space-grotesk)"
                      >
                        {formatCurrency(hoverPoint.close)}
                      </text>
                    </g>
                    <g>
                      <rect
                        x={
                          (detailHoverIndex ?? 0) /
                            (detailChart.total - 1) *
                            detailChartWidth -
                          44
                        }
                        y={detailChartHeight - 22}
                        width={88}
                        height={18}
                        rx={9}
                        fill="rgba(28,27,25,0.85)"
                      />
                      <text
                        x={
                          (detailHoverIndex ?? 0) /
                          (detailChart.total - 1) *
                          detailChartWidth
                        }
                        y={detailChartHeight - 9}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontFamily="var(--font-space-grotesk)"
                      >
                        {hoverPoint.date}
                      </text>
                    </g>
                    <circle
                      cx={
                        (detailHoverIndex ?? 0) /
                        (detailChart.total - 1) *
                        detailChartWidth
                      }
                      cy={
                        detailChartHeight -
                        ((hoverPoint.close - detailChart.min) /
                          (detailChart.max - detailChart.min || 1)) *
                          detailChartHeight
                      }
                      r={4}
                      fill="rgba(28,27,25,0.9)"
                    />
                  </>
                )}
                {detailSchedule.map((entry, index) => {
                  const x =
                    (entry.index / (detailChart.total - 1)) * detailChartWidth;
                  const y =
                    detailChartHeight -
                    ((entry.price - detailChart.min) /
                      (detailChart.max - detailChart.min || 1)) *
                      detailChartHeight;
                  const radius =
                    3 + 7 * (entry.allocation / detailMaxAllocation);
                  const regime = scoreToRegime(entry.metrics.score);
                  const fill = regimeColor(regime).replace("0.12", "0.65");
                  return (
                    <circle
                      key={`detail-marker-${index}`}
                      cx={x}
                      cy={y}
                      r={radius}
                      fill={fill}
                    >
                      <title>
                        {entry.date} | Price {formatCurrency(entry.price)} | Score{" "}
                        {entry.metrics.score.toFixed(0)} | Regime {regime} | Multiplier{" "}
                        {entry.multiplier.toFixed(2)}x
                      </title>
                    </circle>
                  );
                })}
                {latestDetailPoint && latestDetailMetrics && (
                  <>
                    <line
                      x1={
                        (detailEngine.history.length - 1) /
                        (detailChart.total - 1) *
                        detailChartWidth
                      }
                      y1={0}
                      x2={
                        (detailEngine.history.length - 1) /
                        (detailChart.total - 1) *
                        detailChartWidth
                      }
                      y2={detailChartHeight}
                      stroke="rgba(28,27,25,0.25)"
                      strokeDasharray="4 6"
                    />
                    <circle
                      cx={
                        (detailEngine.history.length - 1) /
                        (detailChart.total - 1) *
                        detailChartWidth
                      }
                      cy={
                        detailChartHeight -
                        ((latestDetailPoint.close - detailChart.min) /
                          (detailChart.max - detailChart.min || 1)) *
                          detailChartHeight
                      }
                      r={6}
                      fill="rgba(15,107,93,0.8)"
                    >
                      <title>
                        Current {latestDetailPoint.date} | Price{" "}
                        {formatCurrency(latestDetailPoint.close)} | Score{" "}
                        {latestDetailMetrics.score.toFixed(0)} | Regime{" "}
                        {latestDetailRegime} | Multiplier{" "}
                        {mapScoreToMultiplier(latestDetailMetrics.score).toFixed(2)}x
                      </title>
                    </circle>
                    <text
                      x={
                        (detailEngine.history.length - 1) /
                          (detailChart.total - 1) *
                          detailChartWidth -
                        6
                      }
                      y={18}
                      textAnchor="end"
                      fill="#1c1b19"
                      fontSize="10"
                      fontFamily="var(--font-space-grotesk)"
                    >
                      Today
                    </text>
                    <g>
                      <rect
                        x={detailChartWidth - 88}
                        y={
                          detailChartHeight -
                          ((latestDetailPoint.close - detailChart.min) /
                            (detailChart.max - detailChart.min || 1)) *
                            detailChartHeight -
                          12
                        }
                        width={84}
                        height={20}
                        rx={10}
                        fill="rgba(28,27,25,0.85)"
                      />
                      <text
                        x={detailChartWidth - 46}
                        y={
                          detailChartHeight -
                          ((latestDetailPoint.close - detailChart.min) /
                            (detailChart.max - detailChart.min || 1)) *
                            detailChartHeight +
                          2
                        }
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontFamily="var(--font-space-grotesk)"
                      >
                        {formatCurrency(latestDetailPoint.close)}
                      </text>
                    </g>
                    <g>
                      <rect
                        x={
                          (detailEngine.history.length - 1) /
                            (detailChart.total - 1) *
                            detailChartWidth -
                          44
                        }
                        y={detailChartHeight - 22}
                        width={88}
                        height={18}
                        rx={9}
                        fill="rgba(28,27,25,0.85)"
                      />
                      <text
                        x={
                          (detailEngine.history.length - 1) /
                            (detailChart.total - 1) *
                            detailChartWidth
                        }
                        y={detailChartHeight - 9}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontFamily="var(--font-space-grotesk)"
                      >
                        {latestDetailPoint.date}
                      </text>
                    </g>
                  </>
                )}
              </svg>
            </div>

            {latestDetailMetrics && latestDetailRegime && (
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-xs text-[color:var(--muted)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[color:var(--ink)]">
                    Buy Quality Score
                  </span>
                  <span
                    className="text-[color:var(--ink)]"
                    title="Measures how favorable today’s price is for long-term accumulation based on historical patterns. Not a prediction or trading signal."
                  >
                    {latestDetailMetrics.score.toFixed(0)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[color:var(--muted)]">
                  {[
                    { range: "80-100", meaning: "Historically strong accumulation conditions" },
                    { range: "60-79", meaning: "Normal accumulation" },
                    { range: "40-59", meaning: "Stretched pricing, add cautiously" },
                    { range: "<40", meaning: "Expensive relative to history" },
                  ].map((row) => (
                    <span
                      key={row.range}
                      className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1"
                    >
                      <span className="font-semibold text-[color:var(--ink)]">
                        {row.range}
                      </span>{" "}
                      {row.meaning}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[color:var(--muted)]">
                  Today: regime {latestDetailRegime}, suggested multiplier{" "}
                  {mapScoreToMultiplier(latestDetailMetrics.score).toFixed(2)}x.
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-[color:var(--ink)]">
                    Historical Validation (Equal Capital)
                  </h4>
                  <p className="text-[11px] text-[color:var(--muted)]">
                    Compare baseline vs optimized DCA using equal total capital.
                  </p>
                  <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                    Historical validation is based on past prices and does not guarantee
                    future results.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Baseline
                    <select
                      value={backtestBaselineFrequency}
                      onChange={(event) =>
                        setBacktestBaselineFrequency(
                          event.target.value as
                            | "daily"
                            | "weekly"
                            | "bi-weekly"
                            | "monthly"
                        )
                      }
                      className="rounded-full border border-[color:var(--line)] bg-white px-2 py-1 text-[10px] text-[color:var(--ink)]"
                    >
                      <option value="daily">daily</option>
                      <option value="weekly">weekly</option>
                      <option value="bi-weekly">bi-weekly</option>
                      <option value="monthly">monthly</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Total Capital
                    <input
                      type="number"
                      value={backtestTotalCapital}
                      onChange={(event) =>
                        setBacktestTotalCapital(Number(event.target.value))
                      }
                      className="w-24 rounded-full border border-[color:var(--line)] bg-white px-2 py-1 text-[10px] text-[color:var(--ink)]"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Cost Bias
                    <input
                      type="checkbox"
                      checked={backtestUseCostBias}
                      onChange={(event) => setBacktestUseCostBias(event.target.checked)}
                    />
                  </label>
                  <button
                    onClick={() => setShowBacktest((prev) => !prev)}
                    className="rounded-full border border-[color:var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                  >
                    {showBacktest ? "Hide" : "Run Backtest"}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-[color:var(--muted)]">
                Baseline: {backtestBaselineFrequency} • Optimized:{" "}
                {normalizedSettings.frequency}
              </div>
              <div className="text-[10px] text-[color:var(--muted)]">
                Changing frequency recalculates results.
              </div>

              {showBacktest && backtestResult && "error" in backtestResult && (
                <div className="mt-3 rounded-xl border border-[color:var(--danger)] bg-white/80 px-3 py-2 text-[color:var(--danger)]">
                  {backtestResult.error}
                  {detailLookbackRange && (
                    <div className="mt-2 text-[11px] text-[color:var(--muted)]">
                      Lookback window {detailLookbackRange.start} to{" "}
                      {detailLookbackRange.end} ({detailLookbackRange.count} rows),
                      schedule count {detailEngine?.schedule.length ?? 0}.
                    </div>
                  )}
                </div>
              )}

              {showBacktest && backtestResult && !("error" in backtestResult) && (
                <div className="mt-4 grid gap-3 text-[11px] md:grid-cols-3">
                  {[
                    { label: "Baseline DCA", data: backtestResult.baseline },
                    { label: "Optimized DCA", data: backtestResult.optimized },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2"
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        {card.label}
                      </div>
                      <div className="mt-2 grid gap-1 text-[color:var(--ink)]">
                        <span title="Any unspent capital is deployed on the final contribution date.">
                          Total capital deployed (equal): {formatCurrency(card.data.capital)}
                        </span>
                        <span>Units {card.data.units.toFixed(3)}</span>
                        <span>Avg cost {formatCurrency(card.data.avgCost)}</span>
                        <span>CAGR {formatPercent(card.data.cagr * 100)}</span>
                        <span>Ending value {formatCurrency(card.data.endingValue)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                    <div
                      className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                      title="Difference in ending portfolio value using equal total capital and the same backtest window."
                    >
                      Ending Value Improvement vs Baseline
                    </div>
                    <div className="mt-2 text-[color:var(--ink)]">
                      {(() => {
                        const diff =
                          backtestResult.optimized.endingValue -
                          backtestResult.baseline.endingValue;
                        const sign = diff >= 0 ? "+" : "";
                        return `${sign}${formatCurrency(diff)} (${sign}${formatPercent(backtestResult.deltaPct)})`;
                      })()}
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--muted)]">
                      Positive means optimized ended higher than baseline.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-2 text-xs text-[color:var(--muted)] md:grid-cols-2">
              <div className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2">
                <span className="font-semibold text-[color:var(--ink)]">Price</span>{" "}
                line,{" "}
                <span className="text-[color:var(--accent)]">MA</span> dashed.
              </div>
              <div className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2">
                DCA markers scale by multiplier and inherit regime color.
              </div>
            </div>
            <div className="grid gap-2 text-xs text-[color:var(--muted)] md:grid-cols-4">
              {[
                {
                  regime: "heavy",
                  label: "Heavy (>= 80)",
                  color: "bg-[color:var(--accent)]",
                  threshold: regimeThresholds?.[80],
                },
                {
                  regime: "normal",
                  label: "Normal (60-79)",
                  color: "bg-[color:var(--accent-strong)]",
                  threshold: regimeThresholds?.[60],
                },
                {
                  regime: "light",
                  label: "Light (40-59)",
                  color: "bg-[color:var(--accent-2)]",
                  threshold: regimeThresholds?.[40],
                },
                {
                  regime: "minimum",
                  label: "Minimum (< 40)",
                  color: "bg-[color:var(--danger)]",
                  threshold: regimeThresholds?.[40],
                },
              ].map((item) => {
                const isActive = latestDetailRegime === item.regime;
                const distancePct =
                  item.threshold && latestDetailPrice != null
                    ? ((item.threshold - latestDetailPrice) / latestDetailPrice) * 100
                    : null;
                const thresholdText =
                  item.regime === "minimum"
                    ? item.threshold
                      ? `<= ${formatCurrency(item.threshold)}`
                      : "-"
                    : item.threshold
                    ? `~ ${formatCurrency(item.threshold)}`
                    : "-";
                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-3 py-2"
                    title="Estimated price assuming current conditions; not a forecast."
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${item.color}`} />
                      <span>{item.label}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                      {thresholdText}
                    </div>
                    {isActive && latestDetailPrice != null && (
                      <div className="mt-1 text-[11px] font-semibold text-[color:var(--ink)]">
                        current {formatCurrency(latestDetailPrice)}
                      </div>
                    )}
                    {distancePct != null && (
                      <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                        Distance: {distancePct >= 0 ? "+" : ""}
                        {distancePct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <div className="grid gap-4 rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
            <h3 className="font-display text-xl text-[color:var(--ink)]">
              Allocation Controls
            </h3>
            <div className="grid gap-3 text-xs text-[color:var(--muted)]">
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3">
                Buy Quality Score now maps to a fixed PriceFactor range
                (0.25x to 2.0x). Allocation controls are simplified.
              </div>
            </div>
            <details className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
              <summary className="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Advanced lookback settings
              </summary>
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1">
                  Rolling lookback (years)
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Auto (stocks 5y, crypto 4y)"
                    value={settings.lookbackYears ?? ""}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        lookbackYears: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      }))
                    }
                    className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  />
                </label>
                <div>
                  Rolling windows avoid long-history skew while keeping scores anchored
                  to recent cycles.
                </div>
              </div>
            </details>
          </div>

          <div className="grid gap-4 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
            <h3 className="font-display text-xl text-[color:var(--ink)]">
              Buy Quality Score Info
            </h3>
            <details className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
              <summary className="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                How the score is built
              </summary>
              <div className="mt-2 grid gap-1">
                <span>40% drawdown severity from 52-week and all-time highs</span>
                <span>30% distance below the long-term moving average</span>
                <span>20% average 6, 12, and 24-month forward returns</span>
                <span>10% volatility normalization over 3 to 5 years</span>
              </div>
            </details>
          </div>
        </section>

      </main>
    </div>
  );
}
