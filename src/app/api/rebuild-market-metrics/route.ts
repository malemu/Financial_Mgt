import { NextResponse } from "next/server";
import { updateMarketMetrics } from "@/lib/server/marketRegimeEngine";

export const runtime = "nodejs";

export async function POST() {
  try {
    updateMarketMetrics(new Date());
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to rebuild market metrics.",
      },
      { status: 500 }
    );
  }
}
