import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("price_history")
    .select(
      "ticker, start_date:min(date), latest_date:max(date), last_fetched_at:max(fetched_at)"
    )
    .order("ticker", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load price history status.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ tickers: data ?? [] });
}
