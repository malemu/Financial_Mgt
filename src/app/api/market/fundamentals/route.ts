import { NextResponse } from "next/server";
import { getBasicFundamentals } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await getBasicFundamentals(ticker);
  return NextResponse.json(result);
}
