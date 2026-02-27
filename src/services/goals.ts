import { getDb } from "@/lib/db";
import type { GoalConfig } from "@/lib/types";

const GOAL_ROW_ID = 1;

export const getGoal = (): GoalConfig | null => {
  const db = getDb();
  const row = db
    .prepare(
      "select target_net_worth as target_net_worth, target_year as target_year from goals where id = ?"
    )
    .get(GOAL_ROW_ID) as { target_net_worth: number; target_year: number } | undefined;

  if (!row) {
    return null;
  }

  return {
    target_net_worth: row.target_net_worth ?? 0,
    target_year: row.target_year ?? new Date().getFullYear(),
  } satisfies GoalConfig;
};

export const upsertGoal = (goal: GoalConfig): GoalConfig => {
  const db = getDb();
  db.prepare(
    "insert into goals (id, target_net_worth, target_year) values (?, ?, ?) on conflict(id) do update set target_net_worth = excluded.target_net_worth, target_year = excluded.target_year"
  ).run(GOAL_ROW_ID, goal.target_net_worth, goal.target_year);
  return getGoal() ?? goal;
};
