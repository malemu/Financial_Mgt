import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  Allocation,
  DriftResult,
  Holding,
  MarketRegime,
  PositionAction,
  PriceMap,
  ProactiveTrigger,
} from "@/lib/types";
import { computeWeights } from "@/lib/finance";
import { getDb } from "@/lib/db";
import { getCurrentMarketRegimeSummary } from "@/lib/server/marketRegimeEngine";

export const runtime = "nodejs";

type RequestPayload = {
  allocations: Allocation[];
  holdings: {
    asset_id: string;
    shares: number;
    entry_price?: number;
    cost_basis?: number;
  }[];
  priceMap: PriceMap;
  drift: DriftResult[];
  marketRegime: MarketRegime;
  convictionThreshold: number;
};

type LlmAction = {
  asset_id: string;
  proposed_action: PositionAction["action"];
  size_range: string;
  confidence: PositionAction["confidence"];
  rationale: string[];
  proactive_triggers: string[];
};

type PriceSignals = {
  price_vs_200dma: "above" | "below" | "unknown";
  distance_from_200dma_pct: number | null;
  distance_from_50dma_pct: number | null;
  market_structure: "higher_highs" | "lower_highs" | "range" | "unknown";
  extension_from_20ema_pct: number | null;
  is_extended: boolean | null;
  atr_trend: "expanding" | "contracting" | "unknown";
  volatility_state: "compression" | "expansion" | "unknown";
  price_context_label:
    | "pullback_in_uptrend"
    | "breakout"
    | "extended_uptrend"
    | "downtrend_rally"
    | "range"
    | "unknown";
  data_window: string;
  last_price: number | null;
  last_price_date: string | null;
  data_source: string | null;
  fetched_at: string | null;
  is_stale: boolean;
};

const parseTriggers = (
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

const applyGuardrails = (
  allocation: Allocation,
  actualWeight: number,
  llmAction: LlmAction,
  priceSignals: PriceSignals
) => {
  let action = llmAction.proposed_action;
  let size_range = llmAction.size_range;
  let rationale = [...llmAction.rationale];
  let overridden = false;
  let override_reason: string | undefined;
  let blocked = false;

  if (!allocation.thesis_valid && action === "ADD") {
    action = "HOLD";
    size_range = "0%";
    overridden = true;
    override_reason = "Thesis invalidated";
    rationale.push("ADD overridden due to invalid thesis.");
  }

  if (priceSignals.is_stale) {
    action = "HOLD";
    size_range = "0%";
    overridden = true;
    override_reason = override_reason
      ? `${override_reason}; price data stale`
      : "Price data stale";
    rationale.push("Default HOLD because price data is stale.");
  }

  if (
    action === "ADD" &&
    !["pullback_in_uptrend", "breakout"].includes(
      priceSignals.price_context_label
    )
  ) {
    action = "HOLD";
    size_range = "0%";
    overridden = true;
    override_reason = override_reason
      ? `${override_reason}; price context not favorable for adds`
      : "Price context not favorable for adds";
    rationale.push("ADD overridden due to price context label.");
  }

  if (actualWeight > allocation.max_weight && action !== "TRIM") {
    action = "TRIM";
    size_range = "10-15%";
    overridden = true;
    override_reason = override_reason
      ? `${override_reason}; max weight exceeded`
      : "Max weight exceeded";
    rationale.push("Action overridden due to max weight constraint.");
  }

  if (action === "ADD" && actualWeight >= allocation.max_weight) {
    blocked = true;
    rationale.push("ADD blocked: already at max weight.");
  }

  rationale.push(
    `Price signals: ${priceSignals.price_vs_200dma} 200DMA, ` +
      `${priceSignals.distance_from_200dma_pct !== null ? priceSignals.distance_from_200dma_pct.toFixed(1) : "n/a"}% from 200DMA, ` +
      `${priceSignals.distance_from_50dma_pct !== null ? priceSignals.distance_from_50dma_pct.toFixed(1) : "n/a"}% from 50DMA, ` +
      `${priceSignals.is_extended === null ? "extension unknown" : priceSignals.is_extended ? "extended vs 20EMA" : "not extended vs 20EMA"}, ` +
      `${priceSignals.market_structure}, ${priceSignals.price_context_label}.`
  );
  rationale.push(
    `Price data used: ${priceSignals.data_window}. Last price ${priceSignals.last_price ?? "n/a"} on ${priceSignals.last_price_date ?? "n/a"}.`
  );
  rationale.push(
    `Source ${priceSignals.data_source ?? "unknown"} fetched ${priceSignals.fetched_at ?? "n/a"}.`
  );

  return {
    action,
    size_range,
    confidence: llmAction.confidence,
    rationale: rationale.filter(Boolean).slice(0, 5),
    proactive_triggers: parseTriggers(llmAction.proactive_triggers, action),
    overridden,
    override_reason,
    blocked,
  };
};

type DbPriceRow = {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  data_source: string;
  fetched_at: string;
};

const byTicker = (rows: DbPriceRow[], ticker: string) =>
  rows
    .filter((row) => row.ticker === ticker)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

const sma = (values: number[], period: number) => {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
};

const ema = (values: number[], period: number) => {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
};

const atr = (
  highs: number[],
  lows: number[],
  closes: number[],
  period: number
) => {
  if (closes.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const high = highs[i] ?? closes[i];
    const low = lows[i] ?? closes[i];
    const prevClose = closes[i - 1];
    ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const slice = ranges.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
};

const mostRecentTradingDay = (now: Date) => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
};

const isStaleWithinWeek = (lastDate: string | null, now: Date) => {
  if (!lastDate) return true;
  const last = new Date(lastDate);
  const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 7;
};

const computePriceSignals = (
  history: DbPriceRow[],
  ticker: string
): PriceSignals => {
  const rows = byTicker(history, ticker);
  if (rows.length < 40) {
    return {
      price_vs_200dma: "unknown",
      distance_from_200dma_pct: null,
      distance_from_50dma_pct: null,
      market_structure: "unknown",
      extension_from_20ema_pct: null,
      is_extended: null,
      atr_trend: "unknown",
      volatility_state: "unknown",
      price_context_label: "unknown",
      data_window: "insufficient price history",
      last_price: null,
      last_price_date: null,
      data_source: null,
      fetched_at: null,
      is_stale: true,
    };
  }

  const closes = rows.map((row) => row.close);
  const highs = rows.map((row) => row.high ?? row.close);
  const lows = rows.map((row) => row.low ?? row.close);
  const lastClose = closes[closes.length - 1];
  const lastRow = rows[rows.length - 1];
  const sma200 = sma(closes, 200);
  const sma50 = sma(closes, 50);
  const ema20 = ema(closes.slice(-60), 20);
  const distance200 =
    sma200 !== null ? ((lastClose - sma200) / sma200) * 100 : null;
  const distance50 =
    sma50 !== null ? ((lastClose - sma50) / sma50) * 100 : null;
  const extension20 =
    ema20 !== null ? ((lastClose - ema20) / ema20) * 100 : null;
  const isExtended = extension20 !== null ? Math.abs(extension20) >= 6 : null;

  const recent = closes.slice(-20);
  const prior = closes.slice(-40, -20);
  const recentHigh = Math.max(...recent);
  const priorHigh = Math.max(...prior);
  const recentLow = Math.min(...recent);
  const priorLow = Math.min(...prior);
  let structure: PriceSignals["market_structure"] = "range";
  if (recentHigh > priorHigh && recentLow > priorLow) structure = "higher_highs";
  else if (recentHigh < priorHigh && recentLow < priorLow)
    structure = "lower_highs";

  const atr14 = atr(highs, lows, closes, 14);
  const atrPrev = atr(highs.slice(0, -14), lows.slice(0, -14), closes.slice(0, -14), 14);
  let atrTrend: PriceSignals["atr_trend"] = "unknown";
  if (atr14 !== null && atrPrev !== null) {
    atrTrend = atr14 > atrPrev ? "expanding" : "contracting";
  }
  const volState: PriceSignals["volatility_state"] =
    atr14 !== null && lastClose > 0 && atr14 / lastClose < 0.02
      ? "compression"
      : atr14 !== null
      ? "expansion"
      : "unknown";

  const priceVs200 =
    sma200 === null ? "unknown" : lastClose >= sma200 ? "above" : "below";

  let label: PriceSignals["price_context_label"] = "range";
  if (priceVs200 === "above" && lastClose >= priorHigh) {
    label = "breakout";
  } else if (
    priceVs200 === "above" &&
    isExtended === false &&
    structure === "higher_highs"
  ) {
    label = "pullback_in_uptrend";
  }
  if (priceVs200 === "above" && isExtended) {
    label = "extended_uptrend";
  }
  if (priceVs200 === "below" && structure !== "lower_highs") {
    label = "downtrend_rally";
  }

  const lastTradingDay = mostRecentTradingDay(new Date());
  const isStale = isStaleWithinWeek(lastRow?.date ?? null, new Date());

  return {
    price_vs_200dma: priceVs200,
    distance_from_200dma_pct: distance200,
    distance_from_50dma_pct: distance50,
    market_structure: structure,
    extension_from_20ema_pct: extension20,
    is_extended: isExtended,
    atr_trend: atrTrend,
    volatility_state: volState,
    price_context_label: label,
    data_window: `${rows[0]?.date ?? ""} to ${rows[rows.length - 1]?.date ?? ""}`,
    last_price: lastRow?.close ?? null,
    last_price_date: lastRow?.date ?? null,
    data_source: lastRow?.data_source ?? null,
    fetched_at: lastRow?.fetched_at ?? null,
    is_stale: isStale,
  };
};

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set." },
        { status: 500 }
      );
    }

    const payload = (await request.json()) as RequestPayload;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const db = getDb();
    const priceRows = db
      .prepare(
        "select ticker, date, open, high, low, close, volume, data_source, fetched_at from price_history order by date"
      )
      .all() as DbPriceRow[];

    const holdingsForWeights: Holding[] = payload.holdings.map((holding) => ({
      asset_id: holding.asset_id,
      shares: holding.shares,
      entry_price: holding.entry_price ?? 0,
      cost_basis: holding.cost_basis ?? 0,
    }));

    const weights = computeWeights(holdingsForWeights, payload.priceMap);
    const marketRegimeSummary = await getCurrentMarketRegimeSummary();
    const eligible = payload.allocations.filter(
      (allocation) => allocation.conviction_tier >= payload.convictionThreshold
    );

    const inputs = eligible.map((allocation) => {
      const driftItem = payload.drift.find(
        (item) => item.asset_id === allocation.asset_id
      );
      const actualWeight =
        driftItem?.actual_weight ?? weights[allocation.asset_id] ?? 0;
      const drift = driftItem?.drift ?? 0;
      const priceSignals = computePriceSignals(priceRows, allocation.asset_id);
      return {
        asset_id: allocation.asset_id,
        allocation: {
          target_weight: allocation.target_weight,
          max_weight: allocation.max_weight,
          conviction_tier: allocation.conviction_tier,
          expected_cagr: allocation.expected_cagr,
        },
        actualWeight,
        drift,
        price_signals: priceSignals,
        fundamentals_summary: allocation.fundamentals_summary,
        thesis_valid: allocation.thesis_valid,
        marketRegime: payload.marketRegime,
        marketRegimeSummary,
      };
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ai_position_management",
          strict: true,
          schema: {
            type: "object",
            properties: {
              actions: {
                type: "array",
              items: {
                type: "object",
                properties: {
                  asset_id: { type: "string" },
                    proposed_action: {
                      type: "string",
                      enum: ["ADD", "HOLD", "TRIM"],
                    },
                    size_range: { type: "string" },
                    confidence: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                    },
                    rationale: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 5,
                    },
                  proactive_triggers: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    maxItems: 3,
                  },
                },
                required: [
                  "asset_id",
                  "proposed_action",
                  "size_range",
                  "confidence",
                  "rationale",
                  "proactive_triggers",
                ],
                additionalProperties: false,
              },
            },
          },
            required: ["actions"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You are an investment position management assistant for long-term, high-conviction holdings. " +
            "Use only the provided structured price_signals fields for price action reasoning. " +
            "Do not infer price action from prose or invent data. " +
            "Return one action per position: ADD, HOLD, or TRIM. " +
            "Market regime is context only. Do not predict prices, trade frequently, or override thesis invalidation.",
        },
        {
          role: "user",
          content: JSON.stringify({
            guidance: {
              priority_order: [
                "Allocation integrity",
                "Thesis health",
                "Price context",
                "Market regime (context only)",
              ],
              notes: [
                "If actualWeight > max_weight, favor TRIM.",
                "If actualWeight < target_weight, eligible for ADD.",
                "If thesis_valid is false, do NOT recommend ADD.",
                "Weakening fundamentals bias toward HOLD or TRIM.",
                "Price action must cite: trend vs 200DMA, extension vs 20EMA, market structure, price_context_label.",
                "Default to HOLD if price_context_label is unclear or unfavorable.",
                "ADD permitted only when price_context_label is pullback_in_uptrend or breakout and allocation/thesis allow.",
                "Include a bullet stating the price data window used.",
                "Generate calm, long-term rationale and 1-3 conservative triggers.",
              ],
            },
            market_regime_summary: marketRegimeSummary,
            positions: inputs,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { actions: LlmAction[] };

    const runTimestamp = new Date().toISOString();
    const actions = parsed.actions.map((llmAction) => {
      const allocation = eligible.find(
        (item) => item.asset_id === llmAction.asset_id
      );
      if (!allocation) {
        return null;
      }
      const driftItem = payload.drift.find(
        (item) => item.asset_id === allocation.asset_id
      );
      const actualWeight =
        driftItem?.actual_weight ?? weights[allocation.asset_id] ?? 0;
      const priceSignals = computePriceSignals(priceRows, allocation.asset_id);
      const guarded = applyGuardrails(
        allocation,
        actualWeight,
        llmAction,
        priceSignals
      );
      return {
        asset_id: allocation.asset_id,
        action: guarded.action,
        size_range: guarded.size_range,
        confidence: guarded.confidence,
        rationale: guarded.rationale,
        proactive_triggers: guarded.proactive_triggers,
        blocked: guarded.blocked,
        overridden: guarded.overridden,
        override_reason: guarded.override_reason,
      } satisfies PositionAction;
    });

    return NextResponse.json({
      runTimestamp,
      actions: actions.filter(Boolean),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "AI run failed.", detail: message },
      { status: 500 }
    );
  }
}
