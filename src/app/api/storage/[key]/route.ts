import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    key: string;
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  const db = getDb();
  const { key } = await params;
  const row = db
    .prepare("select key, value, updated_at from kv_store where key = ?")
    .get(key) as { key: string; value: string; updated_at: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    key: row.key,
    value: JSON.parse(row.value),
    updated_at: row.updated_at,
  });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const payload = await request.json();
  const db = getDb();
  const now = new Date().toISOString();
  const { key } = await params;
  db.prepare(
    "insert into kv_store (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at"
  ).run(key, JSON.stringify(payload), now);

  return NextResponse.json({ key, updated_at: now });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const db = getDb();
  const { key } = await params;
  db.prepare("delete from kv_store where key = ?").run(key);
  return NextResponse.json({ ok: true });
}
