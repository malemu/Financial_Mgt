import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    resource: string;
  }>;
};

const json = (payload: unknown, status = 200) =>
  NextResponse.json(payload, { status });

const unknownResource = () => json({ error: "Unknown resource" }, 404);

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const db = getDb();
  const { resource } = await params;

  switch (resource) {
    case "goal": {
      const row = db
        .prepare("select target_net_worth, target_year from goals where id = 1")
        .get() as { target_net_worth: number; target_year: number } | undefined;
      if (!row) return json({ error: "Not found" }, 404);
      return json(row);
    }
    case "allocations": {
      const rows = db
        .prepare("select * from allocations order by sort_order")
        .all()
        .map((row: any) => ({ ...row, thesis_valid: !!row.thesis_valid }));
      if (!rows.length) return json({ error: "Not found" }, 404);
      return json(rows);
    }
    case "holdings": {
      const rows = db.prepare("select * from holdings order by sort_order").all();
      if (!rows.length) return json({ error: "Not found" }, 404);
      return json(rows);
    }
    case "prices": {
      const rows = db.prepare("select * from prices order by sort_order").all();
      if (!rows.length) return json({ error: "Not found" }, 404);
      const map: Record<string, number> = {};
      rows.forEach((row: any) => {
        map[row.asset_id] = row.price;
      });
      return json(map);
    }
    case "priceHistory": {
      const rows = db
        .prepare(
          "select ticker, date, open, high, low, close, volume, data_source, fetched_at from price_history order by sort_order"
        )
        .all();
      return json(rows);
    }
    case "triggers": {
      const rows = db.prepare("select * from triggers order by sort_order").all();
      if (!rows.length) return json({ error: "Not found" }, 404);
      return json(rows.map((row: any) => ({ ...row, approved: !!row.approved })));
    }
    case "netWorthHistory": {
      const rows = db
        .prepare("select * from net_worth_history order by sort_order")
        .all();
      if (!rows.length) return json({ error: "Not found" }, 404);
      return json(rows);
    }
    case "aiActionHistory": {
      const rows = db
        .prepare("select * from ai_action_history order by sort_order")
        .all()
        .map((row: any) => ({
          ...row,
          rationale: JSON.parse(row.rationale),
          proactive_triggers: JSON.parse(row.proactive_triggers),
          overridden: !!row.overridden,
        }));
      return json(rows);
    }
    case "driftDismissed": {
      const rows = db
        .prepare("select asset_id from dismissed_drift order by sort_order")
        .all()
        .map((row: any) => row.asset_id);
      if (!rows.length) return json({ error: "Not found" }, 404);
      return json(rows);
    }
    case "rent-buy-invest-inputs-v3": {
      const row = db
        .prepare("select data from buy_rent_inputs where id = 1")
        .get() as { data: string } | undefined;
      if (!row) return json({ error: "Not found" }, 404);
      return json(JSON.parse(row.data));
    }
    default:
      return unknownResource();
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const db = getDb();
  const { resource } = await params;
  const payload = await request.json();

  switch (resource) {
    case "goal": {
      db.prepare(
        "insert into goals (id, target_net_worth, target_year) values (1, ?, ?) on conflict(id) do update set target_net_worth = excluded.target_net_worth, target_year = excluded.target_year"
      ).run(payload.target_net_worth ?? 0, payload.target_year ?? 0);
      return json({ ok: true });
    }
    case "allocations": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
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
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from allocations").run();
        items.forEach((item, index) => {
          insert.run({
            ...item,
            thesis_valid: item.thesis_valid ? 1 : 0,
            sort_order: index,
          });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "holdings": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
        `insert into holdings (
          asset_id, shares, entry_price, cost_basis, sort_order
        ) values (@asset_id, @shares, @entry_price, @cost_basis, @sort_order)`
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from holdings").run();
        items.forEach((item, index) => {
          insert.run({ ...item, sort_order: index });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "prices": {
      const map = payload && typeof payload === "object" ? payload : {};
      const rows = Object.entries(map).map(([asset_id, price]) => ({
        asset_id,
        price,
      }));
      const insert = db.prepare(
        `insert into prices (asset_id, price, sort_order) values (@asset_id, @price, @sort_order)`
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from prices").run();
        items.forEach((item, index) => {
          insert.run({ ...item, sort_order: index });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "priceHistory": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
        `insert into price_history (
          ticker, date, open, high, low, close, volume, data_source, fetched_at, sort_order
         )
         values (
          @ticker, @date, @open, @high, @low, @close, @volume, @data_source, @fetched_at, @sort_order
         )`
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from price_history").run();
        items.forEach((item, index) => {
          insert.run({ ...item, sort_order: index });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "triggers": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
        `insert into triggers (id, asset_id, rule, approved, sort_order)
         values (@id, @asset_id, @rule, @approved, @sort_order)`
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from triggers").run();
        items.forEach((item, index) => {
          insert.run({
            ...item,
            approved: item.approved ? 1 : 0,
            sort_order: index,
          });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "netWorthHistory": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
        `insert into net_worth_history (date, value, sort_order)
         values (@date, @value, @sort_order)`
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from net_worth_history").run();
        items.forEach((item, index) => {
          insert.run({ ...item, sort_order: index });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "aiActionHistory": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
        `insert into ai_action_history (
          timestamp, asset_id, action, size_range, confidence,
          rationale, proactive_triggers, overridden, override_reason, sort_order
        ) values (
          @timestamp, @asset_id, @action, @size_range, @confidence,
          @rationale, @proactive_triggers, @overridden, @override_reason, @sort_order
        )`
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from ai_action_history").run();
        items.forEach((item, index) => {
          insert.run({
            timestamp: item.timestamp ?? new Date().toISOString(),
            asset_id: item.asset_id ?? "UNKNOWN",
            action: item.action ?? "HOLD",
            size_range: item.size_range ?? "0%",
            confidence: item.confidence ?? "low",
            rationale: JSON.stringify(item.rationale ?? []),
            proactive_triggers: JSON.stringify(item.proactive_triggers ?? []),
            overridden: item.overridden ? 1 : 0,
            override_reason: item.override_reason ?? null,
            sort_order: index,
          });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "driftDismissed": {
      const rows = Array.isArray(payload) ? payload : [];
      const insert = db.prepare(
        "insert into dismissed_drift (asset_id, sort_order) values (@asset_id, @sort_order)"
      );
      const tx = db.transaction((items: any[]) => {
        db.prepare("delete from dismissed_drift").run();
        items.forEach((asset_id, index) => {
          insert.run({ asset_id, sort_order: index });
        });
      });
      tx(rows);
      return json({ ok: true });
    }
    case "rent-buy-invest-inputs-v3": {
      db.prepare(
        "insert into buy_rent_inputs (id, data) values (1, ?) on conflict(id) do update set data = excluded.data"
      ).run(JSON.stringify(payload));
      return json({ ok: true });
    }
    default:
      return unknownResource();
  }
}
