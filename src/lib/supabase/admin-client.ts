import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export const createSupabaseAdminClient = (): SupabaseClient => {
  if (cached) return cached;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.");
  }
  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
  return cached;
};
