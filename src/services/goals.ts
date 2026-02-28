import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { GoalConfig } from "@/lib/types";

const GOAL_ROW_ID = 1;

export const getGoal = async (): Promise<GoalConfig | null> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("goals")
    .select("target_net_worth, target_year")
    .eq("id", GOAL_ROW_ID)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load goal: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return {
    target_net_worth: data.target_net_worth ?? 0,
    target_year: data.target_year ?? new Date().getFullYear(),
  } satisfies GoalConfig;
};

export const upsertGoal = async (goal: GoalConfig): Promise<GoalConfig> => {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("goals").upsert({
    id: GOAL_ROW_ID,
    target_net_worth: goal.target_net_worth,
    target_year: goal.target_year,
  });
  if (error) {
    throw new Error(`Failed to upsert goal: ${error.message}`);
  }
  return (await getGoal()) ?? goal;
};
