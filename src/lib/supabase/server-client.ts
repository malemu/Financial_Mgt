import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServerClient = SupabaseClient;

export const createServerSupabaseClient = () => {
  return createServerComponentClient({ cookies }) as ServerClient;
};
