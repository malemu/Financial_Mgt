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
  const items = listNetWorthHistory();
  return NextResponse.json({ items });
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
  const items = upsertNetWorthPoint(parsed.data);
  return NextResponse.json({ item: parsed.data, items }, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? undefined;
  const result = deleteNetWorthPoint(date ?? undefined);
  return NextResponse.json(result);
}
