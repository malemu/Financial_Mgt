import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PMMS_CSV_URL = "https://www.freddiemac.com/pmms/docs/PMMS_history.csv";

type RateSeries = {
  current: number | null;
  high12m: number | null;
  low12m: number | null;
  longAvg: number | null;
};

type ParsedRow = {
  date: Date;
  rate30: number | null;
  rate15: number | null;
};

const parseCsv = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { header: null, rows: [] };

  const headerCells = lines[0].split(",").map((cell) => cell.trim());
  const hasHeader = headerCells.some((cell) => /date/i.test(cell));
  const header = hasHeader ? headerCells : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return { header, rows: dataLines };
};

const parseDate = (value: string) => {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00Z`);
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const alt = new Date(`${trimmed} UTC`);
  return Number.isNaN(alt.getTime()) ? null : alt;
};

const parseRate = (value: string) => {
  const cleaned = value.replace(/%/g, "").trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  return numeric;
};

const average = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toSeries = (rows: ParsedRow[], key: "rate30" | "rate15") => {
  const values = rows
    .map((row) => row[key])
    .filter(
      (value): value is number =>
        Number.isFinite(value) && value !== 0
    );
  if (!values.length) {
    return { current: null, high12m: null, low12m: null, longAvg: null };
  }
  const lastValid = [...rows]
    .reverse()
    .find((row) => Number.isFinite(row[key]) && row[key] !== 0);
  const latest = lastValid?.[key] ?? null;
  const latestDate = lastValid?.date ?? null;
  const oneYearAgo = latestDate
    ? new Date(latestDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    : null;
  const recent = oneYearAgo
    ? rows
        .filter((row) => row.date >= oneYearAgo)
        .map((row) => row[key])
        .filter(
          (value): value is number =>
            Number.isFinite(value) && value !== 0
        )
    : [];
  const recentValues = recent.length ? recent : values.slice(-52);
  const high12m = recentValues.length ? Math.max(...recentValues) : null;
  const low12m = recentValues.length ? Math.min(...recentValues) : null;
  return {
    current: Number.isFinite(latest ?? NaN) ? latest : null,
    high12m,
    low12m,
    longAvg: average(values),
  } satisfies RateSeries;
};

export async function GET() {
  try {
    const response = await fetch(PMMS_CSV_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch Freddie Mac PMMS (${response.status}).` },
        { status: 502 }
      );
    }
    const text = await response.text();
    const { header, rows } = parseCsv(text);

    const headerDateIndex =
      header?.findIndex((cell) => /date/i.test(cell)) ?? -1;
    const header30Index =
      header?.findIndex((cell) => /30/.test(cell) && /(fr|fixed)/i.test(cell)) ??
      -1;
    const header15Index =
      header?.findIndex((cell) => /15/.test(cell) && /(fr|fixed)/i.test(cell)) ??
      -1;
    const dateIndex = headerDateIndex >= 0 ? headerDateIndex : 0;
    const rate30Index = header30Index >= 0 ? header30Index : 1;
    const rate15Index = header15Index >= 0 ? header15Index : 2;

    const parsedRows = rows
      .map((line) => {
        const cells = line.split(",").map((cell) => cell.trim());
        const dateCell = cells[dateIndex];
        const date = dateCell ? parseDate(dateCell) : null;
        if (!date) return null;
        const rate30 = parseRate(cells[rate30Index] ?? "");
        const rate15 = parseRate(cells[rate15Index] ?? "");
        return {
          date,
          rate30,
          rate15,
        } as ParsedRow;
      })
      .filter((row): row is ParsedRow => Boolean(row))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (!parsedRows.length) {
      return NextResponse.json(
        { error: "No PMMS data rows parsed." },
        { status: 502 }
      );
    }

    const latestDate = parsedRows[parsedRows.length - 1].date
      .toISOString()
      .slice(0, 10);

    return NextResponse.json({
      source: "Freddie Mac PMMS",
      latest_date: latestDate,
      series: {
        mortgage30: toSeries(parsedRows, "rate30"),
        mortgage15: toSeries(parsedRows, "rate15"),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load PMMS data.",
      },
      { status: 500 }
    );
  }
}
