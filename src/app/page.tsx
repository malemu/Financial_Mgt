"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildProjectionScenarios,
  computeDrift,
  computePortfolioValue,
  computeWeightedCagr,
  evaluateGuardrails,
  latestNetWorth,
} from "@/lib/finance";
import { DcaSettings, runDcaEngine } from "@/lib/dca/engine";
import {
  buildTargetSeries,
  findGoalCrossing,
  runSimulation,
  solveMonthlyInjection,
} from "@/lib/simulation/netWorthSimulation";
import { validatePortfolio } from "@/lib/validation";
import AllocationPieChart from "@/components/AllocationPieChart";
import { useGoalState } from "@/hooks/useGoalState";
import { useNetWorthHistoryState } from "@/hooks/useNetWorthHistoryState";
import { useAllocationsState } from "@/hooks/useAllocationsState";
import { useHoldingsState } from "@/hooks/useHoldingsState";
import { usePriceMapState } from "@/hooks/usePriceMapState";
import {
  defaultAllocations,
  defaultGoal,
  defaultHoldings,
  defaultNetWorthHistory,
  defaultPriceMap,
  defaultTriggers,
  defaultAiActionHistory,
} from "@/lib/mock-data";
import { useLocalStorageState } from "@/lib/use-local-storage";
import {
  AiActionHistory,
  MarketRegimeSummary,
  MarketRegime,
  PositionAction,
  TriggerRule,
} from "@/lib/types";

type AnalystMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatTimestampUtc = (value: string) =>
  new Date(value).toLocaleString("en-US", { timeZone: "UTC" });

const chartLeftPad = 56;
const chartRightPad = 10;
const defaultDcaSettings: DcaSettings = {
  frequency: "monthly",
  baseContribution: 2500,
  startDate: "",
  endDate: "",
  minScoreAction: "minimum",
  minMultiplier: 0.25,
  highMultiplierMin: 1.5,
  highMultiplierMax: 2,
  lookbackYears: undefined,
};

const formatCompactCurrency = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${Math.round(value)}`;
};

const parseIsoDateUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

const addMonths = (isoDate: string, months: number) => {
  const date = parseIsoDateUtc(isoDate);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
};

const buildLinePath = (
  values: number[],
  width: number,
  height: number,
  totalPoints: number,
  offsetPoints: number,
  rangeMin: number,
  rangeMax: number
) => {
  if (values.length === 0) return "";
  const span = rangeMax - rangeMin || 1;
  return values
    .map((value, index) => {
      const x =
        ((index + offsetPoints) / (totalPoints - 1 || 1)) *
          (width - chartLeftPad - chartRightPad) +
        chartLeftPad;
      const y = height - ((value - rangeMin) / span) * (height - 20) - 10;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

const getChartPoint = (
  values: number[],
  index: number,
  width: number,
  height: number,
  totalPoints: number,
  offsetPoints: number,
  rangeMin: number,
  rangeMax: number
) => {
  if (!values.length) return { x: 0, y: 0 };
  const span = rangeMax - rangeMin || 1;
  const x =
    ((index + offsetPoints) / (totalPoints - 1 || 1)) *
      (width - chartLeftPad - chartRightPad) +
    chartLeftPad;
  const y = height - ((values[index] - rangeMin) / span) * (height - 20) - 10;
  return { x, y };
};

export default function Home() {
  const { goal, setGoal } = useGoalState(defaultGoal);
  const { allocations } = useAllocationsState(defaultAllocations);
  const { holdings } = useHoldingsState(defaultHoldings);
  const { priceMap } = usePriceMapState(defaultPriceMap);
  const [dcaSettings, setDcaSettings] = useLocalStorageState<DcaSettings>(
    "dca-settings",
    defaultDcaSettings
  );
  const [triggers, setTriggers] = useLocalStorageState<TriggerRule[]>(
    "triggers",
    defaultTriggers
  );
  const [aiActionHistory, setAiActionHistory] = useLocalStorageState<AiActionHistory[]>(
    "aiActionHistory",
    defaultAiActionHistory
  );
  const {
    netWorthHistory,
    appendPoint: persistNetWorthPoint,
    deletePoint: deleteNetWorthPoint,
  } = useNetWorthHistoryState(defaultNetWorthHistory);
  const [marketRegime, setMarketRegime] = useState<MarketRegime>("risk-on");
  const [autoMarketRegime, setAutoMarketRegime] = useLocalStorageState(
    "autoMarketRegime",
    true
  );
  const [computedRegime, setComputedRegime] = useState<{
    regime: MarketRegime;
    score: number | null;
    metrics: any | null;
    notes: string[];
  } | null>(null);
  const [marketRegimeStatus, setMarketRegimeStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [marketRegimeError, setMarketRegimeError] = useState<string | null>(
    null
  );
  const [marketCycleSummary, setMarketCycleSummary] =
    useState<MarketRegimeSummary | null>(null);
  const [convictionThreshold, setConvictionThreshold] = useState(4);
  const [dismissedDrift, setDismissedDrift] = useLocalStorageState<string[]>(
    "driftDismissed",
    []
  );
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [clientNowIso, setClientNowIso] = useState<string | null>(null);
  const [draftGoal, setDraftGoal] = useState({
    target_net_worth: goal.target_net_worth.toString(),
    target_year: goal.target_year.toString(),
  });
  useEffect(() => {
    setDraftGoal({
      target_net_worth: goal.target_net_worth.toString(),
      target_year: goal.target_year.toString(),
    });
  }, [goal.target_net_worth, goal.target_year]);
  const [draftContribution, setDraftContribution] = useState(
    dcaSettings.baseContribution.toString()
  );

  const portfolioValue = useMemo(
    () => computePortfolioValue(holdings, priceMap),
    [holdings, priceMap]
  );
  const totalNetWorth = portfolioValue;
  const drift = useMemo(
    () => computeDrift(allocations, holdings, priceMap),
    [allocations, holdings, priceMap]
  );
  const driftAlerts = drift.filter(
    (item) => !dismissedDrift.includes(item.asset_id)
  );
  const weightedCagr = useMemo(
    () => computeWeightedCagr(allocations),
    [allocations]
  );
  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    setClientNowIso(new Date().toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    setDraftContribution(dcaSettings.baseContribution.toString());
  }, [dcaSettings.baseContribution]);

  useEffect(() => {
    let mounted = true;
    const loadHistory = async () => {
      try {
        const response = await fetch("/api/storage/analyst_chat_history");
        if (!response.ok) return;
        const payload = (await response.json()) as { value?: AnalystMessage[] };
        if (mounted && Array.isArray(payload.value)) {
          setAnalystHistory(payload.value);
        }
      } catch {
        // Ignore history load failures.
      }
    };
    void loadHistory();
    return () => {
      mounted = false;
    };
  }, []);

  const persistAnalystHistory = async (next: AnalystMessage[]) => {
    await fetch("/api/storage/analyst_chat_history", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  };

  const yearsToTarget = Math.max(
    goal.target_year - (currentYear ?? goal.target_year),
    1
  );
  const projections = useMemo(
    () => buildProjectionScenarios(totalNetWorth, weightedCagr, yearsToTarget),
    [totalNetWorth, weightedCagr, yearsToTarget]
  );
  const [actions, setActions] = useState<PositionAction[]>([]);
  const [combinedSummaries, setCombinedSummaries] = useState<
    Record<string, string>
  >({});
  const [combinedFallbacks, setCombinedFallbacks] = useState<
    Record<string, string>
  >({});
  const [combinedSummaryStatus, setCombinedSummaryStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [combinedSummaryError, setCombinedSummaryError] = useState<string | null>(
    null
  );
  const [aiRunStatus, setAiRunStatus] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [aiRunError, setAiRunError] = useState<string | null>(null);
  const [aiLastRunAt, setAiLastRunAt] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [priceUpdateStatus, setPriceUpdateStatus] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [priceUpdateError, setPriceUpdateError] = useState<string | null>(null);
  const [priceUpdateResult, setPriceUpdateResult] = useState<any>(null);
  const [priceStatus, setPriceStatus] = useState<any[]>([]);
  const [priceStatusOpen, setPriceStatusOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadTicker, setUploadTicker] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [analystHistory, setAnalystHistory] = useState<AnalystMessage[]>([]);
  const [analystInput, setAnalystInput] = useState("");
  const [analystStatus, setAnalystStatus] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [analystError, setAnalystError] = useState<string | null>(null);
  const guardrails = useMemo(
    () => evaluateGuardrails(allocations, holdings, drift, actions),
    [allocations, holdings, drift, actions]
  );
  const allocationTypeMap = useMemo(
    () => new Map(allocations.map((allocation) => [allocation.asset_id, allocation.asset_type])),
    [allocations]
  );
  const allocationByClass = useMemo(() => {
    const totals: Record<string, number> = {};
    holdings.forEach((holding) => {
      const type = allocationTypeMap.get(holding.asset_id) ?? "unknown";
      const value = holding.shares * (priceMap[holding.asset_id] ?? 0);
      totals[type] = (totals[type] ?? 0) + value;
    });
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
    return Object.entries(totals).map(([type, value]) => ({
      type,
      value,
      weight: (value / total) * 100,
    }));
  }, [allocationTypeMap, holdings, priceMap]);
  const cashSummary = useMemo(() => {
    const cashHolding = holdings.find((holding) =>
      (allocationTypeMap.get(holding.asset_id) ?? "") === "cash" ||
      holding.asset_id === "CASH"
    );
    if (!cashHolding) return { value: 0, weight: 0 };
    const value = cashHolding.shares * (priceMap[cashHolding.asset_id] ?? 0);
    const weight =
      portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;
    return { value, weight };
  }, [allocationTypeMap, holdings, priceMap, portfolioValue]);

  const runAiPositionManagement = async () => {
    setAiRunStatus("running");
    setAiRunError(null);
    try {
      const response = await fetch("/api/ai/position-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations,
          holdings,
          priceMap,
          drift,
          marketRegime,
          convictionThreshold,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "AI run failed.");
      }
      const payload = (await response.json()) as {
        runTimestamp: string;
        actions: PositionAction[];
      };
      setActions(payload.actions);
      setAiLastRunAt(payload.runTimestamp);
      const entries = payload.actions.map((action: any) => ({
        timestamp: payload.runTimestamp,
        asset_id: action.asset_id,
        action: action.action,
        size_range: action.size_range,
        confidence: action.confidence,
        rationale: action.rationale,
        proactive_triggers: action.proactive_triggers,
        overridden: action.overridden,
        override_reason: action.override_reason,
      }));
      setAiActionHistory((prev) => [...prev, ...entries]);
      setAiRunStatus("idle");
    } catch (error) {
      setAiRunStatus("error");
      setAiRunError(
        error instanceof Error ? error.message : "AI run failed."
      );
    }
  };

  const sendAnalystMessage = async () => {
    const content = analystInput.trim();
    if (!content || analystStatus === "loading") return;
    setAnalystStatus("loading");
    setAnalystError(null);
    const nextHistory: AnalystMessage[] = [
      ...analystHistory,
      { role: "user", content, timestamp: new Date().toISOString() },
    ];
    setAnalystHistory(nextHistory);
    setAnalystInput("");
    try {
      const response = await fetch("/api/ai/financial-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: nextHistory.slice(-8),
          contributionPlan: {
            amount: dcaSettings.baseContribution,
            frequency: dcaSettings.frequency,
          },
          marketRegime,
        }),
      });
      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error ?? "Analyst response failed.");
      }
      const updatedHistory: AnalystMessage[] = [
        ...nextHistory,
        {
          role: "assistant",
          content: payload.reply,
          timestamp: new Date().toISOString(),
        },
      ];
      setAnalystHistory(updatedHistory);
      await persistAnalystHistory(updatedHistory);
      setAnalystStatus("idle");
    } catch (error) {
      setAnalystStatus("error");
      setAnalystError(
        error instanceof Error ? error.message : "Analyst response failed."
      );
      await persistAnalystHistory(nextHistory);
    }
  };

  const updatePriceHistory = async () => {
    setPriceUpdateStatus("running");
    setPriceUpdateError(null);
    try {
      const response = await fetch("/api/price-history/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const detail = errorPayload?.results
          ? JSON.stringify(errorPayload.results)
          : errorPayload?.error;
        throw new Error(detail ?? "Price update failed.");
      }
      const payload = await response.json();
      setPriceUpdateResult(payload);
      await refreshPriceStatus();
      await refreshMarketRegime();
      await refreshMarketCycleSummary();
      setPriceUpdateStatus("idle");
    } catch (error) {
      setPriceUpdateStatus("error");
      setPriceUpdateError(
        error instanceof Error ? error.message : "Price update failed."
      );
    }
  };

  useEffect(() => {
    void refreshPriceStatus();
    void refreshMarketCycleSummary();
  }, []);

  useEffect(() => {
    void refreshMarketRegime();
  }, [autoMarketRegime, holdings]);

  const refreshPriceStatus = async () => {
    const response = await fetch("/api/price-history/status");
    if (!response.ok) return;
    const payload = await response.json();
    setPriceStatus(payload.tickers ?? []);
  };

  const refreshMarketCycleSummary = async () => {
    try {
      const response = await fetch("/api/market-regime/current");
      if (!response.ok) return;
      const payload = (await response.json()) as MarketRegimeSummary;
      setMarketCycleSummary(payload);
    } catch {
      // Ignore non-critical market cycle fetch failures.
    }
  };

  const refreshMarketRegime = async () => {
    if (!autoMarketRegime) return;
    setMarketRegimeStatus("loading");
    setMarketRegimeError(null);
    try {
      const response = await fetch("/api/market-regime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Market regime unavailable.");
      }
      const payload = (await response.json()) as {
        regime?: MarketRegime;
        score?: number | null;
        metrics?: any | null;
        notes?: string[];
      };
      if (payload.regime) {
        setMarketRegime(payload.regime);
      }
      setComputedRegime({
        regime: payload.regime ?? "neutral",
        score: payload.score ?? null,
        metrics: payload.metrics ?? null,
        notes: payload.notes ?? [],
      });
      setMarketRegimeStatus("idle");
    } catch (error) {
      setMarketRegimeStatus("error");
      setMarketRegimeError(
        error instanceof Error ? error.message : "Market regime unavailable."
      );
    }
  };

  const parseUploadRows = async (file: File) => {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      return parsed?.rows ?? [];
    }
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
    const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((value) => value.trim());
      const record: any = {};
      header.forEach((key, index) => {
        record[key] = cols[index];
      });
      return {
        date: record.date,
        open: Number(record.open),
        high: Number(record.high),
        low: Number(record.low),
        close: Number(record.close),
        volume: record.volume ? Number(record.volume) : 0,
      };
    });
    return rows;
  };

  const uploadPriceHistory = async () => {
    if (!uploadFile || !uploadTicker) {
      setUploadError("Select a ticker and a file to upload.");
      return;
    }
    setUploadStatus("running");
    setUploadError(null);
    try {
      const rows = await parseUploadRows(uploadFile);
      const response = await fetch("/api/price-history/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: uploadTicker, rows }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const detail =
          typeof errorPayload?.detail === "string" ? ` ${errorPayload.detail}` : "";
        const hint =
          typeof errorPayload?.detail === "string" &&
          errorPayload.detail.includes("Insufficient market history")
            ? " Run Update Price History to fetch SPY/QQQ/IWM/VIX with enough history."
            : "";
        throw new Error((errorPayload?.error ?? "Upload failed.") + detail + hint);
      }
      const payload = await response.json();
      setUploadResult(payload);
      setUploadStatus("idle");
      await refreshPriceStatus();
    } catch (error) {
      setUploadStatus("error");
      setUploadError(
        error instanceof Error ? error.message : "Upload failed."
      );
    }
  };

  const deleteAiRun = (timestamp: string) => {
    setAiActionHistory((prev) =>
      prev.filter((entry) => entry.timestamp !== timestamp)
    );
  };
  const validationIssues = useMemo(
    () => validatePortfolio(allocations, holdings, priceMap),
    [allocations, holdings, priceMap]
  );
  const groupedAiHistory = useMemo(() => {
    const grouped = new Map<string, AiActionHistory[]>();
    aiActionHistory.forEach((entry) => {
      if (!grouped.has(entry.timestamp)) {
        grouped.set(entry.timestamp, []);
      }
      grouped.get(entry.timestamp)?.push(entry);
    });
    return Array.from(grouped.entries()).sort((a, b) =>
      a[0] < b[0] ? 1 : -1
    );
  }, [aiActionHistory]);
  const latestAiEntries = useMemo(
    () => groupedAiHistory[0]?.[1] ?? [],
    [groupedAiHistory]
  );
  useEffect(() => {
    if (!latestAiEntries.length) {
      setCombinedSummaries({});
      setCombinedFallbacks({});
      return;
    }
    let cancelled = false;
    const loadDcaAndSummaries = async () => {
      setCombinedSummaryStatus("loading");
      setCombinedSummaryError(null);
      try {
        const dcaByAsset = new Map<
          string,
          { execution: string; reasons: string[] }
        >();
        await Promise.all(
          latestAiEntries.map(async (action) => {
            const allocation = allocations.find(
              (item) => item.asset_id === action.asset_id
            );
            const assetType = allocation?.asset_type ?? "stock";
            const response = await fetch(
              `/api/dca/history/${encodeURIComponent(action.asset_id)}`
            );
            if (!response.ok) return;
            const payload = (await response.json()) as { rows?: any[] };
            const rows = payload.rows ?? [];
            if (!rows.length) return;
            const engine = runDcaEngine(
              rows,
              assetType,
              dcaSettings,
              marketCycleSummary
                ? { regime: marketCycleSummary.regime, assetId: action.asset_id }
                : undefined
            );
            const latest = engine.metricsSeries[engine.metricsSeries.length - 1];
            if (!latest) return;
            const execution =
              latest.score >= 80
                ? "HEAVY"
                : latest.score >= 60
                ? "NORMAL"
                : latest.score >= 40
                ? "LIGHT"
                : "MINIMUM";
            const reasons = [
              `Buy Quality Score ${latest.score.toFixed(0)} (${execution})`,
              `Drawdown ${latest.drawdown52wPct.toFixed(1)}% | MA distance ${latest.maDistancePct.toFixed(1)}%`,
            ];
            dcaByAsset.set(action.asset_id, { execution, reasons });
          })
        );

        const inputs = latestAiEntries.map((action) => {
          const dca = dcaByAsset.get(action.asset_id) ?? {
            execution: "MINIMUM",
            reasons: ["DCA history unavailable."],
          };
          return {
            asset: action.asset_id,
            position_intent: action.action,
            position_reasons: action.rationale ?? [],
            dca_execution: dca.execution,
            dca_reasons: dca.reasons,
          };
        });
        const fallbackMap: Record<string, string> = {};
        inputs.forEach((item) => {
          fallbackMap[item.asset] = `${item.asset}: ${item.position_intent} intent with ${item.dca_execution} accumulation framing.`;
        });
        if (!cancelled) {
          setCombinedFallbacks(fallbackMap);
        }

        const response = await fetch("/api/ai/combined-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summaries: inputs }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Failed to build summaries.");
        }
        const payload = (await response.json()) as {
          summaries?: { asset: string; sentence: string }[];
        };
        const map: Record<string, string> = {};
        (payload.summaries ?? []).forEach((item) => {
          map[item.asset] = item.sentence;
        });
        if (!cancelled) {
          setCombinedSummaries(map);
          setCombinedSummaryStatus("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setCombinedSummaryStatus("error");
          setCombinedSummaryError(
            error instanceof Error ? error.message : "Failed to build summaries."
          );
        }
      }
    };
    void loadDcaAndSummaries();
    return () => {
      cancelled = true;
    };
  }, [latestAiEntries, allocations, dcaSettings, marketCycleSummary]);
  const allocationChartData = useMemo(() => {
    const total = holdings.reduce(
      (sum, holding) => sum + holding.shares * (priceMap[holding.asset_id] ?? 0),
      0
    );
    if (total === 0) return [];
    return holdings.map((holding) => {
      const value = holding.shares * (priceMap[holding.asset_id] ?? 0);
      return {
        asset: holding.asset_id,
        value,
        weight: (value / total) * 100,
        color: "",
      };
    });
  }, [holdings, priceMap]);

  const currentNetWorth = latestNetWorth(netWorthHistory);
  const onTrack =
    projections.values.target >= goal.target_net_worth && weightedCagr >= 25;
  const netWorthValues = netWorthHistory.map((point) => point.value);
  const startValue = netWorthValues[netWorthValues.length - 1] ?? totalNetWorth;
  const startDateIso =
    netWorthHistory[netWorthHistory.length - 1]?.date ??
    clientNowIso ??
    "1970-01-01";

  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationVisible, setSimulationVisible] = useState(false);
  const [simulationInputs, setSimulationInputs] = useState({
    horizonYears: 10,
    model: "portfolio" as "portfolio" | "asset",
    portfolioCagr: weightedCagr || 25,
    assetCagr: {
      stocks: 22,
      crypto: 32,
      cash: 4,
    },
    injections: {
      oneTimeEnabled: false,
      oneTimeAmount: 0,
      oneTimeMonth: 0,
      recurringEnabled: false,
      recurringAmount: 0,
      recurringStartMonth: 1,
      recurringEndMonth: undefined as number | undefined,
      recurringUntilHorizon: true,
    },
  });

  const bucketTotals = useMemo(() => {
    const map = new Map(allocations.map((item) => [item.asset_id, item.asset_type]));
    const totals = { stocks: 0, crypto: 0, cash: 0 };
    holdings.forEach((holding) => {
      const value = holding.shares * (priceMap[holding.asset_id] ?? 0);
      const type = map.get(holding.asset_id) ?? "stock";
      if (type === "crypto") totals.crypto += value;
      else if (type === "cash") totals.cash += value;
      else totals.stocks += value;
    });
    const total = totals.stocks + totals.crypto + totals.cash;
    if (total === 0) {
      return {
        stocks: startValue * 0.7,
        crypto: startValue * 0.2,
        cash: startValue * 0.1,
      };
    }
    return totals;
  }, [allocations, holdings, priceMap, startValue]);

  const historicalMonths = Math.max(netWorthValues.length - 1, 0);
  const horizonMonths = simulationInputs.horizonYears * 12;
  const totalMonths = historicalMonths + horizonMonths;
  const totalPoints = Math.max(totalMonths + 1, 2);

  const injectionSummary = useMemo(() => {
    const parts: string[] = [];
    if (simulationInputs.injections.recurringEnabled) {
      parts.push(
        `${formatCompactCurrency(simulationInputs.injections.recurringAmount)}/mo`
      );
    }
    if (simulationInputs.injections.oneTimeEnabled) {
      parts.push(
        `${formatCompactCurrency(simulationInputs.injections.oneTimeAmount)} once`
      );
    }
    return parts.length ? parts.join(", ") : "no injections";
  }, [simulationInputs.injections]);

  const buildCumulativeContributions = () => {
    const contributions: number[] = [0];
    const recurringEnd = simulationInputs.injections.recurringUntilHorizon
      ? horizonMonths
      : simulationInputs.injections.recurringEndMonth ?? horizonMonths;
    for (let month = 1; month <= horizonMonths; month += 1) {
      let value = contributions[month - 1];
      if (
        simulationInputs.injections.oneTimeEnabled &&
        month === simulationInputs.injections.oneTimeMonth
      ) {
        value += simulationInputs.injections.oneTimeAmount;
      }
      if (simulationInputs.injections.recurringEnabled) {
        if (
          month >= simulationInputs.injections.recurringStartMonth &&
          month <= recurringEnd
        ) {
          value += simulationInputs.injections.recurringAmount;
        }
      }
      contributions.push(value);
    }
    return contributions;
  };

  const simulationResult = useMemo(() => {
    const recurringEnd = simulationInputs.injections.recurringUntilHorizon
      ? horizonMonths
      : simulationInputs.injections.recurringEndMonth;
    const injectionPlan = {
      oneTimeEnabled: simulationInputs.injections.oneTimeEnabled,
      oneTimeAmount: simulationInputs.injections.oneTimeAmount,
      oneTimeMonth: simulationInputs.injections.oneTimeMonth,
      recurringEnabled: simulationInputs.injections.recurringEnabled,
      recurringAmount: simulationInputs.injections.recurringAmount,
      recurringStartMonth: simulationInputs.injections.recurringStartMonth,
      recurringEndMonth: recurringEnd,
    };
    return runSimulation({
      startValue,
      horizonMonths,
      model: simulationInputs.model,
      portfolioCagr: simulationInputs.portfolioCagr,
      assetCagr: simulationInputs.assetCagr,
      buckets: bucketTotals,
      injections: injectionPlan,
    });
  }, [
    simulationInputs,
    startValue,
    horizonMonths,
    bucketTotals,
  ]);

  const contributionSeries = useMemo(
    () => buildCumulativeContributions(),
    [simulationInputs, horizonMonths]
  );

  const targetSeries = useMemo(() => {
    return buildTargetSeries(startValue, goal.target_net_worth, totalMonths);
  }, [goal.target_net_worth, startValue, totalMonths]);

  const chartSeries = useMemo(() => {
    const simulated = simulationResult?.series ?? [];
    return { simulated, totalPoints };
  }, [simulationResult, totalPoints]);

  const chartHeight = 440;
  const chartViewHeight = chartHeight + 40;
  const chartWidth = 760;

  const combinedValues = [
    ...netWorthValues,
    ...targetSeries,
    ...(simulationResult?.series ?? []),
  ];
  const chartMin = combinedValues.length ? Math.min(...combinedValues) : 0;
  const chartMax = combinedValues.length ? Math.max(...combinedValues) : 1;
  const chartPadding = (chartMax - chartMin) * 0.12 || 1;
  const chartRangeMin = Math.max(0, chartMin - chartPadding);
  const chartRangeMax = chartMax + chartPadding;
  const gridLines = 5;

  const netWorthPath = useMemo(
    () =>
      buildLinePath(
        netWorthValues,
        chartWidth,
        chartHeight,
        chartSeries.totalPoints,
        0,
        chartRangeMin,
        chartRangeMax
      ),
    [
      netWorthValues,
      chartWidth,
      chartHeight,
      chartSeries.totalPoints,
      chartRangeMin,
      chartRangeMax,
    ]
  );
  const targetPath = useMemo(
    () =>
      buildLinePath(
        targetSeries,
        chartWidth,
        chartHeight,
        chartSeries.totalPoints,
        0,
        chartRangeMin,
        chartRangeMax
      ),
    [
      targetSeries,
      chartWidth,
      chartHeight,
      chartSeries.totalPoints,
      chartRangeMin,
      chartRangeMax,
    ]
  );
  const simulatedPath = useMemo(
    () =>
      simulationResult?.series?.length
        ? buildLinePath(
            simulationResult.series,
            chartWidth,
            chartHeight,
            chartSeries.totalPoints,
            historicalMonths,
            chartRangeMin,
            chartRangeMax
          )
        : "",
    [
      simulationResult,
      chartWidth,
      chartHeight,
      chartSeries.totalPoints,
      historicalMonths,
      chartRangeMin,
      chartRangeMax,
    ]
  );
  const netWorthMarker = useMemo(() => {
    if (!netWorthValues.length) return null;
    return getChartPoint(
      netWorthValues,
      netWorthValues.length - 1,
      chartWidth,
      chartHeight,
      chartSeries.totalPoints,
      0,
      chartRangeMin,
      chartRangeMax
    );
  }, [
    netWorthValues,
    chartWidth,
    chartHeight,
    chartSeries.totalPoints,
    chartRangeMin,
    chartRangeMax,
  ]);

  const nowMarkerX = useMemo(() => {
    return (
      (historicalMonths / (chartSeries.totalPoints - 1 || 1)) *
        (chartWidth - chartLeftPad - chartRightPad) +
      chartLeftPad
    );
  }, [historicalMonths, chartSeries.totalPoints, chartWidth]);

  const yearMarkers = useMemo(() => {
    if (!simulationVisible || !simulationResult?.series?.length) return [];
    const markers = [];
    for (let month = 0; month <= horizonMonths; month += 12) {
      const point = getChartPoint(
        simulationResult.series,
        month,
        chartWidth,
        chartHeight,
        chartSeries.totalPoints,
        historicalMonths,
        chartRangeMin,
        chartRangeMax
      );
      const yearDate = addMonths(startDateIso, historicalMonths + month);
      markers.push({
        month,
        year: yearDate.getFullYear(),
        value: simulationResult.series[month],
        contributions: contributionSeries[month] ?? 0,
        point,
      });
    }
    return markers;
  }, [
    simulationVisible,
    simulationResult,
    horizonMonths,
    chartWidth,
    chartHeight,
    chartSeries.totalPoints,
    historicalMonths,
    chartRangeMin,
    chartRangeMax,
    startDateIso,
    contributionSeries,
  ]);

  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const activeYearMarker = yearMarkers.find(
    (marker) => marker.year === hoverYear
  );

  const simFinalValue =
    simulationResult?.series?.[simulationResult.series.length - 1] ?? 0;
  const simGap = simFinalValue - goal.target_net_worth;
  const simCrossingIndex = simulationResult
    ? findGoalCrossing(simulationResult.series, goal.target_net_worth)
    : undefined;
  const simCrossesGoal = simCrossingIndex !== undefined;
  const simCrossingPoint = useMemo(() => {
    if (!simCrossesGoal || simCrossingIndex === undefined || !simulationResult)
      return null;
    return getChartPoint(
      simulationResult.series,
      simCrossingIndex,
      chartWidth,
      chartHeight,
      chartSeries.totalPoints,
      historicalMonths,
      chartRangeMin,
      chartRangeMax
    );
  }, [
    simCrossesGoal,
    simCrossingIndex,
    simulationResult,
    chartWidth,
    chartHeight,
    chartSeries.totalPoints,
    historicalMonths,
    chartRangeMin,
    chartRangeMax,
  ]);
  const simCrossingDate = useMemo(() => {
    if (!simCrossesGoal || simCrossingIndex === undefined) return null;
    const date = parseIsoDateUtc(startDateIso);
    date.setUTCMonth(date.getUTCMonth() + simCrossingIndex);
    return `${date.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    })} ${date.getUTCFullYear()}`;
  }, [simCrossesGoal, simCrossingIndex, startDateIso]);

  const yearTicks = useMemo(() => {
    const ticks = [];
    const startYear = parseIsoDateUtc(startDateIso).getUTCFullYear();
    for (let month = 0; month <= totalMonths; month += 12) {
      const x =
        (month / (totalMonths || 1)) *
          (chartWidth - chartLeftPad - chartRightPad) +
        chartLeftPad;
      ticks.push({
        month,
        year: startYear + Math.floor(month / 12),
        x,
      });
    }
    return ticks;
  }, [startDateIso, totalMonths, chartWidth]);

  const quarterTicks = useMemo(() => {
    const ticks = [];
    for (let month = 3; month <= totalMonths; month += 3) {
      if (month % 12 === 0) continue;
      const x =
        (month / (totalMonths || 1)) *
          (chartWidth - chartLeftPad - chartRightPad) +
        chartLeftPad;
      ticks.push({ month, x });
    }
    return ticks;
  }, [totalMonths, chartWidth]);


  const addNetWorthSnapshot = () => {
    const nextDate = new Date().toISOString().slice(0, 10);
    void persistNetWorthPoint({ date: nextDate, value: totalNetWorth });
  };

  const removeLastSnapshot = () => {
    void deleteNetWorthPoint();
  };

  const dismissDriftAlert = (assetId: string) => {
    setDismissedDrift((prev) =>
      prev.includes(assetId) ? prev : [...prev, assetId]
    );
  };

  const resetDriftAlerts = () => {
    setDismissedDrift([]);
  };

  const resetSimulation = () => {
    setSimulationInputs({
      horizonYears: 10,
      model: "portfolio",
      portfolioCagr: weightedCagr || 25,
      assetCagr: {
        stocks: 22,
        crypto: 32,
        cash: 4,
      },
      injections: {
        oneTimeEnabled: false,
        oneTimeAmount: 0,
        oneTimeMonth: 0,
        recurringEnabled: false,
        recurringAmount: 0,
        recurringStartMonth: 1,
        recurringEndMonth: undefined,
        recurringUntilHorizon: true,
      },
    });
    setSimulationVisible(false);
  };

  const solveMonthlyInjectionAmount = () => {
    const recurringEnd = simulationInputs.injections.recurringUntilHorizon
      ? horizonMonths
      : simulationInputs.injections.recurringEndMonth;
    const amount = solveMonthlyInjection(
      {
        startValue,
        horizonMonths,
        model: simulationInputs.model,
        portfolioCagr: simulationInputs.portfolioCagr,
        assetCagr: simulationInputs.assetCagr,
        buckets: bucketTotals,
      },
      {
        oneTimeEnabled: simulationInputs.injections.oneTimeEnabled,
        oneTimeAmount: simulationInputs.injections.oneTimeAmount,
        oneTimeMonth: simulationInputs.injections.oneTimeMonth,
        recurringEnabled: true,
        recurringStartMonth: simulationInputs.injections.recurringStartMonth,
        recurringEndMonth: recurringEnd,
      },
      goal.target_net_worth
    );
    setSimulationInputs((prev) => ({
      ...prev,
      injections: {
        ...prev.injections,
        recurringEnabled: true,
        recurringAmount: amount,
      },
    }));
    setSimulationVisible(true);
  };


  const addTrigger = () => {
    const id = `trig-${Date.now()}`;
    const asset_id = allocations[0]?.asset_id ?? "NEW";
    setTriggers((prev) => [
      ...prev,
      { id, asset_id, rule: "If ... then ...", approved: false },
    ]);
  };

  const removeTrigger = (id: string) => {
    setTriggers((prev) => prev.filter((trigger) => trigger.id !== id));
  };

  const applyGoalChanges = () => {
    setGoal({
      target_net_worth: Number(draftGoal.target_net_worth.replace(/,/g, "")) || 0,
      target_year: Number(draftGoal.target_year) || new Date().getFullYear(),
    });
    const baseContribution = Number(draftContribution.replace(/,/g, ""));
    if (Number.isFinite(baseContribution) && baseContribution >= 0) {
      setDcaSettings((prev) => ({
        ...prev,
        baseContribution,
      }));
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,107,93,0.25),_transparent_68%)]" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(208,129,58,0.28),_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,255,255,0.1))]" />
        <div className="absolute inset-0 opacity-60 mix-blend-multiply [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_24px,rgba(214,206,196,0.2)_25px,rgba(214,206,196,0.2)_26px)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-10 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Execution + Discipline
            </span>
            <h1 className="font-display text-3xl leading-tight text-[color:var(--ink)] md:text-4xl">
              Conviction OS
            </h1>
            <p className="max-w-xl text-sm text-[color:var(--muted)] md:text-base">
              A concentrated investing cockpit focused on compounding net worth
              to a configurable target. Allocation is the law.
            </p>
          </div>
          <div />
        </header>

        <section className="rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-[color:var(--ink)]">
                Personal Financial Analyst
              </h2>
              <p className="max-w-2xl text-sm text-[color:var(--muted)]">
                A challenger that pressure-tests your long-term plan. No trading
                signals, no timing calls, and no predictions. Read-only.
              </p>
            </div>
            <div className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Analyst Mode
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-4">
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] p-4 text-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Context Summary
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[color:var(--muted)]">
                  <div className="flex items-center justify-between">
                    <span>Net worth</span>
                    <span className="text-[color:var(--ink)]">
                      {formatCurrency(totalNetWorth)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Portfolio value</span>
                    <span className="text-[color:var(--ink)]">
                      {formatCurrency(portfolioValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cash position</span>
                    <span className="text-[color:var(--ink)]">
                      {formatCurrency(cashSummary.value)} ({cashSummary.weight.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Contribution plan</span>
                    <span className="text-[color:var(--ink)]">
                      {formatCurrency(dcaSettings.baseContribution)} / {dcaSettings.frequency}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allocationByClass.map((item) => (
                    <span
                      key={item.type}
                      className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                    >
                      {item.type}: {item.weight.toFixed(1)}%
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-[color:var(--muted)]">
                  Uses stored holdings, allocations, theses, and historical
                  prices. Missing data will limit conclusions.
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-xs text-[color:var(--muted)]">
                Ask for thesis drift checks, concentration risk, regime sensitivity,
                or over-extension analysis. The analyst will challenge assumptions.
              </div>
            </div>
            <div className="flex h-full flex-col rounded-2xl border border-[color:var(--line)] bg-white/80 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Analyst Chat
                </span>
                <div className="flex items-center gap-3 text-[11px] text-[color:var(--muted)]">
                  {analystStatus === "loading" && <span>Thinking...</span>}
                  <button
                    type="button"
                    onClick={async () => {
                      setAnalystHistory([]);
                      await fetch("/api/storage/analyst_chat_history", {
                        method: "DELETE",
                      });
                    }}
                    className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-3 flex-1 space-y-3 overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] p-3 text-sm">
                {analystHistory.length === 0 ? (
                  <div className="text-xs text-[color:var(--muted)]">
                    Start with a question about risks, thesis drift, or allocation
                    trade-offs.
                  </div>
                ) : (
                  analystHistory.map((entry, index) => (
                    <div
                      key={`${entry.role}-${index}`}
                      className={`rounded-xl border px-3 py-2 text-xs ${
                        entry.role === "user"
                          ? "border-[color:var(--line)] bg-white/80 text-[color:var(--ink)]"
                          : "border-[color:var(--line)] bg-[#f4efe6] text-[color:var(--ink)]"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        {entry.role === "user" ? "You" : "Analyst"}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap leading-relaxed">
                        {entry.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {analystError && (
                <div className="mt-3 text-xs text-[color:var(--muted)]">
                  {analystError}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-3">
                <textarea
                  value={analystInput}
                  onChange={(event) => setAnalystInput(event.target.value)}
                  placeholder="Ask the analyst to challenge your thesis or risk exposure..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-[color:var(--line)] bg-white/90 px-3 py-2 text-sm text-[color:var(--ink)] outline-none"
                />
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-[color:var(--muted)]">
                    No trading signals. Read-only. Risk-first framing.
                  </div>
                  <button
                    type="button"
                    onClick={sendAnalystMessage}
                    disabled={analystStatus === "loading" || !analystInput.trim()}
                    className="rounded-full bg-[color:var(--accent-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.5fr_0.5fr]">
          <div className="flex flex-col gap-6 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-[color:var(--ink)]">
                  Target {formatCurrency(goal.target_net_worth)} by {goal.target_year}
                </h2>
                <p className="text-sm text-[color:var(--muted)]">
                  Weighted portfolio CAGR needed: 25%+. Strategy changes slowly,
                  execution updates frequently.
                </p>
              </div>
              <div className="rounded-full bg-[color:var(--accent-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                {marketRegime === "risk-on" ? "Risk-On" : "Risk-Off"}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "Total Net Worth", value: formatCurrency(totalNetWorth) },
                { label: "Portfolio Value", value: formatCurrency(portfolioValue) },
                { label: "Latest Snapshot", value: formatCurrency(currentNetWorth) },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    {item.label}
                  </p>
                  <p className="text-xl font-semibold text-[color:var(--ink)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--ink)]">
                    Net Worth Trajectory
                  </h3>
                  <p className="text-xs text-[color:var(--muted)]">
                    Updated weekly, compared to target path.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--muted)]">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                    Current
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--accent-2)]" />
                    Target
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#0a4b7a]" />
                    Simulated
                  </div>
                </div>
              </div>
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)]">
                <svg
                  className="h-[360px] w-full md:h-[440px] lg:h-[480px]"
                  viewBox={`0 0 ${chartWidth} ${chartViewHeight}`}
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="targetLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#d0813a" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#d0813a" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>
                  {Array.from({ length: gridLines }).map((_, index) => {
                    const ratio = index / (gridLines - 1);
                    const y = 10 + ratio * (chartHeight - 20);
                    const value =
                      chartRangeMax - ratio * (chartRangeMax - chartRangeMin);
                    return (
                      <g key={`grid-${index}`}>
                        <line
                          x1={chartLeftPad}
                          x2={chartWidth - chartRightPad}
                          y1={y}
                          y2={y}
                          stroke="rgba(214,206,196,0.35)"
                          strokeWidth="1"
                        />
                        <text
                          x="8"
                          y={y + 4}
                          fontSize="11"
                          fill="#6e6a62"
                        >
                          {formatCompactCurrency(value)}
                        </text>
                      </g>
                    );
                  })}
                  <line
                    x1={chartLeftPad}
                    x2={chartWidth - chartRightPad}
                    y1={chartHeight - 10}
                    y2={chartHeight - 10}
                    stroke="rgba(214,206,196,0.8)"
                    strokeWidth="1"
                  />
                  {quarterTicks.map((tick) => (
                    <line
                      key={`quarter-${tick.month}`}
                      x1={tick.x}
                      x2={tick.x}
                      y1={chartHeight - 10}
                      y2={chartHeight - 6}
                      stroke="rgba(214,206,196,0.45)"
                      strokeWidth="1"
                    />
                  ))}
                  {yearTicks.map((tick) => (
                    <g key={`year-${tick.year}`}>
                      <line
                        x1={tick.x}
                        x2={tick.x}
                        y1={chartHeight - 10}
                        y2={chartHeight - 4}
                        stroke="rgba(214,206,196,0.7)"
                        strokeWidth="1"
                      />
                      <text
                        x={tick.x}
                        y={chartHeight + 6}
                        fontSize="11"
                        fill="#6e6a62"
                        textAnchor="middle"
                      >
                        {tick.year}
                      </text>
                    </g>
                  ))}
                  <text
                    x={chartWidth / 2}
                    y={chartHeight + 24}
                    fontSize="11"
                    fill="#6e6a62"
                    textAnchor="middle"
                  >
                    Time (Years)
                  </text>
                  <line
                    x1={nowMarkerX}
                    x2={nowMarkerX}
                    y1="10"
                    y2={chartHeight - 10}
                    stroke="rgba(15,107,93,0.35)"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                  />
                  <text
                    x={nowMarkerX + 6}
                    y="22"
                    fontSize="11"
                    fill="#0f6b5d"
                  >
                    Now
                  </text>
                  {targetPath && (
                    <path
                      d={targetPath}
                      stroke="url(#targetLine)"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                      opacity="0.55"
                    />
                  )}
                  {netWorthPath && (
                    <path
                      d={netWorthPath}
                      stroke="#0f6b5d"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  )}
                  {simulationVisible && simulatedPath && (
                    <path
                      d={simulatedPath}
                      stroke="#0a4b7a"
                      strokeWidth="3"
                      strokeLinecap="round"
                      opacity="0.9"
                    />
                  )}
                  {simulationVisible &&
                    yearMarkers.map((marker) => (
                      <circle
                        key={`sim-dot-${marker.year}`}
                        cx={marker.point.x}
                        cy={marker.point.y}
                        r="4"
                        fill="#0a4b7a"
                        onMouseEnter={() => setHoverYear(marker.year)}
                        onMouseLeave={() => setHoverYear(null)}
                      />
                    ))}
                  {simCrossesGoal && simCrossingPoint && (
                    <g>
                      <circle
                        cx={simCrossingPoint.x}
                        cy={simCrossingPoint.y}
                        r="6"
                        fill="#1e7b63"
                      />
                      <text
                        x={simCrossingPoint.x + 10}
                        y={simCrossingPoint.y - 8}
                        fontSize="11"
                        fill="#1e7b63"
                      >
                        Goal reached — {simCrossingDate}
                      </text>
                    </g>
                  )}
                  {netWorthMarker && (
                    <circle
                      cx={netWorthMarker.x}
                      cy={netWorthMarker.y}
                      r="5"
                      fill="#0f6b5d"
                    />
                  )}
                </svg>
                {activeYearMarker && (
                  <div
                    className="pointer-events-none absolute rounded-xl border border-[color:var(--line)] bg-white/95 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                    style={{
                      left: `${(activeYearMarker.point.x / chartWidth) * 100}%`,
                      top: `${(activeYearMarker.point.y / chartViewHeight) * 100}%`,
                      transform: "translate(-30%, -120%)",
                    }}
                  >
                    <div className="text-[color:var(--ink)]">
                      {activeYearMarker.year}
                    </div>
                    <div>{formatCompactCurrency(activeYearMarker.value)}</div>
                    <div>
                      Contributions {formatCompactCurrency(activeYearMarker.contributions)}
                    </div>
                    <div>
                      CAGR{" "}
                      {simulationInputs.model === "portfolio"
                        ? `${formatPercent(simulationInputs.portfolioCagr)}`
                        : `Stocks ${formatPercent(simulationInputs.assetCagr.stocks)}, Crypto ${formatPercent(
                            simulationInputs.assetCagr.crypto
                          )}, Cash ${formatPercent(simulationInputs.assetCagr.cash)}`}
                    </div>
                  </div>
                )}
              </div>
              {!simCrossesGoal && simulationVisible && (
                <div className="mt-3 text-xs text-[color:var(--muted)]">
                  Projected shortfall at horizon:{" "}
                  <span className="font-semibold text-[color:var(--danger)]">
                    {formatCompactCurrency(Math.abs(simGap))}
                  </span>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={addNetWorthSnapshot}
                  className="rounded-full border border-[color:var(--ink)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                >
                  Record Snapshot
                </button>
                <button
                  onClick={removeLastSnapshot}
                  className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs font-semibold text-[color:var(--muted)]"
                >
                  Remove Last
                </button>
                <button
                  onClick={() => setSimulationVisible((prev) => !prev)}
                  className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs font-semibold text-[color:var(--muted)]"
                >
                  {simulationVisible ? "Hide Simulation" : "Show Simulation"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                  Current (historical)
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#0a4b7a]" />
                  Simulated (
                  {simulationInputs.model === "portfolio"
                    ? `${formatPercent(simulationInputs.portfolioCagr)} CAGR`
                    : `Stocks ${formatPercent(simulationInputs.assetCagr.stocks)} CAGR`}
                  , {injectionSummary})
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--accent-2)]" />
                  Target (goal path)
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-white/80 p-4">
                <button
                  onClick={() => setSimulationOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]"
                >
                  What-If Simulation
                  <span>{simulationOpen ? "–" : "+"}</span>
                </button>
                {simulationOpen && (
                  <div className="mt-4 grid gap-4 text-xs text-[color:var(--muted)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="uppercase tracking-[0.2em]">
                        Horizon
                      </span>
                      {[5, 10, 15, 20].map((years) => (
                        <button
                          key={years}
                          onClick={() =>
                            setSimulationInputs((prev) => ({
                              ...prev,
                              horizonYears: years,
                            }))
                          }
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                            simulationInputs.horizonYears === years
                              ? "border-[color:var(--ink)] text-[color:var(--ink)]"
                              : "border-[color:var(--line)] text-[color:var(--muted)]"
                          }`}
                        >
                          {years}y
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-2">
                      <span className="uppercase tracking-[0.2em]">
                        Growth Model
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {["portfolio", "asset"].map((mode) => (
                          <button
                            key={mode}
                            onClick={() =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                model: mode as "portfolio" | "asset",
                              }))
                            }
                            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                              simulationInputs.model === mode
                                ? "border-[color:var(--ink)] text-[color:var(--ink)]"
                                : "border-[color:var(--line)] text-[color:var(--muted)]"
                            }`}
                          >
                            {mode === "portfolio"
                              ? "Portfolio CAGR"
                              : "Asset-Class CAGR"}
                          </button>
                        ))}
                      </div>
                      {simulationInputs.model === "portfolio" ? (
                        <label className="grid gap-1">
                          Portfolio CAGR %
                          <input
                            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                            value={simulationInputs.portfolioCagr}
                            onChange={(event) =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                portfolioCagr: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            { key: "stocks", label: "Stocks %" },
                            { key: "crypto", label: "Crypto %" },
                            { key: "cash", label: "Cash %" },
                          ].map((item) => (
                            <label key={item.key} className="grid gap-1">
                              {item.label}
                              <input
                                className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                                value={
                                  simulationInputs.assetCagr[
                                    item.key as "stocks" | "crypto" | "cash"
                                  ]
                                }
                                onChange={(event) =>
                                  setSimulationInputs((prev) => ({
                                    ...prev,
                                    assetCagr: {
                                      ...prev.assetCagr,
                                      [item.key]: Number(event.target.value),
                                    },
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-2 rounded-2xl border border-[color:var(--line)] bg-white/70 p-3">
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-[0.2em]">
                          One-Time Injection
                        </span>
                        <input
                          type="checkbox"
                          checked={simulationInputs.injections.oneTimeEnabled}
                          onChange={(event) =>
                            setSimulationInputs((prev) => ({
                              ...prev,
                              injections: {
                                ...prev.injections,
                                oneTimeEnabled: event.target.checked,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1">
                          Amount
                          <input
                            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                            value={simulationInputs.injections.oneTimeAmount}
                            onChange={(event) =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                injections: {
                                  ...prev.injections,
                                  oneTimeAmount: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1">
                          Month Offset
                          <input
                            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                            value={simulationInputs.injections.oneTimeMonth}
                            onChange={(event) =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                injections: {
                                  ...prev.injections,
                                  oneTimeMonth: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid gap-2 rounded-2xl border border-[color:var(--line)] bg-white/70 p-3">
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-[0.2em]">
                          Recurring Injection
                        </span>
                        <input
                          type="checkbox"
                          checked={simulationInputs.injections.recurringEnabled}
                          onChange={(event) =>
                            setSimulationInputs((prev) => ({
                              ...prev,
                              injections: {
                                ...prev.injections,
                                recurringEnabled: event.target.checked,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="grid gap-1">
                          Amount / Month
                          <input
                            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                            value={simulationInputs.injections.recurringAmount}
                            onChange={(event) =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                injections: {
                                  ...prev.injections,
                                  recurringAmount: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1">
                          Start Month
                          <input
                            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                            value={simulationInputs.injections.recurringStartMonth}
                            onChange={(event) =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                injections: {
                                  ...prev.injections,
                                  recurringStartMonth: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1">
                          End Month
                          <input
                            className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                            value={simulationInputs.injections.recurringEndMonth ?? ""}
                            disabled={simulationInputs.injections.recurringUntilHorizon}
                            onChange={(event) =>
                              setSimulationInputs((prev) => ({
                                ...prev,
                                injections: {
                                  ...prev.injections,
                                  recurringEndMonth: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-[color:var(--muted)]">
                        <input
                          type="checkbox"
                          checked={simulationInputs.injections.recurringUntilHorizon}
                          onChange={(event) =>
                            setSimulationInputs((prev) => ({
                              ...prev,
                              injections: {
                                ...prev.injections,
                                recurringUntilHorizon: event.target.checked,
                              },
                            }))
                          }
                        />
                        Until horizon
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => setSimulationVisible(true)}
                        className="rounded-full border border-[color:var(--ink)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                      >
                        Run Simulation
                      </button>
                      <button
                        onClick={solveMonthlyInjectionAmount}
                        className="rounded-full border border-[color:var(--ink)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                      >
                        Solve Required Monthly Injection
                      </button>
                      <button
                        onClick={resetSimulation}
                        className="rounded-full border border-[color:var(--line)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]"
                      >
                        Reset Simulation
                      </button>
                    </div>

                    <div className="grid gap-2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] p-3 text-xs text-[color:var(--muted)] sm:grid-cols-2">
                      <div>
                        <span className="uppercase tracking-[0.2em]">
                          Simulated Value
                        </span>
                        <p className="text-base font-semibold text-[color:var(--ink)]">
                          {formatCurrency(simFinalValue)}
                        </p>
                      </div>
                      <div>
                        <span className="uppercase tracking-[0.2em]">
                          Gap vs Goal
                        </span>
                        <p className="text-base font-semibold text-[color:var(--ink)]">
                          {formatCurrency(simGap)}
                        </p>
                      </div>
                      <div>
                        <span className="uppercase tracking-[0.2em]">
                          Crosses Goal?
                        </span>
                        <p className="text-base font-semibold text-[color:var(--ink)]">
                          {simCrossesGoal ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <span className="uppercase tracking-[0.2em]">
                          Crossing Date
                        </span>
                        <p className="text-base font-semibold text-[color:var(--ink)]">
                          {simCrossesGoal ? simCrossingDate : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-6">
              <div>
                <h3 className="font-display text-xl text-[color:var(--ink)]">
                  Goal Configuration
                </h3>
                <p className="text-xs text-[color:var(--muted)]">
                  Changes require explicit confirmation and recalculation.
                </p>
              </div>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm text-[color:var(--muted)]">
                  Target Net Worth
                  <input
                    className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-base text-[color:var(--ink)] outline-none focus:border-[color:var(--accent)]"
                    value={draftGoal.target_net_worth}
                    onChange={(event) =>
                      setDraftGoal((prev) => ({
                        ...prev,
                        target_net_worth: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm text-[color:var(--muted)]">
                  Target Year
                  <input
                    className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-base text-[color:var(--ink)] outline-none focus:border-[color:var(--accent)]"
                    value={draftGoal.target_year}
                    onChange={(event) =>
                      setDraftGoal((prev) => ({
                        ...prev,
                        target_year: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm text-[color:var(--muted)]">
                  Contribution Plan ({dcaSettings.frequency})
                  <input
                    className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-base text-[color:var(--ink)] outline-none focus:border-[color:var(--accent)]"
                    value={draftContribution}
                    onChange={(event) => setDraftContribution(event.target.value)}
                  />
                </label>
                <button
                  onClick={applyGoalChanges}
                  className="rounded-xl bg-[color:var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white"
                >
                  Confirm Goal Changes
                </button>
                <div className="rounded-xl border border-[color:var(--line)] bg-white/70 p-4 text-xs text-[color:var(--muted)]">
                  Projection status:{" "}
                  <span
                    className={`font-semibold ${
                      onTrack ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
                    }`}
                  >
                    {onTrack ? "On Track" : "Off Track"}
                  </span>{" "}
                  at {formatPercent(weightedCagr)} expected CAGR.
                </div>
                <div className="grid gap-3 rounded-xl border border-[color:var(--line)] bg-white/60 p-4 text-xs text-[color:var(--muted)]">
                  <div className="flex items-center justify-between">
                    <span>Market Regime</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        Auto
                        <input
                          type="checkbox"
                          checked={autoMarketRegime}
                          onChange={(event) => setAutoMarketRegime(event.target.checked)}
                        />
                      </label>
                      <select
                        value={marketRegime}
                        onChange={(event) =>
                          setMarketRegime(event.target.value as MarketRegime)
                        }
                        disabled={autoMarketRegime || marketRegimeStatus === "loading"}
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-1 text-xs text-[color:var(--ink)] disabled:opacity-60"
                      >
                        <option value="risk-on">Risk-On</option>
                        <option value="neutral">Neutral</option>
                        <option value="risk-off">Risk-Off</option>
                      </select>
                    </div>
                  </div>
                  {autoMarketRegime && (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                      {marketRegimeStatus === "loading"
                        ? "Updating regime..."
                        : computedRegime?.score != null
                        ? `Auto score ${computedRegime.score.toFixed(0)}`
                        : "Auto regime ready"}
                    </div>
                  )}
                  {marketRegimeError && (
                    <div className="mt-2 text-[color:var(--danger)]">
                      {marketRegimeError}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Conviction Threshold</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={convictionThreshold}
                      onChange={(event) =>
                        setConvictionThreshold(Number(event.target.value))
                      }
                    />
                    <span className="text-[color:var(--ink)]">
                      {convictionThreshold}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-6">
              <h3 className="font-display text-xl text-[color:var(--ink)]">
                Projection Scenarios
              </h3>
              <p className="text-xs text-[color:var(--muted)]">
                Allocation-weighted CAGR projections to {goal.target_year}.
              </p>
              <div className="mt-4 grid gap-3 text-sm">
                {[
                  {
                    label: "Conservative",
                    value: `${formatPercent(projections.conservative)} CAGR`,
                    status:
                      projections.values.conservative >= goal.target_net_worth
                        ? "On track"
                        : "Off track",
                  },
                  {
                    label: "Target",
                    value: `${formatPercent(projections.target)} CAGR`,
                    status:
                      projections.values.target >= goal.target_net_worth
                        ? "On track"
                        : "Off track",
                  },
                  {
                    label: "Aggressive",
                    value: `${formatPercent(projections.aggressive)} CAGR`,
                    status:
                      projections.values.aggressive >= goal.target_net_worth
                        ? "Ahead"
                        : "Off track",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-[color:var(--ink)]">
                        {item.label}
                      </p>
                      <p className="text-xs text-[color:var(--muted)]">
                        {item.value}
                      </p>
                    </div>
                    <span className="rounded-full border border-[color:var(--line)] px-3 py-1 text-xs text-[color:var(--muted)]">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-xs text-[color:var(--muted)]">
                Acknowledgment required if projections fall below the target
                trajectory.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-5 shadow-[var(--shadow)]">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-[color:var(--ink)]">
                Allocation Drift
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Alerted
                </span>
                <button
                  onClick={resetDriftAlerts}
                  className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {driftAlerts.map((item) => (
                <div
                  key={item.asset_id}
                  className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white/70 px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">
                      {item.asset_id}
                    </p>
                    <p className="text-[10px] text-[color:var(--muted)]">
                      Target {item.target_weight}% | Actual{" "}
                      {formatPercent(item.actual_weight)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-semibold ${
                        item.status === "Over"
                          ? "text-[color:var(--danger)]"
                          : item.status === "Under"
                          ? "text-[color:var(--accent-2)]"
                          : "text-[color:var(--success)]"
                      }`}
                    >
                      {item.drift > 0 ? "+" : ""}
                      {formatPercent(item.drift)}
                    </p>
                    <p className="text-[10px] text-[color:var(--muted)]">
                      {item.status}
                      {item.max_violation ? " | Max" : ""}
                    </p>
                    <button
                      onClick={() => dismissDriftAlert(item.asset_id)}
                      className="mt-1 rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
              {!driftAlerts.length && (
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
                  All drift alerts dismissed.
                </div>
              )}
            </div>
          </div>

          <AllocationPieChart data={allocationChartData} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-6">
            <div className="rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl text-[color:var(--ink)]">
                  Combined Allocation Summary
                </h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Context
                </span>
              </div>
              <p className="text-xs text-[color:var(--muted)]">
                Neutral synthesis of position intent and DCA execution.
              </p>
              {combinedSummaryStatus === "loading" && (
                <div className="mt-3 rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-xs text-[color:var(--muted)]">
                  Building summaries...
                </div>
              )}
              {combinedSummaryError && (
                <div className="mt-3 rounded-2xl border border-[color:var(--danger)] bg-white/80 px-4 py-3 text-xs text-[color:var(--danger)]">
                  {combinedSummaryError}
                </div>
              )}
              {!latestAiEntries.length && (
                <div className="mt-3 rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-xs text-[color:var(--muted)]">
                  Run AI Position Management to generate summaries.
                </div>
              )}
              {latestAiEntries.length > 0 && (
                <div className="mt-4 grid gap-3">
                  {latestAiEntries.map((action) => (
                    <div
                      key={`summary-${action.asset_id}`}
                      className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-3 text-sm text-[color:var(--ink)]"
                    >
                      {combinedSummaries[action.asset_id] ??
                        combinedFallbacks[action.asset_id] ??
                        `${action.asset_id}: ${action.action} intent with MINIMUM accumulation framing.`}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
              <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-[color:var(--ink)]">
                AI Position Management
              </h3>
              <div className="flex items-center gap-3">
                {priceUpdateResult?.fetched_at && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Prices updated {formatTimestampUtc(priceUpdateResult.fetched_at)}
                  </span>
                )}
                {aiLastRunAt && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Last run {formatTimestampUtc(aiLastRunAt)}
                  </span>
                )}
                <button
                  onClick={updatePriceHistory}
                  disabled={priceUpdateStatus === "running"}
                  className="rounded-full border border-[color:var(--line)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                >
                  {priceUpdateStatus === "running"
                    ? "Updating..."
                    : "Update Price History"}
                </button>
                <button
                  onClick={runAiPositionManagement}
                  disabled={aiRunStatus === "running"}
                  className="rounded-full border border-[color:var(--ink)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                >
                  {aiRunStatus === "running"
                    ? "Running..."
                    : "Run AI Position Management"}
                </button>
              </div>
            </div>
            {priceUpdateError && (
              <div className="mt-3 rounded-2xl border border-[color:var(--danger)] bg-white/80 px-4 py-3 text-xs text-[color:var(--danger)]">
                {priceUpdateError}
              </div>
            )}
            {aiRunError && (
              <div className="mt-3 rounded-2xl border border-[color:var(--danger)] bg-white/80 px-4 py-3 text-xs text-[color:var(--danger)]">
                {aiRunError}
              </div>
            )}
            {priceUpdateResult?.results && (
              <div className="mt-3 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
                Latest trading day: {priceUpdateResult.latest_trading_day}.{" "}
                {Object.values(priceUpdateResult.results).some(
                  (item: any) => item?.is_stale
                )
                  ? "Some tickers are stale; AI will default to HOLD."
                  : "All tickers up to date."}
              </div>
            )}
            <div className="mt-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-xs text-[color:var(--muted)]">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="w-24 rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                  placeholder="Ticker"
                  value={uploadTicker}
                  onChange={(event) => setUploadTicker(event.target.value.toUpperCase())}
                />
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  className="text-[10px]"
                />
                <button
                  onClick={uploadPriceHistory}
                  disabled={uploadStatus === "running"}
                  className="rounded-full border border-[color:var(--line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                >
                  {uploadStatus === "running" ? "Uploading..." : "Upload History"}
                </button>
              </div>
              {uploadError && (
                <div className="mt-2 text-[color:var(--danger)]">{uploadError}</div>
              )}
              {uploadResult && (
                <div className="mt-2">
                  Uploaded {uploadResult.inserted} rows, skipped {uploadResult.skipped}.
                </div>
              )}
            </div>
            {priceStatus.length > 0 && (
              <div className="mt-3 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    Price History Status
                  </div>
                  <button
                    onClick={() => setPriceStatusOpen((prev) => !prev)}
                    className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                  >
                    {priceStatusOpen ? "Hide" : "Show"}
                  </button>
                </div>
                {priceStatusOpen && (
                  <div className="mt-2 grid gap-2">
                    {priceStatus.map((item) => (
                      <div
                        key={item.ticker}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--line)] bg-white/70 px-3 py-2"
                      >
                        <span className="font-semibold text-[color:var(--ink)]">
                          {item.ticker}
                        </span>
                        <span>Start {item.start_date}</span>
                        <span>Latest {item.latest_date}</span>
                        <span>Updated {formatTimestampUtc(item.last_fetched_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {priceUpdateResult?.skipped?.length > 0 && (
              <div className="mt-2 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
                Skipped:{" "}
                {priceUpdateResult.skipped
                  .map((item: any) => `${item.ticker} (${item.reason})`)
                  .join(", ")}
              </div>
            )}
            <div className="mt-4 grid gap-4">
              {!actions.length && (
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
                  Run AI Position Management to generate recommendations.
                </div>
              )}
              {actions.map((item) => (
                <div
                  key={item.asset_id}
                  className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-semibold text-[color:var(--ink)]">
                        {item.asset_id}
                      </p>
                      <p className="text-xs text-[color:var(--muted)]">
                        Size range {item.size_range} | Confidence {item.confidence}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-[color:var(--accent-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                        {item.action}
                      </span>
                      {item.blocked && (
                        <span className="rounded-full bg-[color:var(--danger)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                          Blocked
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="mt-3 grid gap-2 text-xs text-[color:var(--muted)]">
                    {item.rationale.map((note) => (
                      <li key={note} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[color:var(--ink)]">
                  AI Recommendation History
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryVisible((prev) => !prev)}
                    className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                  >
                    {historyVisible ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {historyVisible && (
                <>
                  {!groupedAiHistory.length && (
                    <div className="rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2 text-xs text-[color:var(--muted)]">
                      No AI recommendation history yet.
                    </div>
                  )}
                  {groupedAiHistory.map(([timestamp, entries]) => (
                    <div
                      key={timestamp}
                      className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-3"
                    >
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        <span>Run</span>
                        <div className="flex items-center gap-2">
                          <span>{formatTimestampUtc(timestamp)}</span>
                          <button
                            onClick={() => deleteAiRun(timestamp)}
                            className="rounded-full border border-[color:var(--danger)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--danger)]"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-xs text-[color:var(--muted)]">
                        {entries.map((entry, index) => (
                          <div
                            key={`${entry.asset_id}-${index}`}
                            className="rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-[color:var(--ink)]">
                                {entry.asset_id}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-[color:var(--accent-strong)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                  {entry.action}
                                </span>
                                {entry.overridden && (
                                  <span className="rounded-full bg-[color:var(--danger)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                    Overridden
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 text-[color:var(--muted)]">
                              Confidence {entry.confidence} | Size {entry.size_range}
                            </div>
                            <div className="mt-2 text-[color:var(--muted)]">
                              {entry.rationale.slice(0, 2).join(" ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl text-[color:var(--ink)]">
                  Pre-Commitment Triggers
                </h3>
                <button
                  onClick={addTrigger}
                  className="rounded-full border border-[color:var(--ink)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                >
                  Add Trigger
                </button>
              </div>
              <p className="text-xs text-[color:var(--muted)]">
                Editable rules enforced before execution.
              </p>
              <div className="mt-4 grid gap-3 text-sm">
                {triggers.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <input
                        className="w-20 rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                        value={rule.asset_id}
                        onChange={(event) =>
                          setTriggers((prev) =>
                            prev.map((item) =>
                              item.id === rule.id
                                ? {
                                    ...item,
                                    asset_id: event.target.value.toUpperCase(),
                                  }
                                : item
                            )
                          )
                        }
                      />
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        Approved
                        <input
                          type="checkbox"
                          checked={rule.approved}
                          onChange={(event) =>
                            setTriggers((prev) =>
                              prev.map((item) =>
                                item.id === rule.id
                                  ? { ...item, approved: event.target.checked }
                                  : item
                              )
                            )
                          }
                        />
                      </label>
                      <button
                        onClick={() => removeTrigger(rule.id)}
                        className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-xs text-[color:var(--ink)]"
                      value={rule.rule}
                      onChange={(event) =>
                        setTriggers((prev) =>
                          prev.map((item) =>
                            item.id === rule.id
                              ? { ...item, rule: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full rounded-xl border border-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]">
                Edit Triggers
              </button>
            </div>

            <div className="rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
              <h3 className="font-display text-xl text-[color:var(--ink)]">
                Validation & Guardrails
              </h3>
              <p className="text-xs text-[color:var(--muted)]">
                Allocation and holding integrity checks alongside discipline flags.
              </p>
              <div className="mt-4 grid gap-3 text-xs text-[color:var(--muted)]">
                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-3">
                  Block ADD:{" "}
                  {guardrails.add_blocked.length
                    ? guardrails.add_blocked.join(", ")
                    : "None"}
                </div>
                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-3">
                  Orphan positions:{" "}
                  {guardrails.orphan_positions.length
                    ? guardrails.orphan_positions.join(", ")
                    : "None"}
                </div>
                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-3">
                  Stale thesis:{" "}
                  {guardrails.stale_thesis.length
                    ? guardrails.stale_thesis.join(", ")
                    : "None"}
                </div>
                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-3">
                  Silent drift:{" "}
                  {guardrails.silent_drift.length
                    ? guardrails.silent_drift.join(", ")
                    : "None"}
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-xs text-[color:var(--muted)]">
                {validationIssues.length ? (
                  validationIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        issue.severity === "critical"
                          ? "border-[color:var(--danger)] bg-white/80 text-[color:var(--danger)]"
                          : "border-[color:var(--line)] bg-white/70"
                      }`}
                    >
                      {issue.message}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3">
                    No validation issues detected.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--line)] pt-6 text-xs text-[color:var(--muted)]">
          <span>Single-user, local storage, mock market data enabled.</span>
          <span>Actions limited to ADD, HOLD, TRIM.</span>
        </footer>
      </main>
    </div>
  );
}
