import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import readline from "node:readline";

export const runtime = "nodejs";

type MarketBase = {
  inventory: number;
  monthsSupply: number;
  daysOnMarket: number;
  newListings: number;
  closedSales: number;
};

const MARKET_BASE: Record<string, MarketBase> = {
  seattle: {
    inventory: 980,
    monthsSupply: 2.7,
    daysOnMarket: 22,
    newListings: 620,
    closedSales: 580,
  },
  lynnwood: {
    inventory: 340,
    monthsSupply: 2.5,
    daysOnMarket: 26,
    newListings: 210,
    closedSales: 190,
  },
  everett: {
    inventory: 360,
    monthsSupply: 2.6,
    daysOnMarket: 28,
    newListings: 240,
    closedSales: 220,
  },
  bothell: {
    inventory: 250,
    monthsSupply: 2.3,
    daysOnMarket: 23,
    newListings: 170,
    closedSales: 160,
  },
  "mill-creek": {
    inventory: 190,
    monthsSupply: 2.2,
    daysOnMarket: 21,
    newListings: 130,
    closedSales: 125,
  },
  edmonds: {
    inventory: 210,
    monthsSupply: 2.4,
    daysOnMarket: 24,
    newListings: 150,
    closedSales: 140,
  },
  "mountlake-terrace": {
    inventory: 180,
    monthsSupply: 2.3,
    daysOnMarket: 23,
    newListings: 125,
    closedSales: 118,
  },
  "lake-stevens": {
    inventory: 210,
    monthsSupply: 2.1,
    daysOnMarket: 24,
    newListings: 140,
    closedSales: 132,
  },
  kenmore: {
    inventory: 230,
    monthsSupply: 2.3,
    daysOnMarket: 22,
    newListings: 165,
    closedSales: 155,
  },
  marysville: {
    inventory: 280,
    monthsSupply: 2.9,
    daysOnMarket: 29,
    newListings: 180,
    closedSales: 165,
  },
  shoreline: {
    inventory: 260,
    monthsSupply: 2.4,
    daysOnMarket: 23,
    newListings: 180,
    closedSales: 170,
  },
};

export const CITY_METADATA: Record<
  string,
  { city: string; state: string; county: string; aliases?: string[] }
> = {
  seattle: { city: "Seattle", state: "WA", county: "King County, WA" },
  lynnwood: { city: "Lynnwood", state: "WA", county: "Snohomish County, WA" },
  everett: { city: "Everett", state: "WA", county: "Snohomish County, WA" },
  bothell: { city: "Bothell", state: "WA", county: "King County, WA" },
  "mill-creek": { city: "Mill Creek", state: "WA", county: "Snohomish County, WA" },
  edmonds: {
    city: "Edmonds",
    state: "WA",
    county: "Snohomish County, WA",
    aliases: ["Edmonds, WA", "Edmonds city"],
  },
  "mountlake-terrace": {
    city: "Mountlake Terrace",
    state: "WA",
    county: "Snohomish County, WA",
  },
  "lake-stevens": {
    city: "Lake Stevens",
    state: "WA",
    county: "Snohomish County, WA",
  },
  kenmore: {
    city: "Kenmore",
    state: "WA",
    county: "King County, WA",
    aliases: ["Kenmore, WA", "Kenmore city"],
  },
  marysville: { city: "Marysville", state: "WA", county: "Snohomish County, WA" },
  shoreline: { city: "Shoreline", state: "WA", county: "King County, WA" },
};

export const REDFIN_CITY_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/city_market_tracker.tsv000.gz";
export const REDFIN_COUNTY_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz";

const normalizeCell = (value: string) =>
  value.replace(/"/g, "").trim();

const findIndex = (header: string[], candidates: string[]) => {
  const normalized = header.map((cell) => normalizeCell(cell).toLowerCase());
  return candidates
    .map((candidate) => normalized.indexOf(candidate.toLowerCase()))
    .find((index) => index != null && index >= 0);
};

const parseNumber = (value: string | undefined) => {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const parseRedfinFile = async ({
  url,
  regionName,
  stateCode,
  countyName,
  regionType,
  aliases = [],
}: {
  url: string;
  regionName: string;
  stateCode: string;
  countyName: string;
  regionType: "city" | "county";
  aliases?: string[];
}) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) {
    throw new Error(`Fetch failed (${response.status}).`);
  }

  const stream = Readable.fromWeb(response.body as any).pipe(createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let indices: {
    regionType?: number;
    regionName?: number;
    state?: number;
    stateName?: number;
    county?: number;
    period?: number;
    duration?: number;
    propertyType?: number;
    inventory?: number;
    monthsSupply?: number;
    daysOnMarket?: number;
    newListings?: number;
    closedSales?: number;
  } | null = null;
  const rows: {
    date: string;
    inventory: number;
    medianSalePrice: number;
    monthsSupply: number;
    daysOnMarket: number;
    newListings: number;
    closedSales: number;
  }[] = [];
  const fallbackRows: typeof rows = [];

  for await (const line of rl) {
    if (!header) {
      header = line.split("\t");
      indices = {
        regionType: findIndex(header, ["region_type"]),
        regionName: findIndex(header, ["region", "region_name", "city"]),
        state: findIndex(header, ["state_code"]),
        stateName: findIndex(header, ["state"]),
        county: findIndex(header, ["county", "county_name"]),
        period: findIndex(header, ["period_end", "period_begin", "date"]),
        duration: findIndex(header, ["period_duration"]),
        propertyType: findIndex(header, ["property_type"]),
        inventory: findIndex(header, ["active_listings", "inventory"]),
        monthsSupply: findIndex(header, ["months_of_supply", "months_supply"]),
        daysOnMarket: findIndex(header, ["median_days_on_market", "median_dom", "days_on_market"]),
        newListings: findIndex(header, ["new_listings"]),
        closedSales: findIndex(header, ["homes_sold", "closed_sales", "num_homes_sold"]),
      };
      continue;
    }
    if (!indices) continue;
    const cells = line.split("\t");
    const get = (index: number | undefined) =>
      index != null && index >= 0 ? normalizeCell(cells[index] ?? "") : undefined;

    const regionTypeValue = (get(indices.regionType) ?? "").toLowerCase();
    if (regionType === "city") {
      if (regionTypeValue && regionTypeValue !== "place" && regionTypeValue !== "city") {
        continue;
      }
    } else if (regionTypeValue && regionTypeValue !== "county") {
      continue;
    }

    const name = get(indices.regionName) ?? "";
    const state = get(indices.state) ?? "";
    const stateName = get(indices.stateName) ?? "";
    const county = get(indices.county) ?? "";
    const propertyType = (get(indices.propertyType) ?? "").trim();
    const isAllPropertyType =
      !propertyType ||
      propertyType === "All Residential" ||
      propertyType === "All Home Types";

    const normalizedName = name.trim().toLowerCase();
    if (regionType === "city") {
      const matchName =
        normalizedName === `${regionName}, ${stateCode}`.toLowerCase() ||
        normalizedName === regionName.toLowerCase() ||
        aliases.map((alias) => alias.toLowerCase()).includes(normalizedName);
      const stateMatch =
        !state || state === stateCode || stateName === stateCode || stateName === "Washington";
      if (!matchName || !stateMatch) {
        continue;
      }
    } else {
      const matchCounty =
        normalizedName.includes(countyName.toLowerCase()) ||
        county.toLowerCase().includes(countyName.toLowerCase());
      if (!matchCounty) {
        continue;
      }
    }

    const duration = (get(indices.duration) ?? "").toLowerCase();
    if (
      duration &&
      duration !== "4w" &&
      duration !== "1m" &&
      duration !== "1mo" &&
      duration !== "1month" &&
      Number.isNaN(Number(duration))
    ) {
      continue;
    }

    const dateValue = get(indices.period);
    if (!dateValue) continue;

    const inventory = parseNumber(
      get(indices.inventory)
    );
    const medianSalePrice = parseNumber(
      get(findIndex(header ?? [], ["median_sale_price"]))
    );
    const monthsSupply = parseNumber(
      get(indices.monthsSupply)
    );
    const daysOnMarket = parseNumber(
      get(indices.daysOnMarket)
    );
    const newListings = parseNumber(get(indices.newListings));
    const closedSales = parseNumber(
      get(indices.closedSales)
    );

    if (
      inventory == null ||
      monthsSupply == null ||
      daysOnMarket == null ||
      newListings == null ||
      closedSales == null
    ) {
      continue;
    }

    const target = isAllPropertyType ? rows : fallbackRows;
    if (medianSalePrice != null && isAllPropertyType) {
      fallbackRows.push({
        date: dateValue,
        inventory,
        medianSalePrice,
        monthsSupply,
        daysOnMarket,
        newListings,
        closedSales,
      });
    }
    target.push({
      date: dateValue,
      inventory,
      medianSalePrice: medianSalePrice ?? 0,
      monthsSupply,
      daysOnMarket,
      newListings,
      closedSales,
    });
  }

  return rows.length ? rows : fallbackRows;
};

export const upsertLocalMarketActivity = async ({
  db,
  market,
  meta,
  mode,
}: {
  db: ReturnType<typeof getDb>;
  market: string;
  meta: { city: string; state: string; county: string };
  mode: "city" | "county" | "auto";
}) => {
  let rows: {
    date: string;
    inventory: number;
    medianSalePrice: number;
    monthsSupply: number;
    daysOnMarket: number;
    newListings: number;
    closedSales: number;
  }[] = [];
  let source: "redfin_city" | "redfin_county" = "redfin_county";

  if (mode === "city") {
    rows = await parseRedfinFile({
      url: REDFIN_CITY_URL,
      regionName: meta.city,
      stateCode: meta.state,
      countyName: meta.county,
      regionType: "city",
      aliases: meta.aliases,
    });
    source = "redfin_city";
  } else if (mode === "county") {
    rows = await parseRedfinFile({
      url: REDFIN_COUNTY_URL,
      regionName: meta.city,
      stateCode: meta.state,
      countyName: meta.county,
      regionType: "county",
      aliases: meta.aliases,
    });
    source = "redfin_county";
  } else {
    rows = await parseRedfinFile({
      url: REDFIN_COUNTY_URL,
      regionName: meta.city,
      stateCode: meta.state,
      countyName: meta.county,
      regionType: "county",
      aliases: meta.aliases,
    });
    source = "redfin_county";
    if (!rows.length) {
      rows = await parseRedfinFile({
        url: REDFIN_CITY_URL,
        regionName: meta.city,
        stateCode: meta.state,
        countyName: meta.county,
        regionType: "city",
        aliases: meta.aliases,
      });
      source = "redfin_city";
    }
  }

  if (!rows.length) {
    throw new Error("No Redfin rows matched.");
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
        data_source: source,
        fetched_at: fetchedAt,
        sort_order: index,
      });
    });
  });
  tx();
  return { source, fetchedAt, count: recent.length };
};

const formatMonth = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const generateHistory = (marketId: string, base: MarketBase) => {
  const now = new Date();
  const rows: {
    date: string;
    inventory: number;
    monthsSupply: number;
    daysOnMarket: number;
    newListings: number;
    closedSales: number;
  }[] = [];
  for (let i = 35; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const season = Math.sin((i / 12) * Math.PI * 2);
    const drift = (35 - i) * 0.01;
    const inventory = Math.round(base.inventory * (1 + season * 0.08 + drift * 0.03));
    const monthsSupply = clamp(base.monthsSupply * (1 + season * 0.1 + drift * 0.02), 1.2, 5);
    const daysOnMarket = Math.round(base.daysOnMarket * (1 + season * 0.06 + drift * 0.02));
    const newListings = Math.round(base.newListings * (1 + season * 0.09));
    const closedSales = Math.round(base.closedSales * (1 + season * 0.07));
    rows.push({
      date: formatMonth(date),
      inventory,
      monthsSupply,
      daysOnMarket,
      newListings,
      closedSales,
    });
  }
  return rows;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "lynnwood";
  const force = searchParams.get("force") === "1";
  const mode = (searchParams.get("mode") ?? "auto").toLowerCase();
  const base = MARKET_BASE[market];
  if (!base) {
    return NextResponse.json({ error: "Unsupported market." }, { status: 400 });
  }
  const meta = CITY_METADATA[market];
  if (!meta) {
    return NextResponse.json({ error: "Unsupported market." }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare(
      "select date, inventory, median_sale_price, months_supply, days_on_market, new_listings, closed_sales, data_source, fetched_at from local_market_activity where market_id = ? order by date"
    )
    .all(market) as {
    date: string;
    inventory: number;
    median_sale_price: number | null;
    months_supply: number;
    days_on_market: number;
    new_listings: number;
    closed_sales: number;
    data_source: string;
    fetched_at: string;
  }[];

  const cachedRealRows = existing.filter(
    (row) => row.data_source === "redfin_city" || row.data_source === "redfin_county"
  );
  if (cachedRealRows.length && !force) {
    const latest = cachedRealRows[cachedRealRows.length - 1];
    return NextResponse.json({
      market,
      latest,
      trend: cachedRealRows.slice(-36).map((row) => ({
        date: row.date,
        inventory: row.inventory,
        medianSalePrice: row.median_sale_price,
        monthsSupply: row.months_supply,
        daysOnMarket: row.days_on_market,
        newListings: row.new_listings,
        closedSales: row.closed_sales,
      })),
      source: latest.data_source,
      fetched_at: latest.fetched_at ?? null,
      redfin_error: null,
    });
  }

  const latestFetchedAt = existing.length
    ? new Date(existing[existing.length - 1].fetched_at)
    : null;
  const latestSource = existing.length
    ? existing[existing.length - 1].data_source
    : null;
  const hasRealData =
    latestSource === "redfin_city" || latestSource === "redfin_county";
  const needsRefresh =
    force ||
    !latestFetchedAt ||
    Date.now() - latestFetchedAt.getTime() > 7 * 24 * 60 * 60 * 1000 ||
    !hasRealData;

  let source = "mocked";
  let redfinError: string | null = null;
  if (needsRefresh) {
    try {
      const output = await upsertLocalMarketActivity({
        db,
        market,
        meta,
        mode: mode === "city" || mode === "county" ? mode : "auto",
      });
      source = output.source;
    } catch (error) {
      redfinError =
        error instanceof Error ? error.message : "Redfin fetch failed.";
    }
  }

  const rows = db
    .prepare(
      "select date, inventory, median_sale_price, months_supply, days_on_market, new_listings, closed_sales, data_source, fetched_at from local_market_activity where market_id = ? order by date"
    )
    .all(market) as {
    date: string;
    inventory: number;
    median_sale_price: number | null;
    months_supply: number;
    days_on_market: number;
    new_listings: number;
    closed_sales: number;
    data_source: string;
    fetched_at: string;
  }[];

  const finalRealRows = rows.filter(
    (row) => row.data_source === "redfin_city" || row.data_source === "redfin_county"
  );
  if (!finalRealRows.length) {
    return NextResponse.json(
      { error: redfinError ?? "Redfin data unavailable for this market." },
      { status: 502 }
    );
  }

  const latest = finalRealRows[finalRealRows.length - 1];
  const latestPriceRow = [...finalRealRows]
    .reverse()
    .find((row) => row.median_sale_price != null);
  return NextResponse.json({
    market,
    latest,
    trend: finalRealRows.slice(-36).map((row) => ({
      date: row.date,
      inventory: row.inventory,
      medianSalePrice: row.median_sale_price,
      monthsSupply: row.months_supply,
      daysOnMarket: row.days_on_market,
      newListings: row.new_listings,
      closedSales: row.closed_sales,
    })),
    latest_median_price: latestPriceRow?.median_sale_price ?? null,
    source: latest?.data_source ?? source,
    fetched_at: latest?.fetched_at ?? null,
    redfin_error: redfinError,
  });
}
