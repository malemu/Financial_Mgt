import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeRegimeFromSeries, buildPortfolioSeries } from "@/lib/market-regime";

export const runtime = "nodejs";

type HoldingInput = { asset_id: string; shares: number };

export async function POST(request: Request) {
  const payload = (await request.json()) as { holdings?: HoldingInput[] };
  const holdings = (payload.holdings ?? []).filter(
    (holding) => holding.asset_id && holding.shares > 0
  );
  if (!holdings.length) {
    return NextResponse.json({
      regime: "neutral",
      score: null,
      metrics: null,
      notes: ["No holdings provided."],
    });
  }

  const db = getDb();
  const histories = new Map<string, { date: string; close: number }[]>();
  holdings.forEach((holding) => {
    const rows = db
      .prepare(
        "select date, close from price_history where ticker = ? order by date asc"
      )
      .all(holding.asset_id) as { date: string; close: number }[];
    if (rows.length) {
      histories.set(holding.asset_id, rows);
    }
  });

  const series = buildPortfolioSeries(holdings, histories);
  const result = computeRegimeFromSeries(series);
  if (!series.length) {
    return NextResponse.json({
      ...result,
      notes: [...result.notes, "No overlapping price history found."],
    });
  }
  return NextResponse.json(result);
}
