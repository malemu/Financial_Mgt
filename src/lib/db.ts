import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "financial_mgt.db");

let db: Database.Database | undefined;

const initDb = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const instance = new Database(DB_PATH);
  instance.exec(`
    create table if not exists goals (
      id integer primary key,
      target_net_worth real not null,
      target_year integer not null
    );

    create table if not exists allocations (
      id text primary key,
      asset_id text not null,
      asset_type text not null,
      target_weight real not null,
      max_weight real not null,
      conviction_tier integer not null,
      expected_cagr real not null,
      role text not null,
      thesis_summary text not null,
      kill_criteria text not null,
      thesis_last_review text not null,
      fundamentals_summary text not null,
      price_action text not null,
      thesis_valid integer not null,
      sort_order integer not null
    );

    create table if not exists holdings (
      asset_id text not null,
      shares real not null,
      entry_price real not null,
      cost_basis real not null,
      sort_order integer not null
    );

    create table if not exists prices (
      asset_id text not null,
      price real not null,
      sort_order integer not null
    );

    create table if not exists price_history (
      ticker text not null,
      date text not null,
      open real not null,
      high real not null,
      low real not null,
      close real not null,
      volume integer not null,
      data_source text not null,
      fetched_at text not null,
      sort_order integer not null
    );

    create table if not exists triggers (
      id text primary key,
      asset_id text not null,
      rule text not null,
      approved integer not null,
      sort_order integer not null
    );

    create table if not exists net_worth_history (
      date text not null,
      value real not null,
      sort_order integer not null
    );

    create table if not exists ai_action_history (
      id integer primary key autoincrement,
      timestamp text not null,
      asset_id text not null,
      action text not null,
      size_range text not null,
      confidence text not null,
      rationale text not null,
      proactive_triggers text not null,
      overridden integer not null,
      override_reason text,
      sort_order integer not null
    );

    create table if not exists dismissed_drift (
      asset_id text not null,
      sort_order integer not null
    );

    create table if not exists kv_store (
      key text primary key,
      value text not null,
      updated_at text not null
    );

    create table if not exists analyst_chat_log (
      id integer primary key autoincrement,
      created_at text not null,
      ip text,
      model text not null,
      user_message text not null,
      assistant_message text not null,
      context_json text not null,
      prompt_tokens integer,
      completion_tokens integer
    );

    create table if not exists buy_rent_inputs (
      id integer primary key,
      data text not null
    );

    create table if not exists local_market_activity (
      market_id text not null,
      date text not null,
      inventory integer not null,
      median_sale_price real,
      months_supply real not null,
      days_on_market integer not null,
      new_listings integer not null,
      closed_sales integer not null,
      data_source text not null,
      fetched_at text not null,
      sort_order integer not null
    );
  `);

  ensurePriceHistorySchema(instance);
  ensureLocalMarketActivitySchema(instance);
  migrateFromKvStore(instance);
  return instance;
};

const ensurePriceHistorySchema = (instance: Database.Database) => {
  const table = instance
    .prepare(
      "select name from sqlite_master where type='table' and name='price_history'"
    )
    .get();
  if (!table) return;

  const columns = instance
    .prepare("pragma table_info('price_history')")
    .all()
    .map((col: any) => col.name);

  const hasTicker = columns.includes("ticker");
  const hasAssetId = columns.includes("asset_id");
  const needsMigration = hasAssetId && !hasTicker;

  if (needsMigration) {
    instance.exec(`
      alter table price_history rename to price_history_legacy;
      create table price_history (
        ticker text not null,
        date text not null,
        open real not null,
        high real not null,
        low real not null,
        close real not null,
        volume integer not null,
        data_source text not null,
        fetched_at text not null,
        sort_order integer not null
      );
    `);
    instance.exec(`
      insert into price_history (
        ticker, date, open, high, low, close, volume, data_source, fetched_at, sort_order
      )
      select asset_id as ticker, date, close, close, close, close, 0, 'legacy', datetime('now'), sort_order
      from price_history_legacy;
    `);
    instance.exec("drop table price_history_legacy;");
  } else {
    const required: Record<string, string> = {
      ticker: "text",
      date: "text",
      open: "real",
      high: "real",
      low: "real",
      close: "real",
      volume: "integer",
      data_source: "text",
      fetched_at: "text",
    };
    Object.entries(required).forEach(([col, type]) => {
      if (!columns.includes(col)) {
        instance.exec(`alter table price_history add column ${col} ${type}`);
      }
    });
  }

  instance.exec(
    "create unique index if not exists idx_price_history_unique on price_history (ticker, date)"
  );
};

const ensureLocalMarketActivitySchema = (instance: Database.Database) => {
  const table = instance
    .prepare(
      "select name from sqlite_master where type='table' and name='local_market_activity'"
    )
    .get();
  if (!table) return;

  const columns = instance
    .prepare("pragma table_info('local_market_activity')")
    .all()
    .map((col: any) => col.name);
  const required: Record<string, string> = {
    market_id: "text",
    date: "text",
    inventory: "integer",
    median_sale_price: "real",
    months_supply: "real",
    days_on_market: "integer",
    new_listings: "integer",
    closed_sales: "integer",
    data_source: "text",
    fetched_at: "text",
    sort_order: "integer",
  };
  Object.entries(required).forEach(([col, type]) => {
    if (!columns.includes(col)) {
      instance.exec(`alter table local_market_activity add column ${col} ${type}`);
    }
  });

  instance.exec(
    "create unique index if not exists idx_local_market_activity_unique on local_market_activity (market_id, date)"
  );
};

const migrateFromKvStore = (instance: Database.Database) => {
  const hasKv = instance
    .prepare(
      "select name from sqlite_master where type='table' and name='kv_store'"
    )
    .get();
  if (!hasKv) return;

  const rows = instance
    .prepare("select key, value from kv_store")
    .all() as { key: string; value: string }[];
  if (!rows.length) return;

  const kv = new Map(rows.map((row) => [row.key, row.value]));

  const readJson = <T>(key: string): T | undefined => {
    const raw = kv.get(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  };

  const goal = readJson<{ target_net_worth: number; target_year: number }>("goal");
  if (goal) {
    instance
      .prepare(
        "insert into goals (id, target_net_worth, target_year) values (1, ?, ?) on conflict(id) do update set target_net_worth = excluded.target_net_worth, target_year = excluded.target_year"
      )
      .run(goal.target_net_worth ?? 0, goal.target_year ?? 0);
  }

  const allocations = readJson<any[]>("allocations");
  if (allocations?.length) {
    const insert = instance.prepare(
      `insert into allocations (
        id, asset_id, asset_type, target_weight, max_weight, conviction_tier,
        expected_cagr, role, thesis_summary, kill_criteria, thesis_last_review,
        fundamentals_summary, price_action, thesis_valid, sort_order
      ) values (
        @id, @asset_id, @asset_type, @target_weight, @max_weight, @conviction_tier,
        @expected_cagr, @role, @thesis_summary, @kill_criteria, @thesis_last_review,
        @fundamentals_summary, @price_action, @thesis_valid, @sort_order
      )`
    );
    const tx = instance.transaction((items: any[]) => {
      instance.prepare("delete from allocations").run();
      items.forEach((item, index) => {
        insert.run({
          ...item,
          thesis_valid: item.thesis_valid ? 1 : 0,
          sort_order: index,
        });
      });
    });
    tx(allocations);
  }

  const holdings = readJson<any[]>("holdings");
  if (holdings?.length) {
    const insert = instance.prepare(
      `insert into holdings (asset_id, shares, entry_price, cost_basis, sort_order)
       values (@asset_id, @shares, @entry_price, @cost_basis, @sort_order)`
    );
    const tx = instance.transaction((items: any[]) => {
      instance.prepare("delete from holdings").run();
      items.forEach((item, index) => insert.run({ ...item, sort_order: index }));
    });
    tx(holdings);
  }

  const prices = readJson<Record<string, number>>("prices");
  if (prices && Object.keys(prices).length) {
    const insert = instance.prepare(
      "insert into prices (asset_id, price, sort_order) values (@asset_id, @price, @sort_order)"
    );
    const tx = instance.transaction((entries: [string, number][]) => {
      instance.prepare("delete from prices").run();
      entries.forEach(([asset_id, price], index) =>
        insert.run({ asset_id, price, sort_order: index })
      );
    });
    tx(Object.entries(prices));
  }

  const priceHistory = readJson<any[]>("priceHistory");
  if (priceHistory?.length) {
    const insert = instance.prepare(
      `insert into price_history (asset_id, date, close, high, low, sort_order)
       values (@asset_id, @date, @close, @high, @low, @sort_order)`
    );
    const tx = instance.transaction((items: any[]) => {
      instance.prepare("delete from price_history").run();
      items.forEach((item, index) => {
        insert.run({ ...item, sort_order: index });
      });
    });
    tx(priceHistory);
  }

  const triggers = readJson<any[]>("triggers");
  if (triggers?.length) {
    const insert = instance.prepare(
      `insert into triggers (id, asset_id, rule, approved, sort_order)
       values (@id, @asset_id, @rule, @approved, @sort_order)`
    );
    const tx = instance.transaction((items: any[]) => {
      instance.prepare("delete from triggers").run();
      items.forEach((item, index) => {
        insert.run({
          ...item,
          approved: item.approved ? 1 : 0,
          sort_order: index,
        });
      });
    });
    tx(triggers);
  }

  const netWorthHistory = readJson<any[]>("netWorthHistory");
  if (netWorthHistory?.length) {
    const insert = instance.prepare(
      `insert into net_worth_history (date, value, sort_order)
       values (@date, @value, @sort_order)`
    );
    const tx = instance.transaction((items: any[]) => {
      instance.prepare("delete from net_worth_history").run();
      items.forEach((item, index) => insert.run({ ...item, sort_order: index }));
    });
    tx(netWorthHistory);
  }

  const aiHistory = readJson<any[]>("aiActionHistory");
  if (aiHistory?.length) {
    const insert = instance.prepare(
      `insert into ai_action_history (
        timestamp, asset_id, action, size_range, confidence,
        rationale, proactive_triggers, overridden, override_reason, sort_order
      ) values (
        @timestamp, @asset_id, @action, @size_range, @confidence,
        @rationale, @proactive_triggers, @overridden, @override_reason, @sort_order
      )`
    );
    const tx = instance.transaction((items: any[]) => {
      instance.prepare("delete from ai_action_history").run();
      items.forEach((item, index) => {
        insert.run({
          ...item,
          rationale: JSON.stringify(item.rationale ?? []),
          proactive_triggers: JSON.stringify(item.proactive_triggers ?? []),
          overridden: item.overridden ? 1 : 0,
          sort_order: index,
        });
      });
    });
    tx(aiHistory);
  }

  const dismissed = readJson<string[]>("driftDismissed");
  if (dismissed?.length) {
    const insert = instance.prepare(
      "insert into dismissed_drift (asset_id, sort_order) values (@asset_id, @sort_order)"
    );
    const tx = instance.transaction((items: string[]) => {
      instance.prepare("delete from dismissed_drift").run();
      items.forEach((asset_id, index) => insert.run({ asset_id, sort_order: index }));
    });
    tx(dismissed);
  }

  const buyRent = readJson<any>("rent-buy-invest-inputs-v3");
  if (buyRent) {
    instance
      .prepare(
        "insert into buy_rent_inputs (id, data) values (1, ?) on conflict(id) do update set data = excluded.data"
      )
      .run(JSON.stringify(buyRent));
  }

  const migratedKeys = [
    "goal",
    "allocations",
    "holdings",
    "prices",
    "priceHistory",
    "triggers",
    "netWorthHistory",
    "aiActionHistory",
    "driftDismissed",
    "rent-buy-invest-inputs-v3",
  ];
  instance
    .prepare(
      `delete from kv_store where key in (${migratedKeys
        .map(() => "?")
        .join(", ")})`
    )
    .run(...migratedKeys);
};

export const getDb = () => {
  if (!db) {
    db = initDb();
  }
  return db;
};
