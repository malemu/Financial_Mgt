import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { NetWorthPoint } from "@/lib/types";

const getClient = () => createSupabaseAdminClient();

const listRows = async () => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("net_worth_history")
    .select("date, value")
    .order("sort_order", { ascending: true })
    .order("date", { ascending: true });
  if (error) {
    throw new Error(`Failed to load net worth history: ${error.message}`);
  }
  return data ?? [];
};

export const listNetWorthHistory = async (): Promise<NetWorthPoint[]> => {
  const rows = await listRows();
  return rows.map((row) => ({ date: row.date, value: row.value }));
};

const nextSortOrder = async () => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("net_worth_history")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read net worth sort order: ${error.message}`);
  }
  return ((data?.sort_order ?? -1) as number) + 1;
};

export const upsertNetWorthPoint = async (point: NetWorthPoint): Promise<NetWorthPoint[]> => {
  const supabase = getClient();
  const { data: existing, error: existingError } = await supabase
    .from("net_worth_history")
    .select("sort_order")
    .eq("date", point.date)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load net worth sort order: ${existingError.message}`);
  }
  const sortOrder = existing?.sort_order ?? (await nextSortOrder());
  const { error } = await supabase.from("net_worth_history").upsert({
    date: point.date,
    value: point.value,
    sort_order: sortOrder,
  });
  if (error) {
    throw new Error(`Failed to upsert net worth point: ${error.message}`);
  }
  return listNetWorthHistory();
};

export const deleteNetWorthPoint = async (date?: string) => {
  const supabase = getClient();
  let targetDate = date;
  if (!targetDate) {
    const { data, error } = await supabase
      .from("net_worth_history")
      .select("date")
      .order("sort_order", { ascending: false })
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch latest net worth point: ${error.message}`);
    }
    targetDate = data?.date ?? undefined;
  }

  if (targetDate) {
    const { error } = await supabase.from("net_worth_history").delete().eq("date", targetDate);
    if (error) {
      throw new Error(`Failed to delete net worth point: ${error.message}`);
    }
  }

  return {
    removedDate: targetDate ?? null,
    history: await listNetWorthHistory(),
  };
};
