import {
  Allocation,
  AiActionHistory,
  GoalConfig,
  Holding,
  NetWorthPoint,
  PriceHistoryPoint,
  TriggerRule,
} from "./types";

export const defaultGoal: GoalConfig = {
  target_net_worth: 1_000_000,
  target_year: 2028,
};

export const defaultAllocations: Allocation[] = [
  {
    id: "alloc-nvda",
    asset_id: "NVDA",
    asset_type: "stock",
    target_weight: 22,
    max_weight: 28,
    conviction_tier: 5,
    expected_cagr: 32,
    role: "core growth",
    thesis_summary: "Compute dominance across AI infrastructure stack.",
    kill_criteria: "Margins compress for 3 consecutive quarters.",
    thesis_last_review: "2025-11-10",
    fundamentals_summary: "Revenue acceleration and expanding data center mix.",
    price_action: "Price extended 2.1x above 200-day, momentum cooling.",
    thesis_valid: true,
  },
  {
    id: "alloc-meta",
    asset_id: "META",
    asset_type: "stock",
    target_weight: 16,
    max_weight: 22,
    conviction_tier: 4,
    expected_cagr: 26,
    role: "core growth",
    thesis_summary: "Operating leverage + AI-driven ad efficiency.",
    kill_criteria: "Engagement stalls and ad ARPU declines.",
    thesis_last_review: "2025-07-08",
    fundamentals_summary: "Cost discipline supports margin expansion.",
    price_action: "Recovered from drawdown, trend stabilizing.",
    thesis_valid: true,
  },
  {
    id: "alloc-btc",
    asset_id: "BTC",
    asset_type: "crypto",
    target_weight: 18,
    max_weight: 25,
    conviction_tier: 5,
    expected_cagr: 35,
    role: "optionality",
    thesis_summary: "Scarcity plus accelerating institutional adoption.",
    kill_criteria: "Regulatory clampdown blocks U.S. access.",
    thesis_last_review: "2025-06-02",
    fundamentals_summary: "ETF flows steady, exchange reserves falling.",
    price_action: "Higher highs; volatility compressing.",
    thesis_valid: true,
  },
  {
    id: "alloc-cash",
    asset_id: "CASH",
    asset_type: "cash",
    target_weight: 12,
    max_weight: 18,
    conviction_tier: 3,
    expected_cagr: 4,
    role: "ballast",
    thesis_summary: "Dry powder for high-conviction adds.",
    kill_criteria: "Real yields below 1% for 6 months.",
    thesis_last_review: "2025-09-01",
    fundamentals_summary: "Rates still supportive for short duration.",
    price_action: "Stable.",
    thesis_valid: true,
  },
];

export const defaultHoldings: Holding[] = [
  {
    asset_id: "NVDA",
    shares: 120,
    entry_price: 310,
    cost_basis: 37_200,
  },
  {
    asset_id: "META",
    shares: 90,
    entry_price: 240,
    cost_basis: 21_600,
  },
  {
    asset_id: "BTC",
    shares: 1.4,
    entry_price: 32000,
    cost_basis: 44_800,
  },
  {
    asset_id: "CASH",
    shares: 50_470,
    entry_price: 1,
    cost_basis: 50_470,
  },
  {
    asset_id: "TSLA",
    shares: 30,
    entry_price: 160,
    cost_basis: 4_800,
  },
];

export const defaultTriggers: TriggerRule[] = [
  {
    id: "trig-nvda-1",
    asset_id: "NVDA",
    rule: "If price >= 600 and weight > target + 5%, trim 10-15%.",
    approved: true,
  },
  {
    id: "trig-meta-1",
    asset_id: "META",
    rule: "If conviction drops to 3, freeze adds until thesis review.",
    approved: true,
  },
  {
    id: "trig-btc-1",
    asset_id: "BTC",
    rule: "If drawdown > 25% in 30 days, hold and reassess.",
    approved: false,
  },
];

export const defaultNetWorthHistory: NetWorthPoint[] = [
  { date: "2025-04-01", value: 302_000 },
  { date: "2025-05-01", value: 326_500 },
  { date: "2025-06-01", value: 344_200 },
  { date: "2025-07-01", value: 368_700 },
  { date: "2025-08-01", value: 381_900 },
  { date: "2025-09-01", value: 398_200 },
  { date: "2025-10-01", value: 412_880 },
];

export const defaultAiActionHistory: AiActionHistory[] = [];

export const defaultCashBuffer = 50_470;

export const defaultPriceMap = {
  NVDA: 520,
  META: 380,
  BTC: 61500,
  CASH: 1,
  TSLA: 210,
};

export const defaultPriceHistory: PriceHistoryPoint[] = [];
