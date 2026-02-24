import { NextResponse } from "next/server";
import { getCurrentMarketRegimeSummary } from "@/lib/server/marketRegimeEngine";

export const runtime = "nodejs";

export async function GET() {
  try {
    const summary = getCurrentMarketRegimeSummary();
    if (!summary) {
      return NextResponse.json(
        { error: "No market metrics found. Run price import." },
        { status: 404 }
      );
    }
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          error.message.includes("Insufficient market history")
            ? "No market metrics found. Run price import."
            : "Market data unavailable",
      },
      {
        status:
          error instanceof Error &&
          error.message.includes("Insufficient market history")
            ? 404
            : 500,
      }
    );
  }
}
