import { getDb } from "@/lib/db";
import type { Allocation } from "@/lib/types";

type AllocationRow = {
  id: string;
  asset_id: string;
  asset_type: Allocation["asset_type"];
  target_weight: number;
  max_weight: number;
  conviction_tier: number;
  expected_cagr: number;
  role: Allocation["role"];
  thesis_summary: string;
  kill_criteria: string;
  thesis_last_review: string;
  fundamentals_summary: string;
  price_action: string;
  thesis_valid: number;
  sort_order: number;
};

const mapRow = (row: AllocationRow): Allocation => ({
  id: row.id,
  asset_id: row.asset_id,
  asset_type: row.asset_type,
  target_weight: row.target_weight,
  max_weight: row.max_weight,
  conviction_tier: row.conviction_tier,
  expected_cagr: row.expected_cagr,
  role: row.role,
  thesis_summary: row.thesis_summary,
  kill_criteria: row.kill_criteria,
  thesis_last_review: row.thesis_last_review,
  fundamentals_summary: row.fundamentals_summary,
  price_action: row.price_action,
  thesis_valid: Boolean(row.thesis_valid),
});

const nextSortOrder = () => {
  const db = getDb();
  const row = db
    .prepare("select coalesce(max(sort_order), -1) as max_order from allocations")
    .get() as { max_order: number } | undefined;
  return (row?.max_order ?? -1) + 1;
};

export const listAllocations = (): Allocation[] => {
  const db = getDb();
  const rows = db
    .prepare(
      `select id, asset_id, asset_type, target_weight, max_weight, conviction_tier,
        expected_cagr, role, thesis_summary, kill_criteria, thesis_last_review,
        fundamentals_summary, price_action, thesis_valid, sort_order from allocations
       order by sort_order asc, id asc`
    )
    .all() as AllocationRow[];
  return rows.map(mapRow);
};

export const upsertAllocation = (allocation: Allocation): Allocation[] => {
  const db = getDb();
  const existing = db
    .prepare("select sort_order from allocations where id = ?")
    .get(allocation.id) as { sort_order: number } | undefined;
  const sortOrder = existing?.sort_order ?? nextSortOrder();
  db.prepare(
    `insert into allocations (
      id, asset_id, asset_type, target_weight, max_weight, conviction_tier,
      expected_cagr, role, thesis_summary, kill_criteria, thesis_last_review,
      fundamentals_summary, price_action, thesis_valid, sort_order
    ) values (
      @id, @asset_id, @asset_type, @target_weight, @max_weight, @conviction_tier,
      @expected_cagr, @role, @thesis_summary, @kill_criteria, @thesis_last_review,
      @fundamentals_summary, @price_action, @thesis_valid, @sort_order
    ) on conflict(id) do update set
      asset_id = excluded.asset_id,
      asset_type = excluded.asset_type,
      target_weight = excluded.target_weight,
      max_weight = excluded.max_weight,
      conviction_tier = excluded.conviction_tier,
      expected_cagr = excluded.expected_cagr,
      role = excluded.role,
      thesis_summary = excluded.thesis_summary,
      kill_criteria = excluded.kill_criteria,
      thesis_last_review = excluded.thesis_last_review,
      fundamentals_summary = excluded.fundamentals_summary,
      price_action = excluded.price_action,
      thesis_valid = excluded.thesis_valid,
      sort_order = excluded.sort_order`
  ).run({
    ...allocation,
    thesis_valid: allocation.thesis_valid ? 1 : 0,
    sort_order: sortOrder,
  });
  return listAllocations();
};

export const deleteAllocation = (id: string): Allocation[] => {
  const db = getDb();
  db.prepare("delete from allocations where id = ?").run(id);
  return listAllocations();
};
