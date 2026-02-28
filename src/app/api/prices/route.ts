import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteAssetPrice,
  ensureAssetPrice,
  getPriceMap,
  renameAssetPrice,
  setAssetPrice,
} from "@/services/prices";

export const runtime = "nodejs";

const priceSchema = z.object({
  asset_id: z.string().min(1),
  price: z.number().finite(),
});

const renameSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export async function GET() {
  try {
    const prices = await getPriceMap();
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load prices" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = priceSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const prices = await setAssetPrice(parsed.data.asset_id, parsed.data.price);
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save price" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const payload = await request.json();
  const parsed = renameSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const prices = await renameAssetPrice(parsed.data.from, parsed.data.to);
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rename price" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const assetId = url.searchParams.get("asset_id");
  if (!assetId) {
    return NextResponse.json({ error: "Missing asset_id" }, { status: 400 });
  }
  try {
    const prices = await deleteAssetPrice(assetId);
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete price" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const payload = await request.json();
  const parsed = priceSchema.partial({ price: true }).extend({ ensure: z.boolean().optional() }).safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { asset_id, price, ensure } = parsed.data;
  if (!asset_id) {
    return NextResponse.json({ error: "Missing asset_id" }, { status: 400 });
  }
  try {
    const prices = ensure
      ? await ensureAssetPrice(asset_id, price ?? 0)
      : await setAssetPrice(asset_id, price ?? 0);
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update price" },
      { status: 500 }
    );
  }
}
