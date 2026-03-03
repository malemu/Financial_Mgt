import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const getAdminClient = () => createSupabaseAdminClient();

type HistoryRow = {
  date: string;
  close: number;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await context.params;
  let ticker: string | undefined = rawTicker?.toUpperCase();
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

  const supabase = getAdminClient();
  let query = supabase
    .from("price_history")
    .select("date, close")
    .eq("ticker", ticker)
    .order("date", { ascending: true });

  if (start) {
    query = query.gte("date", start);
  }
  if (end) {
    query = query.lte("date", end);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: `Failed to load ${ticker} history: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = (data ?? []).map((row) => ({
    date: row.date as string,
    close: Number(row.close),
  })) as HistoryRow[];

  return NextResponse.json({
    ticker,
    count: rows.length,
    rows,
  });
}
