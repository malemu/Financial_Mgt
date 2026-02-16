import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const MARKET_SERIES: Record<
  string,
  { label: string; county: string; state: string; series: string[] }
> = {
  lynnwood: {
    label: "Lynnwood, WA",
    county: "Snohomish County, WA",
    state: "Washington",
    series: [
      "LAUCN530610000000003",
      "LAUCN530610000000005",
      "LAUCN530610000000006",
      "LAUST530000000000003",
    ],
  },
  everett: {
    label: "Everett, WA",
    county: "Snohomish County, WA",
    state: "Washington",
    series: [
      "LAUCN530610000000003",
      "LAUCN530610000000005",
      "LAUCN530610000000006",
      "LAUST530000000000003",
    ],
  },
  bothell: {
    label: "Bothell, WA",
    county: "King County, WA",
    state: "Washington",
    series: [
      "LAUCN530330000000003",
      "LAUCN530330000000005",
      "LAUCN530330000000006",
      "LAUST530000000000003",
    ],
  },
  "mill-creek": {
    label: "Mill Creek, WA",
    county: "Snohomish County, WA",
    state: "Washington",
    series: [
      "LAUCN530610000000003",
      "LAUCN530610000000005",
      "LAUCN530610000000006",
      "LAUST530000000000003",
    ],
  },
  edmonds: {
    label: "Edmonds, WA",
    county: "Snohomish County, WA",
    state: "Washington",
    series: [
      "LAUCN530610000000003",
      "LAUCN530610000000005",
      "LAUCN530610000000006",
      "LAUST530000000000003",
    ],
  },
  "lake-stevens": {
    label: "Lake Stevens, WA",
    county: "Snohomish County, WA",
    state: "Washington",
    series: [
      "LAUCN530610000000003",
      "LAUCN530610000000005",
      "LAUCN530610000000006",
      "LAUST530000000000003",
    ],
  },
  kenmore: {
    label: "Kenmore, WA",
    county: "King County, WA",
    state: "Washington",
    series: [
      "LAUCN530330000000003",
      "LAUCN530330000000005",
      "LAUCN530330000000006",
      "LAUST530000000000003",
    ],
  },
  marysville: {
    label: "Marysville, WA",
    county: "Snohomish County, WA",
    state: "Washington",
    series: [
      "LAUCN530610000000003",
      "LAUCN530610000000005",
      "LAUCN530610000000006",
      "LAUST530000000000003",
    ],
  },
  shoreline: {
    label: "Shoreline, WA",
    county: "King County, WA",
    state: "Washington",
    series: [
      "LAUCN530330000000003",
      "LAUCN530330000000005",
      "LAUCN530330000000006",
      "LAUST530000000000003",
    ],
  },
  seattle: {
    label: "Seattle, WA",
    county: "King County, WA",
    state: "Washington",
    series: [
      "LAUCN530330000000003",
      "LAUCN530330000000005",
      "LAUCN530330000000006",
      "LAUST530000000000003",
    ],
  },
};

type BLSDataPoint = {
  year: string;
  period: string;
  periodName: string;
  value: string;
};

type SeriesResponse = {
  seriesID: string;
  data: BLSDataPoint[];
};

const parseValue = (value: string) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const isMonthly = (period: string) => period.startsWith("M");

const sortByDateAsc = (a: BLSDataPoint, b: BLSDataPoint) => {
  const aKey = Number(`${a.year}${a.period.slice(1).padStart(2, "0")}`);
  const bKey = Number(`${b.year}${b.period.slice(1).padStart(2, "0")}`);
  return aKey - bKey;
};

const latestMonthly = (points: BLSDataPoint[]) =>
  points.filter((point) => isMonthly(point.period)).sort(sortByDateAsc).at(-1);

const valueOneYearAgo = (points: BLSDataPoint[], latest: BLSDataPoint) => {
  const targetYear = String(Number(latest.year) - 1);
  const targetPeriod = latest.period;
  return points.find(
    (point) => point.year === targetYear && point.period === targetPeriod
  );
};

const toPercentChange = (current: number | null, prior: number | null) => {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
};

export async function GET(request: Request) {
  if (!process.env.BLS_API_KEY) {
    return NextResponse.json(
      { error: "BLS_API_KEY is not set." },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") ?? "lynnwood";
  const config = MARKET_SERIES[market];
  if (!config) {
    return NextResponse.json(
      { error: "Unsupported market." },
      { status: 400 }
    );
  }

  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 3;

  const payload = {
    seriesid: config.series,
    startyear: String(startYear),
    endyear: String(endYear),
    registrationkey: process.env.BLS_API_KEY ?? undefined,
  };

  try {
    const response = await fetch(BLS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch BLS data (${response.status}).` },
        { status: 502 }
      );
    }
    const data = (await response.json()) as {
      status?: string;
      Results?: { series?: SeriesResponse[] };
      message?: string[];
    };
    if (!data?.Results?.series?.length) {
      return NextResponse.json(
        { error: "No BLS data returned." },
        { status: 502 }
      );
    }

    const byId = Object.fromEntries(
      data.Results.series.map((series) => [series.seriesID, series.data])
    ) as Record<string, BLSDataPoint[]>;

    const unemploymentSeries = byId[config.series[0]] ?? [];
    const employmentSeries = byId[config.series[1]] ?? [];
    const laborForceSeries = byId[config.series[2]] ?? [];
    const stateUnemploymentSeries = byId["LAUST530000000000003"] ?? [];

    const latestUnemployment = latestMonthly(unemploymentSeries);
    const latestEmployment = latestMonthly(employmentSeries);
    const latestLaborForce = latestMonthly(laborForceSeries);
    const latestStateUnemployment = latestMonthly(stateUnemploymentSeries);

    if (!latestUnemployment || !latestEmployment || !latestLaborForce) {
      return NextResponse.json(
        { error: "Insufficient BLS data for this market." },
        { status: 502 }
      );
    }

    const priorUnemployment = valueOneYearAgo(
      unemploymentSeries,
      latestUnemployment
    );
    const priorEmployment = valueOneYearAgo(
      employmentSeries,
      latestEmployment
    );
    const priorLaborForce = valueOneYearAgo(
      laborForceSeries,
      latestLaborForce
    );
    const priorStateUnemployment = latestStateUnemployment
      ? valueOneYearAgo(stateUnemploymentSeries, latestStateUnemployment)
      : null;

    const unemploymentRate = parseValue(latestUnemployment.value);
    const unemploymentYoY = parseValue(priorUnemployment?.value ?? "");
    const employmentLevel = parseValue(latestEmployment.value);
    const employmentYoY = parseValue(priorEmployment?.value ?? "");
    const laborForceLevel = parseValue(latestLaborForce.value);
    const laborForceYoY = parseValue(priorLaborForce?.value ?? "");
    const stateUnemploymentRate = parseValue(
      latestStateUnemployment?.value ?? ""
    );
    const stateUnemploymentYoY = parseValue(
      priorStateUnemployment?.value ?? ""
    );

    return NextResponse.json({
      source: "BLS LAUS",
      market: config.label,
      county: config.county,
      state: config.state,
      latest: {
        year: latestUnemployment.year,
        period: latestUnemployment.period,
        periodName: latestUnemployment.periodName,
      },
      unemployment: {
        rate: unemploymentRate,
        changeYoY:
          unemploymentRate != null && unemploymentYoY != null
            ? unemploymentRate - unemploymentYoY
            : null,
      },
      employment: {
        level: employmentLevel,
        changeYoY: toPercentChange(employmentLevel, employmentYoY),
      },
      laborForce: {
        level: laborForceLevel,
        changeYoY: toPercentChange(laborForceLevel, laborForceYoY),
      },
      stateUnemployment: {
        rate: stateUnemploymentRate,
        changeYoY:
          stateUnemploymentRate != null && stateUnemploymentYoY != null
            ? stateUnemploymentRate - stateUnemploymentYoY
            : null,
      },
      trend: unemploymentSeries
        .filter((point) => isMonthly(point.period))
        .sort(sortByDateAsc)
        .slice(-24)
        .map((point) => ({
          date: `${point.periodName} ${point.year}`,
          value: parseValue(point.value),
        })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load BLS data.",
      },
      { status: 500 }
    );
  }
}
