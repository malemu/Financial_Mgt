import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { updateMarketMetrics } from "@/lib/server/marketRegimeEngine";

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
};

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function POST(request: Request) {
  const payload = (await request.json()) as RequestPayload;
  const ticker = payload.ticker?.toUpperCase();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

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

  const db = getDb();
  const fetchedAt = new Date().toISOString();
  const insert = db.prepare(
    `insert or ignore into price_history (
      ticker, date, open, high, low, close, volume, data_source, fetched_at, sort_order
    ) values (
      @ticker, @date, @open, @high, @low, @close, @volume, @data_source, @fetched_at, @sort_order
    )`
  );

  const tx = db.transaction((items: UploadRow[]) => {
    let inserted = 0;
    items.forEach((row) => {
      const info = insert.run({
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
      });
      if (info.changes) inserted += 1;
    });
    return inserted;
  });

  const inserted = tx(rows);
  const skipped = rows.length - inserted;
  let marketMetrics = null;
  try {
    marketMetrics = updateMarketMetrics(new Date());
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
    fetched_at: fetchedAt,
    market_metrics: marketMetrics,
  });
}
