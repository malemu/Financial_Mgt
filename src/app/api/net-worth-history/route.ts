import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteNetWorthPoint,
  listNetWorthHistory,
  upsertNetWorthPoint,
} from "@/services/net-worth-history";

export const runtime = "nodejs";

const netWorthPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().finite(),
});

export async function GET() {
  try {
    const items = await listNetWorthHistory();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load history" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = netWorthPointSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const items = await upsertNetWorthPoint(parsed.data);
    return NextResponse.json({ item: parsed.data, items }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save history point" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? undefined;
  try {
    const result = await deleteNetWorthPoint(date ?? undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete history point" },
      { status: 500 }
    );
  }
}
