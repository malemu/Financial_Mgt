-- Core schema for Supabase persistence
-- Mirrors the prior SQLite structure used locally

create table if not exists public.goals (
  id bigint primary key,
  target_net_worth numeric not null,
  target_year integer not null
);

alter table public.goals disable row level security;

create table if not exists public.allocations (
  id text primary key,
  asset_id text not null,
  asset_type text not null,
  target_weight numeric not null,
  max_weight numeric not null,
  conviction_tier integer not null,
  expected_cagr numeric not null,
  role text not null,
  thesis_summary text not null,
  kill_criteria text not null,
  thesis_last_review text not null,
  fundamentals_summary text not null,
  price_action text not null,
  thesis_valid boolean not null default true,
  sort_order integer not null
);

create index if not exists allocations_sort_idx on public.allocations(sort_order, id);
alter table public.allocations disable row level security;

create table if not exists public.holdings (
  asset_id text primary key,
  shares numeric not null,
  entry_price numeric not null,
  cost_basis numeric not null,
  sort_order integer not null
);

create index if not exists holdings_sort_idx on public.holdings(sort_order);
alter table public.holdings disable row level security;

create table if not exists public.prices (
  asset_id text primary key,
  price numeric not null,
  sort_order integer not null
);

create index if not exists prices_sort_idx on public.prices(sort_order);
alter table public.prices disable row level security;

create table if not exists public.price_history (
  ticker text not null,
  date date not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  data_source text not null,
  fetched_at timestamptz not null,
  sort_order bigint not null,
  constraint price_history_pkey primary key (ticker, date)
);

create index if not exists price_history_sort_idx on public.price_history(sort_order);
alter table public.price_history disable row level security;

create table if not exists public.net_worth_history (
  date date primary key,
  value numeric not null,
  sort_order integer not null
);

alter table public.net_worth_history disable row level security;

create table if not exists public.ai_action_history (
  id bigserial primary key,
  timestamp timestamptz not null,
  asset_id text not null,
  action text not null,
  size_range text not null,
  confidence text not null,
  rationale text not null,
  proactive_triggers text not null,
  overridden boolean not null default false,
  override_reason text,
  sort_order integer not null
);

alter table public.ai_action_history disable row level security;

create table if not exists public.dismissed_drift (
  asset_id text primary key,
  sort_order integer not null
);

alter table public.dismissed_drift disable row level security;

create table if not exists public.kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null
);

alter table public.kv_store disable row level security;

create table if not exists public.analyst_chat_log (
  id bigserial primary key,
  created_at timestamptz not null,
  ip text,
  model text not null,
  user_message text not null,
  assistant_message text not null,
  context_json jsonb not null,
  prompt_tokens integer,
  completion_tokens integer
);

alter table public.analyst_chat_log disable row level security;

create table if not exists public.buy_rent_inputs (
  id integer primary key default 1,
  data jsonb not null
);

alter table public.buy_rent_inputs disable row level security;

create table if not exists public.local_market_activity (
  market_id text not null,
  date date not null,
  inventory integer not null,
  median_sale_price numeric,
  months_supply numeric not null,
  days_on_market integer not null,
  new_listings integer not null,
  closed_sales integer not null,
  data_source text not null,
  fetched_at timestamptz not null,
  sort_order integer not null,
  constraint local_market_activity_pkey primary key (market_id, date)
);

create index if not exists local_market_activity_sort_idx on public.local_market_activity(sort_order);
alter table public.local_market_activity disable row level security;

create table if not exists public.market_metrics (
  id text primary key,
  date date not null unique,
  sp500_close numeric not null,
  sp500_50dma numeric not null,
  sp500_200dma numeric not null,
  sp500_vs200pct numeric not null,
  sp500_above_200 boolean not null,
  ndx_close numeric not null,
  ndx_200dma numeric not null,
  ndx_vs200pct numeric not null,
  ndx_above_200 boolean not null,
  vix_level numeric not null,
  drawdown_from_ath numeric not null,
  regime text not null,
  created_at timestamptz not null default now()
);

alter table public.market_metrics disable row level security;
