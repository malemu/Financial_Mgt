import {
  Allocation,
  DriftResult,
  GuardrailStatus,
  Holding,
  MarketRegime,
  NetWorthPoint,
  PositionAction,
  PriceMap,
  ProactiveTrigger,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getPrice = (priceMap: PriceMap, assetId: string) =>
  priceMap[assetId] ?? 0;

export const computePositionValue = (holding: Holding, priceMap: PriceMap) =>
  holding.shares * getPrice(priceMap, holding.asset_id);

export const computePortfolioValue = (holdings: Holding[], priceMap: PriceMap) =>
  holdings.reduce(
    (sum, holding) => sum + computePositionValue(holding, priceMap),
    0
  );

export const computeWeights = (holdings: Holding[], priceMap: PriceMap) => {
  const total = computePortfolioValue(holdings, priceMap);
  if (total === 0) return {};
  return holdings.reduce<Record<string, number>>((acc, holding) => {
    acc[holding.asset_id] =
      (computePositionValue(holding, priceMap) / total) * 100;
    return acc;
  }, {});
};

export const computeDrift = (
  allocations: Allocation[],
  holdings: Holding[],
  priceMap: PriceMap
): DriftResult[] => {
  const weights = computeWeights(holdings, priceMap);
  return allocations.map((allocation) => {
    const actual = weights[allocation.asset_id] ?? 0;
    const drift = actual - allocation.target_weight;
    const status = Math.abs(drift) <= 1 ? "Within" : drift > 0 ? "Over" : "Under";
    return {
      asset_id: allocation.asset_id,
      target_weight: allocation.target_weight,
      actual_weight: actual,
      drift,
      status,
      max_violation: actual > allocation.max_weight,
    };
  });
};

export const computeWeightedCagr = (allocations: Allocation[]) => {
  const totalWeight = allocations.reduce(
    (sum, allocation) => sum + allocation.target_weight,
    0
  );
  if (totalWeight === 0) return 0;
  return (
    allocations.reduce(
      (sum, allocation) => sum + allocation.expected_cagr * allocation.target_weight,
      0
    ) / totalWeight
  );
};

export const projectNetWorth = (
  currentNetWorth: number,
  annualCagr: number,
  years: number
) => {
  const rate = annualCagr / 100;
  return currentNetWorth * Math.pow(1 + rate, years);
};

export const buildProjectionScenarios = (
  currentNetWorth: number,
  weightedCagr: number,
  years: number
) => {
  const conservative = clamp(weightedCagr - 7, 0, 100);
  const aggressive = clamp(weightedCagr + 7, 0, 100);
  return {
    conservative,
    target: weightedCagr,
    aggressive,
    values: {
      conservative: projectNetWorth(currentNetWorth, conservative, years),
      target: projectNetWorth(currentNetWorth, weightedCagr, years),
      aggressive: projectNetWorth(currentNetWorth, aggressive, years),
    },
  };
};

export const latestNetWorth = (history: NetWorthPoint[]) =>
  history.length ? history[history.length - 1].value : 0;

const daysBetween = (date: string, now: Date) => {
  const from = new Date(date);
  return Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
};

export const evaluateGuardrails = (
  allocations: Allocation[],
  holdings: Holding[],
  drift: DriftResult[],
  actions: PositionAction[]
): GuardrailStatus => {
  const allocationIds = new Set(allocations.map((allocation) => allocation.asset_id));
  const orphanPositions = holdings
    .filter((holding) => !allocationIds.has(holding.asset_id))
    .map((holding) => holding.asset_id);

  const now = new Date();
  const staleThesis = allocations
    .filter((allocation) => daysBetween(allocation.thesis_last_review, now) > 90)
    .map((allocation) => allocation.asset_id);

  const silentDrift = drift
    .filter((item) => Math.abs(item.drift) > 5)
    .filter((item) => {
      const action = actions.find((candidate) => candidate.asset_id === item.asset_id);
      return action?.action === "HOLD";
    })
    .map((item) => item.asset_id);

  const addBlocked = actions
    .filter((action) => action.action === "ADD" && action.blocked)
    .map((action) => action.asset_id);

  return {
    orphan_positions: orphanPositions,
    stale_thesis: staleThesis,
    silent_drift: silentDrift,
    add_blocked: addBlocked,
  };
};

const toConfidence = (value: number) =>
  value >= 2 ? "high" : value === 1 ? "medium" : "low";

type AiAnalysisInput = {
  allocation: Pick<
    Allocation,
    "target_weight" | "max_weight" | "conviction_tier" | "expected_cagr"
  >;
  currentWeight: number;
  drift: number;
  price_action: string;
  fundamentals_summary: string;
  thesis_valid: boolean;
  marketRegime: MarketRegime;
};

type AiAnalysisOutput = {
  proposed_action: PositionAction["action"];
  size_range: string;
  rationale: string[];
  confidence: PositionAction["confidence"];
  proactive_triggers: string[];
};

type AiAnalysisFn = (input: AiAnalysisInput) => AiAnalysisOutput;

const parseProactiveTriggers = (
  triggers: string[],
  fallbackAction: PositionAction["action"]
): ProactiveTrigger[] => {
  return triggers.slice(0, 3).map((trigger) => {
    const match = trigger.match(/^(ADD|HOLD|TRIM)\s+(\d+-\d+%)?\s*if\s*/i);
    const action =
      (match?.[1]?.toUpperCase() as PositionAction["action"]) ?? fallbackAction;
    const size_range =
      match?.[2] ??
      (action === "TRIM" ? "10-15%" : action === "ADD" ? "5-10%" : "0%");
    const condition = trigger.replace(
      /^(ADD|HOLD|TRIM)\s+(\d+-\d+%)?\s*/i,
      ""
    );
    return { action, size_range, condition };
  });
};

const analyzeAllocationWithAi: AiAnalysisFn = ({
  allocation,
  currentWeight,
  drift,
  price_action,
  fundamentals_summary,
  thesis_valid,
  marketRegime,
}) => {
  const overweight = currentWeight > allocation.max_weight;
  const underweight = currentWeight < allocation.target_weight;
  const fundamentalsSoft = /weak|slow|compress|decline|pressure/i.test(
    fundamentals_summary
  );
  const priceExtended = /extended|overheated|stretched|frothy/i.test(price_action);
  const pricePullback = /pullback|retrac|reset|cooling/i.test(price_action);

  let proposed_action: PositionAction["action"] = "HOLD";
  if (overweight) {
    proposed_action = "TRIM";
  } else if (underweight && thesis_valid && !fundamentalsSoft && !priceExtended) {
    proposed_action = "ADD";
  } else if (!thesis_valid || fundamentalsSoft) {
    proposed_action = "HOLD";
  }

  if (pricePullback && underweight && thesis_valid) {
    proposed_action = "ADD";
  }
  if (priceExtended && proposed_action === "ADD") {
    proposed_action = "HOLD";
  }

  const size_range =
    proposed_action === "ADD"
      ? "5-10%"
      : proposed_action === "TRIM"
      ? "10-15%"
      : "0%";

  const rationale = [
    `Allocation drift ${drift.toFixed(1)}% with weight at ${currentWeight.toFixed(
      1
    )}%.`,
    `Conviction tier ${allocation.conviction_tier} and ${allocation.expected_cagr}% CAGR expectation.`,
    price_action,
    fundamentals_summary,
    thesis_valid ? "Thesis intact for long-horizon hold." : "Thesis flagged; no adds.",
    `Market regime context: ${marketRegime}.`,
  ];

  const confidenceScore = Math.min(
    2,
    Math.max(0, (overweight || underweight ? 1.5 : 0.6) + (thesis_valid ? 0.4 : 0))
  );

  const proactive_triggers = [
    `ADD 5-10% if pullback holds and weight stays below ${allocation.target_weight}%`,
    `TRIM 10-15% if price extends and weight exceeds ${allocation.max_weight}%`,
    "HOLD if fundamentals weaken while thesis is under review",
  ];

  return {
    proposed_action,
    size_range,
    rationale: rationale.slice(0, 5),
    confidence: toConfidence(confidenceScore),
    proactive_triggers: proactive_triggers.slice(0, 3),
  };
};

export const buildAiActions = (
  allocations: Allocation[],
  holdings: Holding[],
  drift: DriftResult[],
  priceMap: PriceMap,
  marketRegime: MarketRegime,
  convictionThreshold: number,
  analyzeFn: AiAnalysisFn = analyzeAllocationWithAi
): PositionAction[] => {
  const weights = computeWeights(holdings, priceMap);
  return allocations
    .filter((allocation) => allocation.conviction_tier >= convictionThreshold)
    .map((allocation) => {
      const driftItem = drift.find((item) => item.asset_id === allocation.asset_id);
      const actualWeight = driftItem?.actual_weight ?? weights[allocation.asset_id] ?? 0;
      const driftValue = driftItem?.drift ?? 0;

      const aiOutput = analyzeFn({
        allocation: {
          target_weight: allocation.target_weight,
          max_weight: allocation.max_weight,
          conviction_tier: allocation.conviction_tier,
          expected_cagr: allocation.expected_cagr,
        },
        currentWeight: actualWeight,
        drift: driftValue,
        price_action: allocation.price_action,
        fundamentals_summary: allocation.fundamentals_summary,
        thesis_valid: allocation.thesis_valid,
        marketRegime,
      });

      let action = aiOutput.proposed_action;
      let size_range = aiOutput.size_range;
      const rationale = [...aiOutput.rationale];
      const confidence = aiOutput.confidence;
      let blocked = false;
      let overridden = false;
      let override_reason: string | undefined;

      if (!allocation.thesis_valid && action === "ADD") {
        action = "HOLD";
        size_range = "0%";
        overridden = true;
        override_reason = "Thesis invalidated";
        rationale.push("ADD overridden due to invalid thesis.");
      }

      if (actualWeight > allocation.max_weight && action !== "TRIM") {
        action = "TRIM";
        size_range = "10-15%";
        overridden = true;
        override_reason = override_reason
          ? `${override_reason}; max weight exceeded`
          : "Max weight exceeded";
        rationale.push("ADD overridden due to max weight constraint.");
      }

      if (action === "ADD" && actualWeight >= allocation.max_weight) {
        blocked = true;
        rationale.push("ADD blocked: already at max weight.");
      }

      if (driftItem?.max_violation) {
        rationale.push("Allocation rule override in effect.");
      }

      const proactive_triggers = parseProactiveTriggers(
        aiOutput.proactive_triggers,
        action
      );

      return {
        asset_id: allocation.asset_id,
        action,
        size_range,
        rationale: rationale.filter(Boolean).slice(0, 5),
        confidence,
        blocked,
        proactive_triggers,
        overridden,
        override_reason,
      };
    });
};
