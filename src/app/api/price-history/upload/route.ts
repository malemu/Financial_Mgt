import { NextResponse } from "next/server";
import { updateMarketMetrics } from "@/lib/server/marketRegimeEngine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

type UploadRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type RequestPayload = {
  ticker: string;
  rows: UploadRow[];
  mode?: "append" | "replace";
};

const getAdminClient = () => createSupabaseAdminClient();

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const chunkArray = <T,>(items: T[], size = 500): T[][] => {
  if (!items.length) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const countTickerRows = async (ticker: string) => {
  const supabase = getAdminClient();
  const { count, error } = await supabase
    .from("price_history")
    .select("ticker", { count: "exact", head: true })
    .eq("ticker", ticker);
  if (error) {
    throw new Error(`Failed to count rows for ${ticker}: ${error.message}`);
  }
  return count ?? 0;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RequestPayload;
  const ticker = payload.ticker?.toUpperCase();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const replaceExisting = (payload.mode ?? "append") === "replace";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
  }
  if (!rows.length) {
    return NextResponse.json({ error: "No rows provided." }, { status: 400 });
  }

  const dates = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isValidDate(row.date)) {
      return NextResponse.json(
        { error: `Invalid date format at row ${i + 1}.` },
        { status: 400 }
      );
    }
    if (dates.has(row.date)) {
      return NextResponse.json(
        { error: `Duplicate date in upload: ${row.date}.` },
        { status: 400 }
      );
    }
    dates.add(row.date);
    if (
      !Number.isFinite(row.open) ||
      !Number.isFinite(row.high) ||
      !Number.isFinite(row.low) ||
      !Number.isFinite(row.close)
    ) {
      return NextResponse.json(
        { error: `Invalid OHLC values at ${row.date}.` },
        { status: 400 }
      );
    }
    if (i > 0 && rows[i - 1].date > row.date) {
      return NextResponse.json(
        { error: "Dates must be ordered ascending (oldest to newest)." },
        { status: 400 }
      );
    }
  }

  const supabase = getAdminClient();
  const fetchedAt = new Date().toISOString();
  const formattedRows = rows.map((row) => ({
    ticker,
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume ?? 0,
    data_source: "manual_upload",
    fetched_at: fetchedAt,
    sort_order: Number(row.date.replace(/-/g, "")),
  }));

  if (replaceExisting && formattedRows.length) {
    const dateBatches = chunkArray(
      formattedRows.map((row) => row.date)
    );
    for (const batch of dateBatches) {
      const { error } = await supabase
        .from("price_history")
        .delete()
        .eq("ticker", ticker)
        .in("date", batch);
      if (error) {
        throw new Error(`Failed to delete existing rows: ${error.message}`);
      }
    }
  }

  let inserted = 0;
  try {
    const beforeCount = await countTickerRows(ticker);
    const { error } = await supabase
      .from("price_history")
      .upsert(formattedRows, { onConflict: "ticker,date", ignoreDuplicates: !replaceExisting });
    if (error) {
      throw new Error(error.message);
    }
    const afterCount = await countTickerRows(ticker);
    inserted = replaceExisting ? rows.length : Math.max(0, afterCount - beforeCount);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to upload price history.",
        ticker,
      },
      { status: 500 }
    );
  }

  const skipped = replaceExisting ? 0 : Math.max(0, rows.length - inserted);
  let marketMetrics = null;
  try {
    marketMetrics = await updateMarketMetrics(new Date());
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Failed to rebuild market metrics after upload.";
    return NextResponse.json(
      {
        error: "Upload completed, but market metrics rebuild failed.",
        detail,
        ticker,
        inserted,
        skipped,
        fetched_at: fetchedAt,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ticker,
    inserted,
    skipped,
    mode: replaceExisting ? "replace" : "append",
    fetched_at: fetchedAt,
    market_metrics: marketMetrics,
  });
  } catch (error) {
    console.error("Price history upload failed:", error);
    return NextResponse.json(
      {
        error: "Upload failed.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
