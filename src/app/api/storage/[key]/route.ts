import { NextRequest, NextResponse } from "next/server";
import { readKv, writeKv, deleteKv } from "@/lib/supabase/kv-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    key: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { key } = await params;
  try {
    const record = await readKv(key);
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load value" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const payload = await request.json();
  const { key } = await params;
  try {
    const record = await writeKv(key, payload);
    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save value" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { key } = await params;
  try {
    await deleteKv(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete value" },
      { status: 500 }
    );
  }
}
