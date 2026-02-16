import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  CITY_METADATA,
  upsertLocalMarketActivity,
  REDFIN_COUNTY_URL,
} from "@/app/api/housing/local-market-activity/route";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import readline from "node:readline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = (searchParams.get("mode") ?? "auto").toLowerCase();
  const marketParam = (searchParams.get("market") ?? "").toLowerCase();
  const mode =
    modeParam === "city" || modeParam === "county" ? modeParam : "auto";
  const db = getDb();
  const results: Record<
    string,
    { status: "ok" | "error"; source?: string; count?: number; error?: string }
  > = {};

  const entries = marketParam
    ? Object.entries(CITY_METADATA).filter(([market]) => market === marketParam)
    : Object.entries(CITY_METADATA);

  if (!entries.length) {
    return NextResponse.json(
      { error: "Unsupported market." },
      { status: 400 }
    );
  }

  if (!marketParam && mode === "county") {
    const countyMap = new Map<string, string[]>();
    entries.forEach(([, meta]) => {
      countyMap.set(meta.county.toLowerCase(), []);
    });

    const response = await fetch(REDFIN_COUNTY_URL, { cache: "no-store" });
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: `Failed to fetch Redfin county file (${response.status}).` },
        { status: 502 }
      );
    }

    const normalizeCell = (value: string) => value.replace(/"/g, "").trim();
    const parseNumber = (value: string | undefined) => {
      if (!value) return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const stream = Readable.fromWeb(response.body as any).pipe(createGunzip());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let header: string[] | null = null;
    let indices: Record<string, number> = {};
    const rowsByCounty = new Map<
      string,
      {
        date: string;
        inventory: number;
        medianSalePrice: number;
        monthsSupply: number;
        daysOnMarket: number;
        newListings: number;
        closedSales: number;
      }[]
    >();

    for await (const line of rl) {
      if (!header) {
        header = line.split("\t");
        const normalized = header.map((cell) =>
          normalizeCell(cell).toLowerCase()
        );
        const find = (name: string) => normalized.indexOf(name);
        indices = {
          regionType: find("region_type"),
          county: find("county"),
          periodEnd: find("period_end"),
          duration: find("period_duration"),
          propertyType: find("property_type"),
          inventory: find("inventory"),
          monthsSupply: find("months_of_supply"),
          daysOnMarket: find("median_dom"),
          newListings: find("new_listings"),
          closedSales: find("homes_sold"),
          medianSalePrice: find("median_sale_price"),
        };
        continue;
      }

      const cells = line.split("\t").map((cell) => normalizeCell(cell));
      if (
        indices.regionType >= 0 &&
        cells[indices.regionType]?.toLowerCase() !== "county"
      ) {
        continue;
      }

      const countyName = cells[indices.county]?.toLowerCase() ?? "";
      if (!rowsByCounty.has(countyName)) {
        continue;
      }

      const duration = (cells[indices.duration] ?? "").toLowerCase();
      if (duration && duration !== "4w" && duration !== "1m" && duration !== "1mo" && duration !== "1month" && Number.isNaN(Number(duration))) {
        continue;
      }

      const propertyType = (cells[indices.propertyType] ?? "").trim();
      if (
        propertyType &&
        propertyType !== "All Residential" &&
        propertyType !== "All Home Types"
      ) {
        continue;
      }

      const inventory = parseNumber(cells[indices.inventory]);
      const monthsSupply = parseNumber(cells[indices.monthsSupply]);
      const daysOnMarket = parseNumber(cells[indices.daysOnMarket]);
      const newListings = parseNumber(cells[indices.newListings]);
      const closedSales = parseNumber(cells[indices.closedSales]);
      const medianSalePrice = parseNumber(cells[indices.medianSalePrice]) ?? 0;
      const date = cells[indices.periodEnd];
      if (
        !date ||
        inventory == null ||
        monthsSupply == null ||
        daysOnMarket == null ||
        newListings == null ||
        closedSales == null
      ) {
        continue;
      }

      rowsByCounty.get(countyName)?.push({
        date,
        inventory,
        medianSalePrice,
        monthsSupply,
        daysOnMarket,
        newListings,
        closedSales,
      });
    }

    for (const [market, meta] of entries) {
      const rows = rowsByCounty.get(meta.county.toLowerCase()) ?? [];
      if (!rows.length) {
        results[market] = { status: "error", error: "No county rows matched." };
        continue;
      }
      rows.sort((a, b) => (a.date < b.date ? -1 : 1));
      const recent = rows.slice(-36);
      const fetchedAt = new Date().toISOString();
      db.prepare("delete from local_market_activity where market_id = ?").run(market);
      const insert = db.prepare(
        `insert or replace into local_market_activity (
          market_id, date, inventory, median_sale_price, months_supply, days_on_market, new_listings, closed_sales, data_source, fetched_at, sort_order
        ) values (
          @market_id, @date, @inventory, @median_sale_price, @months_supply, @days_on_market, @new_listings, @closed_sales, @data_source, @fetched_at, @sort_order
        )`
      );
      const tx = db.transaction(() => {
        recent.forEach((row, index) => {
          insert.run({
            market_id: market,
            date: row.date,
            inventory: Math.round(row.inventory),
            median_sale_price: row.medianSalePrice || null,
            months_supply: row.monthsSupply,
            days_on_market: Math.round(row.daysOnMarket),
            new_listings: Math.round(row.newListings),
            closed_sales: Math.round(row.closedSales),
            data_source: "redfin_county",
            fetched_at: fetchedAt,
            sort_order: index,
          });
        });
      });
      tx();
      results[market] = { status: "ok", source: "redfin_county", count: recent.length };
    }

    return NextResponse.json({ mode: "county", results });
  }

  for (const [market, meta] of entries) {
    try {
      const output = await upsertLocalMarketActivity({
        db,
        market,
        meta,
        mode,
      });
      results[market] = {
        status: "ok",
        source: output.source,
        count: output.count,
      };
    } catch (error) {
      results[market] = {
        status: "error",
        error: error instanceof Error ? error.message : "Failed to seed market.",
      };
    }
  }

  return NextResponse.json({
    mode,
    results,
  });
}
