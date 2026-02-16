import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_SOURCE =
  "https://www.fanniemae.com/data-and-insights/forecast/economic-developments-october-2025";

const parseForecast = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ");
  const lower = cleaned.toLowerCase();
  const segmentIndex = lower.indexOf("mortgage rates");
  const segment =
    segmentIndex >= 0 ? cleaned.slice(segmentIndex, segmentIndex + 400) : cleaned;
  const match =
    segment.match(
      /mortgage rates[^.]*?2025[^.]*?2026[^.]*?at\s*(\d\.\d)\s*percent[^.]*?and\s*(\d\.\d)\s*percent/i
    ) ??
    segment.match(
      /mortgage rates[^.]*?end 2025[^.]*?(\d\.\d)\s*percent[^.]*?2026[^.]*?(\d\.\d)\s*percent/i
    ) ??
    segment.match(
      /mortgage rates[^.]*?(\d\.\d)\s*percent[^.]*?2025[^.]*?(\d\.\d)\s*percent[^.]*?2026/i
    ) ??
    cleaned.match(
      /(\d\.\d)\s*percent[^.]*2025[^.]*?(\d\.\d)\s*percent[^.]*2026/i
    ) ??
    cleaned.match(
      /2025[^.]*?(\d\.\d)\s*percent[^.]*2026[^.]*?(\d\.\d)\s*percent/i
    );
  if (!match) return null;
  const value2025 = Number(match[1]);
  const value2026 = Number(match[2]);
  if (!Number.isFinite(value2025) || !Number.isFinite(value2026)) return null;
  return { value2025, value2026 };
};

const rangeFromBase = (base: number) => {
  const lowBest = Math.max(0, base - 0.6);
  const highBest = Math.max(0, base - 0.2);
  const lowBase = Math.max(0, base - 0.2);
  const highBase = base + 0.4;
  const lowWorst = base + 0.4;
  const highWorst = base + 1.0;
  const fmt = (value: number) => `${value.toFixed(1)}%`;
  return {
    best: `${fmt(lowBest)}-${fmt(highBest)}`,
    base: `${fmt(lowBase)}-${fmt(highBase)}`,
    worst: `${fmt(lowWorst)}-${fmt(highWorst)}`,
  };
};

export async function GET() {
  try {
    const sourceUrl = process.env.HOUSING_FORECAST_URL || DEFAULT_SOURCE;
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch forecast source (${response.status}).` },
        { status: 502 }
      );
    }
    const text = await response.text();
    const parsed = parseForecast(text);
    if (!parsed) {
      return NextResponse.json(
        { error: "Unable to parse forecast values from source." },
        { status: 502 }
      );
    }

    const base = parsed.value2026;
    return NextResponse.json({
      source: "Fannie Mae ESR",
      source_url: sourceUrl,
      value_2025: parsed.value2025,
      value_2026: parsed.value2026,
      outlook2y: rangeFromBase(base),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load forecast source.",
      },
      { status: 500 }
    );
  }
}
