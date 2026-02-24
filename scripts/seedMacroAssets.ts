import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "data", "financial_mgt.db");
const db = new Database(dbPath);

db.exec(`
  create table if not exists assets (
    id integer primary key autoincrement,
    ticker text not null unique,
    name text not null,
    type text not null
  );
`);

const columns = db
  .prepare("pragma table_info('assets')")
  .all() as { name: string }[];
const columnNames = columns.map((col) => col.name);

if (!columnNames.includes("ticker")) db.exec("alter table assets add column ticker text");
if (!columnNames.includes("name")) db.exec("alter table assets add column name text");
if (!columnNames.includes("type")) db.exec("alter table assets add column type text");

db.exec("create unique index if not exists idx_assets_ticker on assets (ticker)");

const insert = db.prepare(
  "insert or ignore into assets (ticker, name, type) values (?, ?, ?)"
);

const macroAssets = [
  ["SPY", "SPDR S&P 500 ETF", "equity"],
  ["QQQ", "Invesco QQQ Trust", "equity"],
  ["IWM", "iShares Russell 2000 ETF", "equity"],
  ["VIX", "CBOE Volatility Index", "index"],
] as const;

const tx = db.transaction(() => {
  macroAssets.forEach((asset) => insert.run(...asset));
});
tx();

const seeded = db
  .prepare("select id, ticker, name, type from assets where ticker in ('SPY','QQQ','IWM','VIX') order by ticker")
  .all();

console.log("Seeded macro assets:", seeded);
