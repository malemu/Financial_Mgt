import { getDb } from "@/lib/db";
import type { PriceMap } from "@/lib/types";

type PriceRow = {
  asset_id: string;
  price: number;
  sort_order: number;
};

const mapRowsToPriceMap = (rows: PriceRow[]): PriceMap => {
  return rows.reduce<PriceMap>((acc, row) => {
    acc[row.asset_id] = row.price;
    return acc;
  }, {});
};

const listPriceRows = () => {
  const db = getDb();
  return db
    .prepare("select asset_id, price, sort_order from prices order by sort_order asc")
    .all() as PriceRow[];
};

const nextSortOrder = () => {
  const db = getDb();
  const row = db
    .prepare("select coalesce(max(sort_order), -1) as max_order from prices")
    .get() as { max_order: number } | undefined;
  return (row?.max_order ?? -1) + 1;
};

export const getPriceMap = (): PriceMap => {
  return mapRowsToPriceMap(listPriceRows());
};

export const setAssetPrice = (assetId: string, price: number): PriceMap => {
  const db = getDb();
  const existing = db
    .prepare("select sort_order from prices where asset_id = ?")
    .get(assetId) as { sort_order: number } | undefined;
  const sortOrder = existing?.sort_order ?? nextSortOrder();
  db.prepare(
    `insert into prices (asset_id, price, sort_order)
     values (?, ?, ?)
     on conflict(asset_id) do update set price = excluded.price, sort_order = excluded.sort_order`
  ).run(assetId, price, sortOrder);
  return getPriceMap();
};

export const ensureAssetPrice = (assetId: string, defaultPrice = 0): PriceMap => {
  const db = getDb();
  const existing = db.prepare("select price from prices where asset_id = ?").get(assetId) as
    | { price: number }
    | undefined;
  if (existing) {
    return getPriceMap();
  }
  return setAssetPrice(assetId, defaultPrice);
};

export const renameAssetPrice = (fromAssetId: string, toAssetId: string): PriceMap => {
  const db = getDb();
  db.prepare("update prices set asset_id = ? where asset_id = ?").run(toAssetId, fromAssetId);
  return getPriceMap();
};

export const deleteAssetPrice = (assetId: string): PriceMap => {
  const db = getDb();
  db.prepare("delete from prices where asset_id = ?").run(assetId);
  return getPriceMap();
};
