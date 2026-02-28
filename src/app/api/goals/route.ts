import { NextResponse } from "next/server";
import { z } from "zod";
import { getGoal, upsertGoal } from "@/services/goals";

export const runtime = "nodejs";

const goalSchema = z.object({
  target_net_worth: z.number().finite().nonnegative(),
  target_year: z.number().int().min(1900).max(2200),
});

export async function GET() {
  try {
    const goal = await getGoal();
    if (!goal) {
      return NextResponse.json({ error: "Goal not configured" }, { status: 404 });
    }
    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load goal" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const payload = await request.json();
  const parsed = goalSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const goal = await upsertGoal(parsed.data);
    return NextResponse.json(goal, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save goal" },
      { status: 500 }
    );
  }
}
