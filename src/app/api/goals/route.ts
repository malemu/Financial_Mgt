import { NextResponse } from "next/server";
import { z } from "zod";
import { getGoal, upsertGoal } from "@/services/goals";

export const runtime = "nodejs";

const goalSchema = z.object({
  target_net_worth: z.number().finite().nonnegative(),
  target_year: z.number().int().min(1900).max(2200),
});

export async function GET() {
  const goal = getGoal();
  if (!goal) {
    return NextResponse.json({ error: "Goal not configured" }, { status: 404 });
  }
  return NextResponse.json(goal);
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
  const goal = upsertGoal(parsed.data);
  return NextResponse.json(goal, { status: 200 });
}
