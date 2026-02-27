import { getDb } from "@/lib/db";
import type { NetWorthPoint } from "@/lib/types";

const listRows = () => {
  const db = getDb();
  return db
    .prepare(
      "select date, value from net_worth_history order by sort_order asc, date asc"
    )
    .all() as { date: string; value: number }[];
};

export const listNetWorthHistory = (): NetWorthPoint[] => {
  const rows = listRows();
  return rows.map((row) => ({ date: row.date, value: row.value }));
};

const nextSortOrder = () => {
  const db = getDb();
  const row = db
    .prepare("select coalesce(max(sort_order), -1) as max_order from net_worth_history")
    .get() as { max_order: number } | undefined;
  return (row?.max_order ?? -1) + 1;
};

export const upsertNetWorthPoint = (point: NetWorthPoint): NetWorthPoint[] => {
  const db = getDb();
  const existing = db
    .prepare("select sort_order from net_worth_history where date = ?")
    .get(point.date) as { sort_order: number } | undefined;
  const sortOrder = existing?.sort_order ?? nextSortOrder();
  db.prepare(
    "insert into net_worth_history (date, value, sort_order) values (?, ?, ?) on conflict(date) do update set value = excluded.value, sort_order = excluded.sort_order"
  ).run(point.date, point.value, sortOrder);
  return listNetWorthHistory();
};

export const deleteNetWorthPoint = (date?: string) => {
  const db = getDb();
  let targetDate = date;
  if (!targetDate) {
    const lastRow = db
      .prepare(
        "select date from net_worth_history order by sort_order desc, date desc limit 1"
      )
      .get() as { date: string } | undefined;
    targetDate = lastRow?.date;
  }

  if (targetDate) {
    db.prepare("delete from net_worth_history where date = ?").run(targetDate);
  }

  return {
    removedDate: targetDate ?? null,
    history: listNetWorthHistory(),
  };
};
