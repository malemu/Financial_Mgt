import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Holding } from "@/lib/types";

type HoldingRow = Holding & { sort_order: number };

const mapRow = (row: HoldingRow): Holding => ({
  asset_id: row.asset_id,
  shares: row.shares,
  entry_price: row.entry_price,
  cost_basis: row.cost_basis,
});

const getClient = () => createSupabaseAdminClient();

const nextSortOrder = async () => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("holdings")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read holdings sort order: ${error.message}`);
  }
  return ((data?.sort_order ?? -1) as number) + 1;
};

export const listHoldings = async (): Promise<Holding[]> => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("holdings")
    .select("asset_id, shares, entry_price, cost_basis, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(`Failed to load holdings: ${error.message}`);
  }
  return (data ?? []).map(mapRow);
};

export const upsertHolding = async (holding: Holding): Promise<Holding[]> => {
  const supabase = getClient();
  const { data: existing, error: existingError } = await supabase
    .from("holdings")
    .select("sort_order")
    .eq("asset_id", holding.asset_id)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load holding sort order: ${existingError.message}`);
  }
  const sortOrder = existing?.sort_order ?? (await nextSortOrder());
  const { error } = await supabase.from("holdings").upsert({
    ...holding,
    sort_order: sortOrder,
  });
  if (error) {
    throw new Error(`Failed to upsert holding: ${error.message}`);
  }
  return listHoldings();
};

export const renameHoldingAsset = async (fromAssetId: string, toAssetId: string) => {
  const supabase = getClient();
  const { error } = await supabase
    .from("holdings")
    .update({ asset_id: toAssetId })
    .eq("asset_id", fromAssetId);
  if (error) {
    throw new Error(`Failed to rename holding asset: ${error.message}`);
  }
  return listHoldings();
};

export const deleteHolding = async (assetId: string): Promise<Holding[]> => {
  const supabase = getClient();
  const { error } = await supabase.from("holdings").delete().eq("asset_id", assetId);
  if (error) {
    throw new Error(`Failed to delete holding: ${error.message}`);
  }
  return listHoldings();
};
