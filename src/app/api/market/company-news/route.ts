import { NextResponse } from "next/server";
import { getCompanyNews } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker") ?? "";
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 6;

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await getCompanyNews(ticker, Number.isFinite(limit) ? limit : 6);
  return NextResponse.json(result);
}
