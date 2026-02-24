import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type DailyRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type WeeklyCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type LinePoint = {
  time: string;
  value: number;
};

const toWeekStartIso = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const dayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOffset);
  return date.toISOString().split("T")[0];
};

const aggregateToWeekly = (rows: DailyRow[]) => {
  const map = new Map<string, WeeklyCandle>();
  rows.forEach((row) => {
    const week = toWeekStartIso(row.date);
    const existing = map.get(week);
    if (!existing) {
      map.set(week, {
        time: week,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      });
      return;
    }
    existing.high = Math.max(existing.high, Number(row.high));
    existing.low = Math.min(existing.low, Number(row.low));
    existing.close = Number(row.close);
  });

  return Array.from(map.values())
    .filter(
      (item) =>
        /^\d{4}-\d{2}-\d{2}$/.test(item.time) &&
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close)
    )
    .sort((a, b) => a.time.localeCompare(b.time));
};

const movingAverage = (candles: WeeklyCandle[], period: number) => {
  const points: LinePoint[] = [];
  let rolling = 0;

  for (let i = 0; i < candles.length; i += 1) {
    rolling += candles[i].close;
    if (i >= period) {
      rolling -= candles[i - period].close;
    }
    if (i >= period - 1) {
      points.push({
        time: candles[i].time,
        value: rolling / period,
      });
    }
  }

  return points
    .filter(
      (item) =>
        /^\d{4}-\d{2}-\d{2}$/.test(item.time) && Number.isFinite(item.value)
    )
    .sort((a, b) => a.time.localeCompare(b.time));
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.toUpperCase().trim();

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const db = getDb();
  const rows = db
    .prepare(
      "select date, open, high, low, close from price_history where ticker = ? order by date asc"
    )
    .all(ticker) as DailyRow[];

  if (!rows.length) {
    return NextResponse.json({ candles: [], ma50: [], ma200: [] });
  }

  const candles = aggregateToWeekly(rows);
  const ma50 = movingAverage(candles, 50);
  const ma200 = movingAverage(candles, 200);

  return NextResponse.json({
    candles,
    ma50,
    ma200,
  });
}
