import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function GET(
  request: Request,
  context: { params: { ticker: string } }
) {
  const { ticker: rawTicker } = await context.params;
  let ticker = rawTicker?.toUpperCase();
  if (!ticker) {
    try {
      const pathname = new URL(request.url).pathname;
      const parts = pathname.split("/").filter(Boolean);
      ticker = parts[parts.length - 1]?.toUpperCase();
    } catch {
      ticker = undefined;
    }
  }
  ticker = ticker?.trim();
  if (!ticker) {
    return NextResponse.json({ error: "Ticker required." }, { status: 400 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (start && !isValidDate(start)) {
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  }
  if (end && !isValidDate(end)) {
    return NextResponse.json({ error: "Invalid end date." }, { status: 400 });
  }

  const db = getDb();
  let query = "select date, close from price_history where ticker = ?";
  const params: Array<string> = [ticker];

  if (start && end) {
    query += " and date between ? and ?";
    params.push(start, end);
  } else if (start) {
    query += " and date >= ?";
    params.push(start);
  } else if (end) {
    query += " and date <= ?";
    params.push(end);
  }

  query += " order by date asc";

  const rows = db.prepare(query).all(...params) as { date: string; close: number }[];

  return NextResponse.json({
    ticker,
    count: rows.length,
    rows,
  });
}
