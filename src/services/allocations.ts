import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
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
  thesis_valid: boolean;
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

const getClient = () => createSupabaseAdminClient();

const nextSortOrder = async () => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("allocations")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read allocations sort order: ${error.message}`);
  }
  return ((data?.sort_order ?? -1) as number) + 1;
};

export const listAllocations = async (): Promise<Allocation[]> => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("allocations")
    .select(
      "id, asset_id, asset_type, target_weight, max_weight, conviction_tier, expected_cagr, role, thesis_summary, kill_criteria, thesis_last_review, fundamentals_summary, price_action, thesis_valid, sort_order"
    )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    throw new Error(`Failed to load allocations: ${error.message}`);
  }
  return (data ?? []).map(mapRow);
};

export const upsertAllocation = async (allocation: Allocation): Promise<Allocation[]> => {
  const supabase = getClient();
  const { data: existing, error: existingError } = await supabase
    .from("allocations")
    .select("sort_order")
    .eq("id", allocation.id)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load allocation sort order: ${existingError.message}`);
  }
  const sortOrder = existing?.sort_order ?? (await nextSortOrder());
  const { error } = await supabase.from("allocations").upsert({
    ...allocation,
    thesis_valid: allocation.thesis_valid,
    sort_order: sortOrder,
  });
  if (error) {
    throw new Error(`Failed to upsert allocation: ${error.message}`);
  }
  return listAllocations();
};

export const deleteAllocation = async (id: string): Promise<Allocation[]> => {
  const supabase = getClient();
  const { error } = await supabase.from("allocations").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete allocation: ${error.message}`);
  }
  return listAllocations();
};
