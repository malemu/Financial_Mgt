import { NextResponse } from "next/server";
import { getLatestPrice } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";
  const assetType = (searchParams.get("assetType") ?? "unknown") as
    | "stock"
    | "crypto"
    | "unknown";

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await getLatestPrice(ticker, assetType);
  return NextResponse.json(result);
}
