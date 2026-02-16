import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `select ticker,
        min(date) as start_date,
        max(date) as latest_date,
        max(fetched_at) as last_fetched_at
      from price_history
      group by ticker
      order by ticker`
    )
    .all();
  return NextResponse.json({ tickers: rows });
}
