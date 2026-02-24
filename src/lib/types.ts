export type AssetType = "stock" | "crypto" | "cash" | "index";
export type AllocationRole = "core growth" | "optionality" | "ballast";
export type MarketRegime = "risk-on" | "neutral" | "risk-off";
export type MarketCycleRegime = "Bull" | "Transitional" | "Bear";
export type ActionType = "ADD" | "HOLD" | "TRIM";
export type ConfidenceLevel = "low" | "medium" | "high";

export type Allocation = {
  id: string;
  asset_id: string;
  asset_type: AssetType;
  target_weight: number;
  max_weight: number;
  conviction_tier: number;
  expected_cagr: number;
  role: AllocationRole;
  thesis_summary: string;
  kill_criteria: string;
  thesis_last_review: string;
  fundamentals_summary: string;
  price_action: string;
  thesis_valid: boolean;
};

export type Holding = {
  asset_id: string;
  shares: number;
  entry_price: number;
  cost_basis: number;
};

export type TriggerRule = {
  id: string;
  asset_id: string;
  rule: string;
  approved: boolean;
};

export type GoalConfig = {
  target_net_worth: number;
  target_year: number;
};

export type NetWorthPoint = {
  date: string;
  value: number;
};

export type DriftResult = {
  asset_id: string;
  target_weight: number;
  actual_weight: number;
  drift: number;
  status: "Over" | "Under" | "Within";
  max_violation: boolean;
};

export type PositionAction = {
  asset_id: string;
  action: ActionType;
  size_range: string;
  rationale: string[];
  confidence: ConfidenceLevel;
  blocked: boolean;
  proactive_triggers: ProactiveTrigger[];
  overridden: boolean;
  override_reason?: string;
};

export type ProactiveTrigger = {
  condition: string;
  action: ActionType;
  size_range: string;
};

export type AiActionHistory = {
  timestamp: string;
  asset_id: string;
  action: ActionType;
  size_range: string;
  confidence: ConfidenceLevel;
  rationale: string[];
  proactive_triggers: ProactiveTrigger[];
  overridden: boolean;
  override_reason?: string;
};

export type GuardrailStatus = {
  orphan_positions: string[];
  stale_thesis: string[];
  silent_drift: string[];
  add_blocked: string[];
};

export type PriceMap = Record<string, number>;

export type PriceHistoryPoint = {
  ticker: string;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  data_source: string;
  fetched_at: string;
};

export type MarketRegimeSummary = {
  date: string;
  regime: MarketCycleRegime;
  sp500Above200: boolean;
  ndxAbove200: boolean;
  vixLevel: number;
  drawdownFromATH: number;
  sp500Close: number;
  sp500_50dma: number;
  sp500_200dma: number;
  sp500Vs200Pct: number;
  ndxClose: number;
  ndx_200dma: number;
  ndxVs200Pct: number;
};
