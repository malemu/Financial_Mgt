import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const snapshotDir = path.join(projectRoot, "strategic_snapshot");

const supabase = createSupabaseAdminClient();

const chunk = <T,>(input: T[], size: number): T[][] => {
  if (input.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
};

const readJson = async <T>(filename: string, fallback: T): Promise<T> => {
  const fullPath = path.join(snapshotDir, filename);
  const raw = await fs.readFile(fullPath, "utf-8");
  return JSON.parse(raw) as T;
};

const replaceAllocations = async () => {
  const allocations = await readJson<AllocationRow[]>("allocations.json", []);
  if (!allocations.length) return;
  await supabase.from("allocations").delete().neq("id", "");
  const rows = allocations.map((row, index) => ({
    ...row,
    thesis_valid: !!row.thesis_valid,
    sort_order: index,
  }));
  await supabase.from("allocations").insert(rows);
};

type AllocationRow = {
  id: string;
  asset_id: string;
  asset_type: string;
  target_weight: number;
  max_weight: number;
  conviction_tier: number;
  expected_cagr: number;
  role: string;
  thesis_summary: string;
  kill_criteria: string;
  thesis_last_review: string;
  fundamentals_summary: string;
  price_action: string;
  thesis_valid: number | boolean;
  sort_order?: number;
};

const replaceHoldings = async () => {
  const holdings = await readJson<any[]>("holdings.json", []);
  if (!holdings.length) return;
  await supabase.from("holdings").delete().neq("asset_id", "");
  const rows = holdings.map((row, index) => ({ ...row, sort_order: index }));
  await supabase.from("holdings").insert(rows);
};

const replaceNetWorthHistory = async () => {
  const history = await readJson<any[]>("net_worth_history.json", []);
  if (!history.length) return;
  await supabase.from("net_worth_history").delete().not("date", "is", null);
  const rows = history.map((row, index) => ({ ...row, sort_order: index }));
  await supabase.from("net_worth_history").insert(rows);
};

const replaceGoal = async () => {
  const goals = await readJson<any[]>("goals.json", []);
  if (!goals.length) return;
  const [{ target_net_worth, target_year }] = goals;
  await supabase.from("goals").upsert({
    id: 1,
    target_net_worth,
    target_year,
  });
};

const replaceBuyRentInputs = async () => {
  try {
    const data = await readJson<unknown>("buy_rent_inputs.json", null);
    if (!data) return;
    await supabase
      .from("buy_rent_inputs")
      .upsert({ id: 1, data });
  } catch (error) {
    console.warn("Skipping buy_rent_inputs.json:", error);
  }
};

const replacePriceHistory = async () => {
  try {
    const byTicker = await readJson<Record<string, PriceHistoryRow[]>>(
      "macro_price_history_by_ticker.json",
      {}
    );
    const rows = Object.values(byTicker).flat();
    if (!rows.length) return;
    await supabase.from("price_history").delete().neq("ticker", "");
    for (const batch of chunk(rows, 500)) {
      await supabase.from("price_history").insert(batch);
    }
  } catch (error) {
    console.warn("Skipping macro_price_history_by_ticker.json:", error);
  }
};

type PriceHistoryRow = {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  data_source: string;
  fetched_at: string;
  sort_order: number;
};

const replaceLocalMarketActivity = async () => {
  try {
    const rows = await readJson<any[]>("local_market_activity.json", []);
    if (!rows.length) return;
    await supabase.from("local_market_activity").delete().neq("market_id", "");
    for (const batch of chunk(rows, 500)) {
      await supabase.from("local_market_activity").insert(batch);
    }
  } catch (error) {
    console.warn("Skipping local_market_activity.json:", error);
  }
};

const replaceMarketMetrics = async () => {
  try {
    const rows = await readJson<any[]>("market_metrics.json", []);
    if (!rows.length) return;
    await supabase.from("market_metrics").delete().neq("id", "");
    for (const batch of chunk(rows, 500)) {
      await supabase.from("market_metrics").insert(batch);
    }
  } catch (error) {
    console.warn("Skipping market_metrics.json:", error);
  }
};

const main = async () => {
  console.log("Seeding Supabase from strategic_snapshot/");
  await replaceGoal();
  console.log("- goals");
  await replaceAllocations();
  console.log("- allocations");
  await replaceHoldings();
  console.log("- holdings");
  await replaceNetWorthHistory();
  console.log("- net worth history");
  await replaceBuyRentInputs();
  console.log("- buy-rent inputs");
  await replacePriceHistory();
  console.log("- price history");
  await replaceLocalMarketActivity();
  console.log("- local market activity");
  await replaceMarketMetrics();
  console.log("- market metrics");
  console.log("Seed complete.");
};

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
