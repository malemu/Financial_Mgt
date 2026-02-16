import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDb } from "@/lib/db";
import { computeWeights, computePortfolioValue } from "@/lib/finance";
import {
  getLatestPrice,
  getHistoricalPrice,
  getCompanyNews,
  getBasicFundamentals,
} from "@/lib/market-data";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

type RequestPayload = {
  message?: string;
  history?: ChatMessage[];
  contributionPlan?: {
    amount?: number;
    frequency?: string;
  };
  marketRegime?: string;
  riskConstraints?: {
    noDayTrading?: boolean;
    rebalanceRules?: string | null;
  };
};

const MAX_HISTORY = 8;
const RATE_LIMIT_COUNT = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
};

const readKv = (db: ReturnType<typeof getDb>, key: string) => {
  const row = db
    .prepare("select value from kv_store where key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
};

const writeKv = (db: ReturnType<typeof getDb>, key: string, value: unknown) => {
  const now = new Date().toISOString();
  db.prepare(
    "insert into kv_store (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at"
  ).run(key, JSON.stringify(value), now);
};

const rateLimit = (db: ReturnType<typeof getDb>, ip: string) => {
  const key = `analyst_rl_${ip}`;
  const now = Date.now();
  const stored = readKv(db, key);
  const timestamps = Array.isArray(stored?.timestamps) ? stored.timestamps : [];
  const recent = timestamps.filter(
    (ts: number) => typeof ts === "number" && now - ts <= RATE_LIMIT_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT_COUNT) {
    return { allowed: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - recent[0]) };
  }
  recent.push(now);
  writeKv(db, key, { timestamps: recent });
  return { allowed: true, retryAfterMs: 0 };
};

const sma = (values: number[], period: number) => {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
};

const buildPriceSignals = (
  rows: { date: string; close: number }[]
): {
  lastClose: number | null;
  lastDate: string | null;
  sma50: number | null;
  sma200: number | null;
  drawdown52w: number | null;
  return52w: number | null;
  priceVs200d: "above" | "below" | "unknown";
} => {
  if (!rows.length) {
    return {
      lastClose: null,
      lastDate: null,
      sma50: null,
      sma200: null,
      drawdown52w: null,
      return52w: null,
      priceVs200d: "unknown",
    };
  }
  const closes = rows.map((row) => row.close);
  const last = rows[rows.length - 1];
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const window = closes.slice(-252);
  const max52 = window.length ? Math.max(...window) : null;
  const min52 = window.length ? Math.min(...window) : null;
  const drawdown52w =
    max52 != null && max52 > 0 ? ((last.close - max52) / max52) * 100 : null;
  const return52w =
    window.length && min52 != null && min52 > 0
      ? ((last.close - window[0]) / window[0]) * 100
      : null;
  const priceVs200d =
    sma200 == null ? "unknown" : last.close >= sma200 ? "above" : "below";
  return {
    lastClose: last.close,
    lastDate: last.date,
    sma50,
    sma200,
    drawdown52w,
    return52w,
    priceVs200d,
  };
};

export async function POST(request: Request) {
  const db = getDb();
  const ip = getClientIp(request);
  const rate = rateLimit(db, ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rate.retryAfterMs / 1000).toString(),
        },
      }
    );
  }

  const payload = (await request.json()) as RequestPayload;
  const message = payload.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key not configured." },
      { status: 500 }
    );
  }

  const allocations = db
    .prepare("select * from allocations order by sort_order")
    .all()
    .map((row: any) => ({ ...row, thesis_valid: !!row.thesis_valid }));
  const holdings = db
    .prepare("select * from holdings order by sort_order")
    .all() as {
    asset_id: string;
    shares: number;
    entry_price: number;
    cost_basis: number;
  }[];
  const prices = db
    .prepare("select * from prices order by sort_order")
    .all() as { asset_id: string; price: number }[];
  const priceMap: Record<string, number> = {};
  prices.forEach((row) => {
    priceMap[row.asset_id] = row.price;
  });

  const goal = db
    .prepare("select target_net_worth, target_year from goals where id = 1")
    .get() as { target_net_worth: number; target_year: number } | undefined;

  const triggers = db
    .prepare("select asset_id, rule, approved from triggers order by sort_order")
    .all()
    .map((row: any) => ({ ...row, approved: !!row.approved }));

  const aiHistory = db
    .prepare("select * from ai_action_history order by sort_order")
    .all()
    .map((row: any) => ({
      timestamp: row.timestamp,
      asset_id: row.asset_id,
      action: row.action,
      size_range: row.size_range,
      confidence: row.confidence,
      rationale: JSON.parse(row.rationale),
      proactive_triggers: JSON.parse(row.proactive_triggers),
      overridden: !!row.overridden,
      override_reason: row.override_reason,
    }));

  const allocationMap = new Map(
    allocations.map((allocation) => [allocation.asset_id, allocation])
  );

  const totalValue = computePortfolioValue(holdings, priceMap);
  const weights = computeWeights(holdings, priceMap);
  const allocationByAsset = holdings.map((holding) => {
    const allocation = allocationMap.get(holding.asset_id);
    const currentPrice = priceMap[holding.asset_id] ?? 0;
    const currentValue = holding.shares * currentPrice;
    return {
      ticker: holding.asset_id,
      asset_type: allocation?.asset_type ?? "unknown",
      shares: holding.shares,
      cost_basis: holding.cost_basis,
      current_price: currentPrice,
      current_value: currentValue,
      weight_pct: weights[holding.asset_id] ?? 0,
      max_allocation_pct: allocation?.max_weight ?? null,
    };
  });

  const allocationByClass = allocationByAsset.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.asset_type] = (acc[item.asset_type] ?? 0) + item.weight_pct;
      return acc;
    },
    {}
  );

  const cashPosition = allocationByAsset.find(
    (item) => item.asset_type === "cash" || item.ticker === "CASH"
  );

  const tickers = Array.from(
    new Set(allocations.map((allocation) => allocation.asset_id))
  );
  const tickerPlaceholders = tickers.map(() => "?").join(", ");
  const priceHistory = tickers.length
    ? (db
        .prepare(
          `select ticker, date, close from price_history where ticker in (${tickerPlaceholders}) order by date`
        )
        .all(...tickers) as { ticker: string; date: string; close: number }[])
    : [];

  const priceByTicker: Record<string, { date: string; close: number }[]> = {};
  priceHistory.forEach((row) => {
    if (!priceByTicker[row.ticker]) priceByTicker[row.ticker] = [];
    priceByTicker[row.ticker].push({ date: row.date, close: row.close });
  });

  const externalMarketData = tickers.map((ticker) => ({
    ticker,
    signals: buildPriceSignals(priceByTicker[ticker] ?? []),
  }));

  const now = new Date();
  const goalTarget = 1_000_000;
  const goalDeadline = "2028-12-31";
  const deadline = new Date(`${goalDeadline}T23:59:59Z`);
  const msRemaining = Math.max(deadline.getTime() - now.getTime(), 0);
  const yearsRemaining = msRemaining / (365.25 * 24 * 60 * 60 * 1000);
  const requiredMultiple =
    totalValue > 0 ? goalTarget / totalValue : null;
  const impliedCagr =
    requiredMultiple != null && yearsRemaining > 0
      ? Math.pow(requiredMultiple, 1 / yearsRemaining) - 1
      : null;
  const timeHorizonYears =
    goal?.target_year != null ? Math.max(goal.target_year - now.getUTCFullYear(), 0) : null;

  const personalCapitalCharter = {
    worldview: "Long-horizon compounding with discipline and downside awareness.",
    non_negotiables: [
      "Preserve ability to stay invested through drawdowns.",
      "Avoid leverage-driven fragility.",
      "No day trading or short-term speculation.",
      "Thesis and valuation must justify adds; price action alone is insufficient.",
    ],
    accepted_risks: [
      "Equity volatility in pursuit of long-term growth.",
      "Concentrated exposure only within stated caps.",
    ],
    behavioral_biases_to_guard: [
      "FOMO buying after rapid price increases.",
      "Panic selling during drawdowns.",
      "Confirmation bias on favorite holdings.",
    ],
  };

  const executionRuleSet = {
    buy_caps: allocations.map((allocation) => ({
      ticker: allocation.asset_id,
      max_weight: allocation.max_weight,
      conviction_tier: allocation.conviction_tier,
    })),
    trim_zones: allocations.map((allocation) => ({
      ticker: allocation.asset_id,
      trim_above_weight: allocation.max_weight,
    })),
    allocation_caps: {
      by_asset: allocations.map((allocation) => ({
        ticker: allocation.asset_id,
        max_weight: allocation.max_weight,
      })),
      by_class: allocationByClass,
    },
    phases: [
      {
        label: "2025-2026 (foundation)",
        focus: "Consistency, diversification, avoid over-concentration.",
      },
      {
        label: "2027 (acceleration)",
        focus: "Maintain exposure to core growth while guarding drawdown risk.",
      },
      {
        label: "2028 (defense)",
        focus: "Protect gains and reduce fragility ahead of goal deadline.",
      },
    ],
    anti_fomo: [
      "Do not add purely because of recent price momentum.",
      "Require thesis validation and valuation context before adding.",
    ],
    anti_panic: [
      "Do not exit solely due to drawdown without thesis break.",
      "Re-check thesis vs price movement before action.",
    ],
    emergency_fund: {
      rule: "Maintain cash buffer; do not fully deplete cash without explicit override.",
      current_cash_position: cashPosition ?? null,
    },
  };

  const goalEnvelope = {
    target_net_worth: goalTarget,
    deadline: goalDeadline,
    current_net_worth: totalValue,
    time_remaining_years: Number.isFinite(yearsRemaining) ? yearsRemaining : null,
    required_multiple: requiredMultiple,
    implied_cagr: impliedCagr,
    capital_pressure_note:
      impliedCagr != null
        ? "Implied CAGR required to reach target by deadline."
        : "Insufficient data to compute implied CAGR.",
  };

  const context = {
    generated_at: now.toISOString(),
    governing_context: {
      personal_capital_charter: personalCapitalCharter,
      execution_rule_set: executionRuleSet,
      goal_envelope: goalEnvelope,
    },
    portfolio: {
      total_value: totalValue,
      allocation_by_asset: allocationByAsset,
      allocation_by_class: allocationByClass,
      cash_position: cashPosition ?? null,
      target_allocations: allocations.map((allocation) => ({
        ticker: allocation.asset_id,
        asset_type: allocation.asset_type,
        target_weight: allocation.target_weight,
        max_weight: allocation.max_weight,
        conviction_tier: allocation.conviction_tier,
      })),
    },
    contribution_plan: payload.contributionPlan ?? null,
    market_regime: payload.marketRegime ?? null,
    time_horizon_years: timeHorizonYears,
    risk_constraints: {
      no_day_trading: payload.riskConstraints?.noDayTrading ?? null,
      rebalance_rules: payload.riskConstraints?.rebalanceRules ?? null,
      max_allocation_pct_by_asset: allocations.map((allocation) => ({
        ticker: allocation.asset_id,
        max_weight: allocation.max_weight,
      })),
    },
    stored_theses: allocations.map((allocation) => ({
      ticker: allocation.asset_id,
      role: allocation.role,
      thesis_summary: allocation.thesis_summary,
      kill_criteria: allocation.kill_criteria,
      fundamentals_summary: allocation.fundamentals_summary,
      price_action: allocation.price_action,
      thesis_valid: allocation.thesis_valid,
      thesis_last_review: allocation.thesis_last_review,
    })),
    past_decisions: aiHistory.slice(-12),
    triggers,
    market_data: externalMarketData,
  };

const systemPrompt = `
You are the "Personal Financial Analyst – Challenger Mode" for a long-term investor. You are a disciplined challenger, not a trading bot.
Your job is to pressure-test assumptions, flag risks, identify rule violations, and keep the plan aligned to the $1M-by-2028 objective.

Hierarchy (strict, always obey):
1) Personal Capital Charter
2) Execution Rule Set
3) Portfolio Snapshot
4) Market Data
5) User Prompt

Core rules:
- Never give buy/sell commands, timing advice, or price targets.
- Explicitly distinguish price movement vs thesis change.
- Distinguish valuation expansion vs fundamentals.
- Prefer base rates and arithmetic over narratives.
- State uncertainty and assumptions clearly.
- When user intent violates a rule, label it as a violation, explain the rule’s purpose, describe consequences, and ask whether they want to override knowingly.
- App data is source of truth. Read-only. Do not mutate or fabricate data.
- For news/price/trend/valuation questions: call tools, wait for results, then reason. Never say you lack access if tools exist.
- If a tool fails or returns empty data, state the limitation and proceed with bounded analysis.

Global rule: Allocation headroom is not justification.
- Allocation caps are hard limits, not approval signals.
- Always distinguish: "allowed by allocation" vs "justified by execution timing and opportunity cost."
- Never imply that remaining headroom is sufficient reason to act.
- If headroom exists, still evaluate: impact on goal probability, execution discipline (buy zones, phase logic), and whether waiting preserves optionality.
- Explicitly say when an action is permitted but unjustified.

Tone constraints for add/trim evaluations:
- Avoid generic market regime labels unless quantified.
- Do not list considerations without concluding pressure.
- End with a constraint or intent challenge, not a question.

Behavioral architecture (mandatory, internal, do not reveal to user):
1) Intent Gate (silent classification before reasoning). Choose exactly one:
- ACTION_PRESSURE
- PERMISSION_SEEKING
- DISCIPLINE_TEST
- THESIS_VALIDATION
- GOAL_FEASIBILITY
- INFORMATIONAL
This classification must be internal only and never shown to the user.

2) Response Mode Selection (choose exactly one; do not default to ANALYZE):
- BLOCK: action does not improve outcomes or violates discipline. Do not analyze further; state why action is not justified.
- SLOW_DOWN: urgency/emotion-driven. Re-anchor to rules and optionality; clarify what matters.
- ANALYZE: analysis improves decision quality. Apply Charter + Rules + data.
- RE-ANCHOR: question misaligned with stated goal. Restate objective and constraints with explicit math/conditional logic.
- ANSWER_FACTUAL: data-only. Minimal commentary.

3) Global behavioral rules (override finance logic):
- Allocation headroom ≠ justification to act.
- Timing discipline > completeness of analysis.
- Some questions deserve judgment, not detail.
- If analysis does not improve probability of $1M-by-2028, decline to analyze.

4) Tone enforcement by mode:
- BLOCK / SLOW_DOWN: short, decisive, no bullet lists, no follow-up questions.
- ANALYZE: structured, explicitly tied to Charter and Execution Rules, ends with a constraint or decision boundary.
- RE-ANCHOR: goal-first framing, explicit math or conditional logic.

5) Forbidden patterns (global):
- Do not ask permission to continue ("would you like...").
- Do not list generic considerations.
- Do not use unquantified regime labels.
- Do not end with open-ended prompts.

Decision evaluation (include in every substantive response):
- Which Charter principle applies?
- Which Execution Rule applies?
- Impact on probability of reaching $1M by 2028.
- Thesis-driven vs emotion-driven motivation.
- Effect on concentration and optionality.
- Consistency with current phase (2025–2028).
If any of the above are negative, challenge the action explicitly.

Output style:
- Analytical, direct, skeptical, professional.
- Short paragraphs and bullets where helpful.
- If data is missing, explicitly say what is missing and how that limits conclusions.

Context JSON:
${JSON.stringify(context)}
`.trim();

  const tools = [
    {
      type: "function",
      function: {
        name: "get_latest_price",
        description: "Fetch the most recent price for a ticker.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            asset_type: { type: "string", enum: ["stock", "crypto", "unknown"] },
          },
          required: ["ticker"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_historical_price",
        description: "Fetch historical close prices for a ticker.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            asset_type: { type: "string", enum: ["stock", "crypto", "unknown"] },
            start_date: { type: "string", description: "YYYY-MM-DD" },
            end_date: { type: "string", description: "YYYY-MM-DD" },
            limit: { type: "number" },
          },
          required: ["ticker"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_company_news",
        description: "Fetch recent company news headlines for a ticker.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            limit: { type: "number" },
          },
          required: ["ticker"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_basic_fundamentals",
        description: "Fetch basic company fundamentals for a ticker.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string" },
          },
          required: ["ticker"],
        },
      },
    },
  ];

  const history = Array.isArray(payload.history) ? payload.history : [];
  const filteredHistory = history
    .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
    .slice(-MAX_HISTORY);

  try {
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...filteredHistory,
      { role: "user", content: message },
    ];

    let response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 650,
      tools,
      messages,
    });

    let assistantMessage = response.choices?.[0]?.message?.content?.trim() ?? "";
    let toolCalls = response.choices?.[0]?.message?.tool_calls ?? [];
    let safetyCounter = 0;

    while (toolCalls.length && safetyCounter < 4) {
      safetyCounter += 1;
      messages.push({
        role: "assistant",
        content: response.choices?.[0]?.message?.content ?? "",
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const toolName = call.function.name;
        let toolResult: unknown = { error: "Unknown tool." };
        try {
          const args = JSON.parse(call.function.arguments || "{}") as Record<
            string,
            any
          >;
          if (toolName === "get_latest_price") {
            toolResult = await getLatestPrice(
              args.ticker,
              args.asset_type ?? "unknown"
            );
          } else if (toolName === "get_historical_price") {
            toolResult = await getHistoricalPrice(
              args.ticker,
              args.asset_type ?? "unknown",
              args.start_date ?? null,
              args.end_date ?? null,
              args.limit ?? null
            );
          } else if (toolName === "get_company_news") {
            toolResult = await getCompanyNews(args.ticker, args.limit ?? 6);
          } else if (toolName === "get_basic_fundamentals") {
            toolResult = await getBasicFundamentals(args.ticker);
          }
        } catch (toolError) {
          toolResult = {
            error:
              toolError instanceof Error
                ? toolError.message
                : "Tool execution failed.",
          };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: JSON.stringify(toolResult),
        });
      }

      response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 650,
        tools,
        messages,
      });
      assistantMessage = response.choices?.[0]?.message?.content?.trim() ?? "";
      toolCalls = response.choices?.[0]?.message?.tool_calls ?? [];
    }

    db.prepare(
      `insert into analyst_chat_log (
        created_at, ip, model, user_message, assistant_message, context_json, prompt_tokens, completion_tokens
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      new Date().toISOString(),
      ip,
      response.model ?? "gpt-4o-mini",
      message,
      assistantMessage,
      JSON.stringify(context),
      response.usage?.prompt_tokens ?? null,
      response.usage?.completion_tokens ?? null
    );

    return NextResponse.json({
      reply:
        assistantMessage ||
        "I could not generate a response with the available data.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI response failed.";
    return NextResponse.json(
      { error: "Analyst response failed.", detail: message },
      { status: 500 }
    );
  }
}
