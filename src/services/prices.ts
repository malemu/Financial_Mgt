import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { PriceMap } from "@/lib/types";

type PriceRow = {
  asset_id: string;
  price: number;
  sort_order: number;
};

const getClient = () => createSupabaseAdminClient();

const mapRowsToPriceMap = (rows: PriceRow[]): PriceMap => {
  return rows.reduce<PriceMap>((acc, row) => {
    acc[row.asset_id] = row.price;
    return acc;
  }, {});
};

const listPriceRows = async () => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("prices")
    .select("asset_id, price, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(`Failed to load prices: ${error.message}`);
  }
  return (data ?? []) as PriceRow[];
};

const nextSortOrder = async () => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("prices")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read price sort order: ${error.message}`);
  }
  return ((data?.sort_order ?? -1) as number) + 1;
};

export const getPriceMap = async (): Promise<PriceMap> => {
  return mapRowsToPriceMap(await listPriceRows());
};

export const setAssetPrice = async (assetId: string, price: number): Promise<PriceMap> => {
  const supabase = getClient();
  const { data: existing, error: existingError } = await supabase
    .from("prices")
    .select("sort_order")
    .eq("asset_id", assetId)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load price sort order: ${existingError.message}`);
  }
  const sortOrder = existing?.sort_order ?? (await nextSortOrder());
  const { error } = await supabase.from("prices").upsert({
    asset_id: assetId,
    price,
    sort_order: sortOrder,
  });
  if (error) {
    throw new Error(`Failed to set asset price: ${error.message}`);
  }
  return getPriceMap();
};

export const ensureAssetPrice = async (
  assetId: string,
  defaultPrice = 0
): Promise<PriceMap> => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("prices")
    .select("price")
    .eq("asset_id", assetId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to check asset price: ${error.message}`);
  }
  if (data) {
    return getPriceMap();
  }
  return setAssetPrice(assetId, defaultPrice);
};

export const renameAssetPrice = async (fromAssetId: string, toAssetId: string): Promise<PriceMap> => {
  const supabase = getClient();
  const { error } = await supabase
    .from("prices")
    .update({ asset_id: toAssetId })
    .eq("asset_id", fromAssetId);
  if (error) {
    throw new Error(`Failed to rename price entry: ${error.message}`);
  }
  return getPriceMap();
};

export const deleteAssetPrice = async (assetId: string): Promise<PriceMap> => {
  const supabase = getClient();
  const { error } = await supabase.from("prices").delete().eq("asset_id", assetId);
  if (error) {
    throw new Error(`Failed to delete asset price: ${error.message}`);
  }
  return getPriceMap();
};
