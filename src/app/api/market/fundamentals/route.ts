import { NextResponse } from "next/server";
import { getFundamentals } from "@/lib/market-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
  }
  try {
    const result = await getFundamentals(ticker);
    if (result.error) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Fundamentals lookup failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
