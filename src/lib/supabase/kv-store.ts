import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

const supabase = () => createSupabaseAdminClient();

export type KvRecord<T = unknown> = {
  key: string;
  value: T;
  updated_at: string;
};

export const readKv = async <T = unknown>(key: string): Promise<KvRecord<T> | null> => {
  const { data, error } = await supabase()
    .from("kv_store")
    .select("value, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to read kv_store(${key}): ${error.message}`);
  }
  if (!data) return null;
  return { key, value: data.value as T, updated_at: data.updated_at };
};

export const writeKv = async (key: string, value: unknown): Promise<KvRecord> => {
  const now = new Date().toISOString();
  const { error } = await supabase()
    .from("kv_store")
    .upsert({ key, value, updated_at: now });
  if (error) {
    throw new Error(`Failed to write kv_store(${key}): ${error.message}`);
  }
  return { key, value, updated_at: now };
};

export const deleteKv = async (key: string): Promise<void> => {
  const { error } = await supabase().from("kv_store").delete().eq("key", key);
  if (error) {
    throw new Error(`Failed to delete kv_store(${key}): ${error.message}`);
  }
};
