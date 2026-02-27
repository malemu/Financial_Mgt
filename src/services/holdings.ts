import { getDb } from "@/lib/db";
import type { Holding } from "@/lib/types";

type HoldingRow = Holding & { sort_order: number };

const mapRow = (row: HoldingRow): Holding => ({
  asset_id: row.asset_id,
  shares: row.shares,
  entry_price: row.entry_price,
  cost_basis: row.cost_basis,
});

const nextSortOrder = () => {
  const db = getDb();
  const row = db
    .prepare("select coalesce(max(sort_order), -1) as max_order from holdings")
    .get() as { max_order: number } | undefined;
  return (row?.max_order ?? -1) + 1;
};

export const listHoldings = (): Holding[] => {
  const db = getDb();
  const rows = db
    .prepare(
      "select asset_id, shares, entry_price, cost_basis, sort_order from holdings order by sort_order asc"
    )
    .all() as HoldingRow[];
  return rows.map(mapRow);
};

export const upsertHolding = (holding: Holding): Holding[] => {
  const db = getDb();
  const existing = db
    .prepare("select sort_order from holdings where asset_id = ?")
    .get(holding.asset_id) as { sort_order: number } | undefined;
  const sortOrder = existing?.sort_order ?? nextSortOrder();
  db.prepare(
    `insert into holdings (asset_id, shares, entry_price, cost_basis, sort_order)
     values (@asset_id, @shares, @entry_price, @cost_basis, @sort_order)
     on conflict(asset_id) do update set
       shares = excluded.shares,
       entry_price = excluded.entry_price,
       cost_basis = excluded.cost_basis,
       sort_order = excluded.sort_order`
  ).run({ ...holding, sort_order: sortOrder });
  return listHoldings();
};

export const renameHoldingAsset = (fromAssetId: string, toAssetId: string) => {
  const db = getDb();
  db.prepare("update holdings set asset_id = ? where asset_id = ?").run(toAssetId, fromAssetId);
  return listHoldings();
};

export const deleteHolding = (assetId: string): Holding[] => {
  const db = getDb();
  db.prepare("delete from holdings where asset_id = ?").run(assetId);
  return listHoldings();
};
