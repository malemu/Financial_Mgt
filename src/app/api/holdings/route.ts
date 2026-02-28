import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteHolding,
  listHoldings,
  renameHoldingAsset,
  upsertHolding,
} from "@/services/holdings";

export const runtime = "nodejs";

const holdingSchema = z.object({
  asset_id: z.string().min(1),
  shares: z.number().finite(),
  entry_price: z.number().finite(),
  cost_basis: z.number().finite(),
});

export async function GET() {
  try {
    const items = await listHoldings();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load holdings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = holdingSchema.extend({ previous_asset_id: z.string().optional() }).safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { previous_asset_id, ...holding } = parsed.data;
  try {
    if (previous_asset_id && previous_asset_id !== holding.asset_id) {
      await renameHoldingAsset(previous_asset_id, holding.asset_id);
    }
    const items = await upsertHolding(holding);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save holding" },
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
    const items = await deleteHolding(assetId);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete holding" },
      { status: 500 }
    );
  }
}
