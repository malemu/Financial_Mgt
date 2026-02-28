import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAllocation, listAllocations, upsertAllocation } from "@/services/allocations";
import type { Allocation } from "@/lib/types";

export const runtime = "nodejs";

const allocationSchema = z.object({
  id: z.string().min(1),
  asset_id: z.string().min(1),
  asset_type: z.enum(["stock", "crypto", "cash", "index"]),
  target_weight: z.number().finite(),
  max_weight: z.number().finite(),
  conviction_tier: z.number().int().min(0),
  expected_cagr: z.number().finite(),
  role: z.enum(["core growth", "optionality", "ballast"]),
  thesis_summary: z.string(),
  kill_criteria: z.string(),
  thesis_last_review: z.string(),
  fundamentals_summary: z.string(),
  price_action: z.string(),
  thesis_valid: z.boolean(),
});

export async function GET() {
  try {
    const items = await listAllocations();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load allocations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = allocationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const items = await upsertAllocation(parsed.data as Allocation);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save allocation" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const items = await deleteAllocation(id);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete allocation" },
      { status: 500 }
    );
  }
}
