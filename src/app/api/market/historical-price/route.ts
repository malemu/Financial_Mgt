import { NextResponse } from "next/server";
import { getHistoricalPrice } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";
  const assetType = (searchParams.get("assetType") ?? "unknown") as
    | "stock"
    | "crypto"
    | "unknown";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : null;

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await getHistoricalPrice(
    ticker,
    assetType,
    startDate,
    endDate,
    Number.isFinite(limit) ? limit : null
  );
  return NextResponse.json(result);
}
