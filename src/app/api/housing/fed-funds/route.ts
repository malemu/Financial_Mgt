import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";
const SERIES_ID = "DFF";

const parseValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export async function GET() {
  if (!process.env.FRED_API_KEY) {
    return NextResponse.json(
      { error: "FRED_API_KEY is not set." },
      { status: 500 }
    );
  }

  try {
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear() - 3, today.getUTCMonth(), 1));
    const url = new URL(FRED_BASE_URL);
    url.searchParams.set("series_id", SERIES_ID);
    url.searchParams.set("api_key", process.env.FRED_API_KEY);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("observation_start", formatDate(start));
    url.searchParams.set("observation_end", formatDate(today));
    url.searchParams.set("sort_order", "asc");

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch FRED (${response.status}).` },
        { status: 502 }
      );
    }
    const payload = (await response.json()) as {
      observations?: { date: string; value: string }[];
    };
    const observations = (payload.observations ?? [])
      .map((obs) => ({
        date: obs.date,
        value: parseValue(obs.value),
      }))
      .filter((obs) => obs.value != null);

    if (!observations.length) {
      return NextResponse.json(
        { error: "No FRED observations returned." },
        { status: 502 }
      );
    }

    const latest = observations[observations.length - 1];
    const latestDate = latest.date;
    const latestValue = latest.value ?? null;

    const lookupValue = (monthsBack: number) => {
      const target = new Date(`${latestDate}T00:00:00Z`);
      target.setUTCMonth(target.getUTCMonth() - monthsBack);
      const targetDate = formatDate(target);
      const candidate = [...observations]
        .reverse()
        .find((obs) => obs.date <= targetDate);
      return candidate?.value ?? null;
    };

    const value3m = lookupValue(3);
    const value12m = lookupValue(12);
    const change3m = value3m != null && latestValue != null ? latestValue - value3m : null;
    const change12m =
      value12m != null && latestValue != null ? latestValue - value12m : null;

    let cycle = "paused";
    if (change3m != null) {
      if (change3m > 0.1) cycle = "hiking";
      else if (change3m < -0.1) cycle = "cutting";
    }

    return NextResponse.json({
      source: "FRED",
      series_id: SERIES_ID,
      latest_date: latestDate,
      current: latestValue,
      change3m,
      change12m,
      cycle,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load FRED data.",
      },
      { status: 500 }
    );
  }
}
