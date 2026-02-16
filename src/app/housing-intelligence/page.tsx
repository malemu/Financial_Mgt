"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MarketSnapshot = {
  id: string;
  name: string;
  medianPrice: number;
  medianIncome: number;
  inventory: number;
  monthsSupply: number;
  daysOnMarket: number;
  newListings: number;
  closedSales: number;
  permits: number;
  completions: number;
  unemploymentRate: number;
  jobGrowthYoY: number;
  populationGrowthYoY: number;
};

type RateRange = { best: string; base: string; worst: string };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const moneyShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  notation: "compact",
});

const percent = (value: number) => `${value.toFixed(1)}%`;

const TrendChart = ({ data }: { data: { date: string; value: number | null }[] }) => {
  const values = data
    .map((point) => point.value)
    .filter((value): value is number => value != null);
  if (!values.length) {
    return (
      <div className="text-[11px] text-[color:var(--muted)]">
        Trend data unavailable.
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 360;
  const height = 120;
  const padding = 12;
  const points = data.map((point, index) => {
    const value = point.value ?? min;
    const x =
      padding +
      (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((value - min) / range) * (height - padding * 2);
    return { x, y, value };
  });
  const path = points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");
  const latest = data[data.length - 1];
  const latestValue = latest?.value ?? null;

  return (
    <div className="grid gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full rounded-xl border border-[color:var(--line)] bg-white/70"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(15,107,93,0.18)" />
            <stop offset="100%" stopColor="rgba(15,107,93,0.02)" />
          </linearGradient>
        </defs>
        <path
          d={`${path} L ${width - padding} ${height - padding} L ${padding} ${
            height - padding
          } Z`}
          fill="url(#trendFill)"
          stroke="none"
        />
        <path d={path} fill="none" stroke="rgba(15,107,93,0.8)" strokeWidth="2" />
        <line
          x1={width - padding}
          x2={width - padding}
          y1={padding}
          y2={height - padding}
          stroke="rgba(214,206,196,0.6)"
          strokeDasharray="4 6"
        />
        {latestValue != null && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="4"
            fill="rgba(15,107,93,0.9)"
          />
        )}
      </svg>
      <div className="flex flex-wrap items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
        <span>{data[0]?.date}</span>
        <span>
          Latest:{" "}
          {latestValue != null ? percent(latestValue) : "n/a"}
        </span>
      </div>
    </div>
  );
};

const MarketActivityChart = ({
  data,
  label,
  color,
  valueKey,
  formatValue,
}: {
  data: { date: string; [key: string]: number };
  label: string;
  color: string;
  valueKey: string;
  formatValue?: (value: number) => string;
}) => {
  if (!data.length) {
    return (
      <div className="text-[11px] text-[color:var(--muted)]">
        Trend data unavailable.
      </div>
    );
  }
  const values = data.map((point) => point[valueKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 360;
  const height = 120;
  const padding = 12;
  const points = data.map((point, index) => {
    const x =
      padding +
      (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((point[valueKey] - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const path = points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");
  const latest = data[data.length - 1];
  const latestValue = latest[valueKey];
  const displayValue = formatValue ? formatValue(latestValue) : latestValue.toFixed(1);
  return (
    <div className="grid gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full rounded-xl border border-[color:var(--line)] bg-white/70"
      >
        <path d={path} fill="none" stroke={color} strokeWidth="2" />
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="4"
          fill={color}
        />
      </svg>
      <div className="flex flex-wrap items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
        <span>{data[0]?.date}</span>
        <span>
          {label}: {displayValue}
        </span>
      </div>
    </div>
  );
};

const MARKET_METRICS = [
  {
    key: "inventory",
    label: "Active inventory",
    color: "rgba(15,107,93,0.85)",
    format: (value: number) => Math.round(value).toString(),
  },
  {
    key: "monthsSupply",
    label: "Months of supply",
    color: "rgba(208,129,58,0.9)",
    format: (value: number) => value.toFixed(1),
  },
  {
    key: "daysOnMarket",
    label: "Days on market",
    color: "rgba(34,94,116,0.85)",
    format: (value: number) => Math.round(value).toString(),
  },
  {
    key: "newListings",
    label: "New listings",
    color: "rgba(107,114,128,0.85)",
    format: (value: number) => Math.round(value).toString(),
  },
  {
    key: "closedSales",
    label: "Closed sales",
    color: "rgba(124,58,237,0.75)",
    format: (value: number) => Math.round(value).toString(),
  },
] as const;

const mockRates = {
  fedFunds: {
    current: 5.33,
    change3m: -0.25,
    change12m: 0.0,
    cycle: "paused",
  },
  mortgage30: {
    current: 6.6,
    high12m: 7.4,
    low12m: 6.1,
    longAvg: 5.6,
    outlook2y: {
      best: "5.2-6.0%",
      base: "5.8-6.8%",
      worst: "6.6-7.6%",
    } as RateRange,
  },
  mortgage15: {
    current: 5.8,
    high12m: 6.6,
    low12m: 5.2,
    longAvg: 4.9,
    outlook2y: {
      best: "4.6-5.4%",
      base: "5.1-6.1%",
      worst: "5.8-6.8%",
    } as RateRange,
  },
};

const historicalAffordability = [
  { label: "Pre-2008", value: 23 },
  { label: "2019", value: 21 },
  { label: "2021-22", value: 32 },
];

const markets: MarketSnapshot[] = [
  {
    id: "seattle",
    name: "Seattle, WA",
    medianPrice: 820000,
    medianIncome: 120000,
    inventory: 980,
    monthsSupply: 2.7,
    daysOnMarket: 22,
    newListings: 620,
    closedSales: 580,
    permits: 420,
    completions: 310,
    unemploymentRate: 3.6,
    jobGrowthYoY: 1.9,
    populationGrowthYoY: 1.2,
  },
  {
    id: "lynnwood",
    name: "Lynnwood, WA",
    medianPrice: 610000,
    medianIncome: 98000,
    inventory: 340,
    monthsSupply: 2.5,
    daysOnMarket: 26,
    newListings: 210,
    closedSales: 190,
    permits: 120,
    completions: 80,
    unemploymentRate: 3.8,
    jobGrowthYoY: 1.6,
    populationGrowthYoY: 1.1,
  },
  {
    id: "everett",
    name: "Everett, WA",
    medianPrice: 585000,
    medianIncome: 94000,
    inventory: 360,
    monthsSupply: 2.6,
    daysOnMarket: 28,
    newListings: 240,
    closedSales: 220,
    permits: 140,
    completions: 95,
    unemploymentRate: 3.9,
    jobGrowthYoY: 1.5,
    populationGrowthYoY: 1.1,
  },
  {
    id: "bothell",
    name: "Bothell, WA",
    medianPrice: 745000,
    medianIncome: 118000,
    inventory: 250,
    monthsSupply: 2.3,
    daysOnMarket: 23,
    newListings: 170,
    closedSales: 160,
    permits: 130,
    completions: 90,
    unemploymentRate: 3.5,
    jobGrowthYoY: 2.0,
    populationGrowthYoY: 1.3,
  },
  {
    id: "mill-creek",
    name: "Mill Creek, WA",
    medianPrice: 710000,
    medianIncome: 112000,
    inventory: 190,
    monthsSupply: 2.2,
    daysOnMarket: 21,
    newListings: 130,
    closedSales: 125,
    permits: 85,
    completions: 60,
    unemploymentRate: 3.7,
    jobGrowthYoY: 1.7,
    populationGrowthYoY: 1.2,
  },
  {
    id: "edmonds",
    name: "Edmonds, WA",
    medianPrice: 695000,
    medianIncome: 108000,
    inventory: 210,
    monthsSupply: 2.4,
    daysOnMarket: 24,
    newListings: 150,
    closedSales: 140,
    permits: 90,
    completions: 65,
    unemploymentRate: 3.8,
    jobGrowthYoY: 1.6,
    populationGrowthYoY: 1.0,
  },
  {
    id: "mountlake-terrace",
    name: "Mountlake Terrace, WA",
    medianPrice: 635000,
    medianIncome: 98000,
    inventory: 180,
    monthsSupply: 2.3,
    daysOnMarket: 23,
    newListings: 125,
    closedSales: 118,
    permits: 70,
    completions: 50,
    unemploymentRate: 3.7,
    jobGrowthYoY: 1.6,
    populationGrowthYoY: 1.0,
  },
  {
    id: "lake-stevens",
    name: "Lake Stevens, WA",
    medianPrice: 675000,
    medianIncome: 108000,
    inventory: 210,
    monthsSupply: 2.1,
    daysOnMarket: 24,
    newListings: 140,
    closedSales: 132,
    permits: 95,
    completions: 60,
    unemploymentRate: 3.6,
    jobGrowthYoY: 1.8,
    populationGrowthYoY: 1.4,
  },
  {
    id: "kenmore",
    name: "Kenmore, WA",
    medianPrice: 725000,
    medianIncome: 115000,
    inventory: 230,
    monthsSupply: 2.3,
    daysOnMarket: 22,
    newListings: 165,
    closedSales: 155,
    permits: 110,
    completions: 75,
    unemploymentRate: 3.6,
    jobGrowthYoY: 1.8,
    populationGrowthYoY: 1.1,
  },
  {
    id: "marysville",
    name: "Marysville, WA",
    medianPrice: 560000,
    medianIncome: 92000,
    inventory: 280,
    monthsSupply: 2.9,
    daysOnMarket: 29,
    newListings: 180,
    closedSales: 165,
    permits: 110,
    completions: 70,
    unemploymentRate: 4.1,
    jobGrowthYoY: 1.2,
    populationGrowthYoY: 1.0,
  },
  {
    id: "shoreline",
    name: "Shoreline, WA",
    medianPrice: 755000,
    medianIncome: 117000,
    inventory: 260,
    monthsSupply: 2.4,
    daysOnMarket: 23,
    newListings: 180,
    closedSales: 170,
    permits: 120,
    completions: 85,
    unemploymentRate: 3.7,
    jobGrowthYoY: 1.7,
    populationGrowthYoY: 1.1,
  },
];

const nationalTrend = [
  { label: "Nation", value: 2.3 },
  { label: "State", value: 2.0 },
  { label: "Local", value: 1.4 },
];

const paymentFromRate = (principal: number, annualRate: number, years: number) => {
  if (principal <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const months = years * 12;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * factor) / (factor - 1);
};

const marketCondition = (monthsSupply: number, listingRatio: number) => {
  if (monthsSupply >= 4 || listingRatio < 0.9) return "buyer-leaning";
  if (monthsSupply <= 2 || listingRatio > 1.1) return "seller-leaning";
  return "balanced";
};

const summaryLabel = (value: string) =>
  value.replace("-", " ");

export default function HousingIntelligencePage() {
  const [marketId, setMarketId] = useState(markets[0]?.id ?? "");
  const [mortgageRates, setMortgageRates] = useState({
    mortgage30: {
      ...mockRates.mortgage30,
      current: null,
      high12m: null,
      low12m: null,
      longAvg: null,
    },
    mortgage15: {
      ...mockRates.mortgage15,
      current: null,
      high12m: null,
      low12m: null,
      longAvg: null,
    },
  });
  const [mortgageSource, setMortgageSource] = useState({
    label: "Freddie Mac PMMS",
    latestDate: "",
  });
  const [mortgageError, setMortgageError] = useState<string | null>(null);
  const [forecastOutlook, setForecastOutlook] = useState<RateRange | null>(null);
  const [forecastSource, setForecastSource] = useState<string>("Fannie Mae ESR");
  const [forecastByYear, setForecastByYear] = useState<{
    year2025?: number;
    year2026?: number;
  } | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [fedFunds, setFedFunds] = useState({
    current: mockRates.fedFunds.current,
    change3m: mockRates.fedFunds.change3m,
    change12m: mockRates.fedFunds.change12m,
    cycle: mockRates.fedFunds.cycle,
    latestDate: "",
  });
  const [fedFundsError, setFedFundsError] = useState<string | null>(null);
  const [localEconomy, setLocalEconomy] = useState<{
    latestLabel: string;
    unemploymentRate: number | null;
    unemploymentChangeYoY: number | null;
    stateUnemploymentRate: number | null;
    stateUnemploymentChangeYoY: number | null;
    employmentYoY: number | null;
    laborForceYoY: number | null;
    source: string;
    trend: { date: string; value: number | null }[];
  } | null>(null);
  const [localEconomyError, setLocalEconomyError] = useState<string | null>(null);
  const [localMarketActivity, setLocalMarketActivity] = useState<{
    latest: {
      inventory: number;
      medianSalePrice: number | null;
      monthsSupply: number;
      daysOnMarket: number;
      newListings: number;
      closedSales: number;
    } | null;
    trend: {
      date: string;
      inventory: number;
      medianSalePrice: number | null;
      monthsSupply: number;
      daysOnMarket: number;
      newListings: number;
      closedSales: number;
    }[];
    source: string;
    fetchedAt: string | null;
  } | null>(null);
  const [localMarketError, setLocalMarketError] = useState<string | null>(null);
  const localMarketCache = useRef<
    Record<
      string,
      {
        latest: {
          inventory: number;
          medianSalePrice: number | null;
          monthsSupply: number;
          daysOnMarket: number;
          newListings: number;
          closedSales: number;
        };
        trend: {
          date: string;
          inventory: number;
          medianSalePrice: number | null;
          monthsSupply: number;
          daysOnMarket: number;
          newListings: number;
          closedSales: number;
        }[];
        source: string;
        fetchedAt: string | null;
      }
    >
  >({});
  const [marketMetric, setMarketMetric] = useState<
    (typeof MARKET_METRICS)[number]["key"]
  >("monthsSupply");

  useEffect(() => {
    let mounted = true;
    const loadMortgageRates = async () => {
      try {
        const response = await fetch("/api/housing/mortgage-rates", {
          cache: "no-store",
        });
        if (!response.ok) {
          setMortgageError("Mortgage rates unavailable right now.");
          return;
        }
        const payload = (await response.json()) as {
          source?: string;
          latest_date?: string;
          series?: {
            mortgage30?: {
              current: number | null;
              high12m: number | null;
              low12m: number | null;
              longAvg: number | null;
            };
            mortgage15?: {
              current: number | null;
              high12m: number | null;
              low12m: number | null;
              longAvg: number | null;
            };
          };
        };
        if (!payload?.series?.mortgage30 || !payload?.series?.mortgage15) {
          setMortgageError("Mortgage rates unavailable right now.");
          return;
        }
        if (!mounted) return;
        setMortgageError(null);
        const mergeRates = (
          base: typeof mockRates.mortgage30,
          incoming: {
            current: number | null;
            high12m: number | null;
            low12m: number | null;
            longAvg: number | null;
          }
        ) => ({
          ...base,
          current: Number.isFinite(incoming.current) ? incoming.current : base.current,
          high12m: Number.isFinite(incoming.high12m) ? incoming.high12m : base.high12m,
          low12m: Number.isFinite(incoming.low12m) ? incoming.low12m : base.low12m,
          longAvg: Number.isFinite(incoming.longAvg) ? incoming.longAvg : base.longAvg,
        });
        setMortgageRates((prev) => ({
          mortgage30: mergeRates(prev.mortgage30, payload.series.mortgage30),
          mortgage15: mergeRates(prev.mortgage15, payload.series.mortgage15),
        }));
        setMortgageSource({
          label: payload.source ?? "Freddie Mac PMMS",
          latestDate: payload.latest_date ?? "",
        });
      } catch {
        if (!mounted) return;
        setMortgageError("Mortgage rates unavailable right now.");
      }
    };
    void loadMortgageRates();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadLocalEconomy = async () => {
      try {
        const response = await fetch(
          `/api/housing/local-economy?market=${marketId}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          setLocalEconomyError("Local economic data unavailable right now.");
          return;
        }
        const payload = (await response.json()) as {
          latest?: { year: string; periodName: string };
          unemployment?: { rate: number | null; changeYoY: number | null };
          stateUnemployment?: { rate: number | null; changeYoY: number | null };
          employment?: { changeYoY: number | null };
          laborForce?: { changeYoY: number | null };
          source?: string;
          trend?: { date: string; value: number | null }[];
        };
        if (!mounted) return;
        if (!payload?.unemployment?.rate) {
          setLocalEconomyError("Local economic data unavailable right now.");
          return;
        }
        setLocalEconomyError(null);
        setLocalEconomy({
          latestLabel: payload.latest
            ? `${payload.latest.periodName} ${payload.latest.year}`
            : "",
          unemploymentRate: payload.unemployment.rate ?? null,
          unemploymentChangeYoY: payload.unemployment.changeYoY ?? null,
          stateUnemploymentRate: payload.stateUnemployment?.rate ?? null,
          stateUnemploymentChangeYoY: payload.stateUnemployment?.changeYoY ?? null,
          employmentYoY: payload.employment?.changeYoY ?? null,
          laborForceYoY: payload.laborForce?.changeYoY ?? null,
          source: payload.source ?? "BLS LAUS",
          trend: payload.trend ?? [],
        });
      } catch {
        if (!mounted) return;
        setLocalEconomyError("Local economic data unavailable right now.");
      }
    };
    void loadLocalEconomy();
    return () => {
      mounted = false;
    };
  }, [marketId]);

  useEffect(() => {
    let mounted = true;
    const loadLocalMarket = async () => {
      try {
        const cached = localMarketCache.current[marketId];
        setLocalMarketError(null);
        if (cached) {
          setLocalMarketActivity(cached);
        }
        const response = await fetch(
          `/api/housing/local-market-activity?market=${marketId}&mode=auto`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          if (!cached) {
            setLocalMarketActivity(null);
          }
          setLocalMarketError("Local market data unavailable right now.");
          return;
        }
        const payload = (await response.json()) as {
          latest?: {
            inventory: number;
            median_sale_price: number | null;
            months_supply: number;
            days_on_market: number;
            new_listings: number;
            closed_sales: number;
          };
          latest_median_price?: number | null;
          trend?: {
            date: string;
            inventory: number;
            medianSalePrice: number | null;
            monthsSupply: number;
            daysOnMarket: number;
            newListings: number;
            closedSales: number;
          }[];
          source?: string;
          fetched_at?: string | null;
          redfin_error?: string | null;
        };
        if (!mounted) return;
        if (!payload?.latest) {
          setLocalMarketError("Local market data unavailable right now.");
          if (!cached) {
            setLocalMarketActivity(null);
          }
          return;
        }
        setLocalMarketError(null);
        const medianSalePrice =
          payload.latest_median_price ?? payload.latest.median_sale_price ?? null;
        const nextActivity = {
          latest: {
            inventory: payload.latest.inventory,
            medianSalePrice,
            monthsSupply: payload.latest.months_supply,
            daysOnMarket: payload.latest.days_on_market,
            newListings: payload.latest.new_listings,
            closedSales: payload.latest.closed_sales,
          },
          trend: payload.trend ?? [],
          source: payload.source ?? "mocked",
          fetchedAt: payload.fetched_at ?? null,
        };
        setLocalMarketActivity(nextActivity);
        localMarketCache.current[marketId] = nextActivity;
        if (medianSalePrice == null) {
          setLocalMarketError(
            "Median sale price unavailable from Redfin for this market."
          );
        }
        if (payload.redfin_error) {
          setLocalMarketError(
            `Redfin data unavailable (${payload.redfin_error}).`
          );
        }
      } catch {
        if (!mounted) return;
        const cached = localMarketCache.current[marketId];
        if (!cached) {
          setLocalMarketActivity(null);
        }
        setLocalMarketError("Local market data unavailable right now.");
      }
    };
    void loadLocalMarket();
    return () => {
      mounted = false;
    };
  }, [marketId]);
  useEffect(() => {
    let mounted = true;
    const loadForecast = async () => {
      try {
        const response = await fetch("/api/housing/mortgage-forecast", {
          cache: "no-store",
        });
        if (!response.ok) {
          setForecastError("Forecast data unavailable right now.");
          return;
        }
        const payload = (await response.json()) as {
          outlook2y?: RateRange;
          source?: string;
          value_2025?: number;
          value_2026?: number;
        };
        if (!payload?.outlook2y) {
          setForecastError("Forecast data unavailable right now.");
          return;
        }
        if (!mounted) return;
        setForecastError(null);
        setForecastOutlook(payload.outlook2y);
        setForecastByYear({
          year2025: payload.value_2025,
          year2026: payload.value_2026,
        });
        setForecastSource(payload.source ?? "Fannie Mae ESR");
      } catch {
        if (!mounted) return;
        setForecastError("Forecast data unavailable right now.");
      }
    };
    void loadForecast();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadFedFunds = async () => {
      try {
        const response = await fetch("/api/housing/fed-funds", {
          cache: "no-store",
        });
        if (!response.ok) {
          setFedFundsError("Fed Funds rate unavailable right now.");
          return;
        }
        const payload = (await response.json()) as {
          latest_date?: string;
          current?: number | null;
          change3m?: number | null;
          change12m?: number | null;
          cycle?: string;
        };
        if (!mounted) return;
        if (payload.current == null) {
          setFedFundsError("Fed Funds rate unavailable right now.");
          return;
        }
        setFedFundsError(null);
        setFedFunds({
          current: payload.current ?? mockRates.fedFunds.current,
          change3m: payload.change3m ?? mockRates.fedFunds.change3m,
          change12m: payload.change12m ?? mockRates.fedFunds.change12m,
          cycle: payload.cycle ?? mockRates.fedFunds.cycle,
          latestDate: payload.latest_date ?? "",
        });
      } catch {
        if (!mounted) return;
        setFedFundsError("Fed Funds rate unavailable right now.");
      }
    };
    void loadFedFunds();
    return () => {
      mounted = false;
    };
  }, []);

  const activeMarket = useMemo(
    () => markets.find((market) => market.id === marketId) ?? markets[0],
    [marketId]
  );

  const affordability = useMemo(() => {
    const medianPrice =
      localMarketActivity?.latest?.medianSalePrice ?? null;
    if (mortgageRates.mortgage30.current == null || medianPrice == null) {
      return { payment: null, paymentShare: null, medianPrice: null };
    }
    const principal = medianPrice * 0.8;
    const payment = paymentFromRate(
      principal,
      mortgageRates.mortgage30.current,
      30
    );
    const monthlyIncome = activeMarket.medianIncome / 12;
    const paymentShare = monthlyIncome > 0 ? (payment / monthlyIncome) * 100 : 0;
    return {
      payment,
      paymentShare,
      medianPrice,
    };
  }, [activeMarket, mortgageRates.mortgage30.current, localMarketActivity]);

  const activityLatest = localMarketActivity?.latest ?? null;
  const listingRatio =
    activityLatest && activityLatest.closedSales > 0
      ? activityLatest.newListings / activityLatest.closedSales
      : 1;
  const condition = activityLatest
    ? marketCondition(activityLatest.monthsSupply, listingRatio)
    : "balanced";

  const aiSummary = useMemo(() => {
    const windowStatus =
      affordability.paymentShare != null && affordability.paymentShare <= 28
        ? "Favorable"
        : "Neutral";
    const affordabilityTrend =
      mortgageRates.mortgage30.current != null &&
      mortgageRates.mortgage30.low12m != null &&
      mortgageRates.mortgage30.current <= mortgageRates.mortgage30.low12m + 0.4
        ? "Improving"
        : "Flat";
    const marketPressure =
      condition === "buyer-leaning"
        ? "Buyers gaining leverage"
        : condition === "seller-leaning"
        ? "Sellers dominant"
        : "Stalemate";
    const explanation =
      "For long-term homeowners, focus on affordability resilience and local supply balance while allowing 6-18 months for rate shifts to filter into listings.";
    return { windowStatus, affordabilityTrend, marketPressure, explanation };
  }, [affordability.paymentShare, condition, mortgageRates.mortgage30.current, mortgageRates.mortgage30.low12m]);
  const aiSummaryError = useMemo(() => {
    if (mortgageError || localMarketError) {
      return "AI Summary unavailable until rates and market data load.";
    }
    if (
      !activityLatest ||
      affordability.paymentShare == null ||
      mortgageRates.mortgage30.current == null ||
      mortgageRates.mortgage30.low12m == null
    ) {
      return "AI Summary unavailable until supporting data is available.";
    }
    return null;
  }, [
    mortgageError,
    localMarketError,
    activityLatest,
    affordability.paymentShare,
    mortgageRates.mortgage30.current,
    mortgageRates.mortgage30.low12m,
  ]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,107,93,0.18),_transparent_70%)]" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(169,126,84,0.2),_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.94),rgba(255,255,255,0.3))]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Housing Intelligence
            </span>
            <h1 className="font-display text-3xl text-[color:var(--ink)] md:text-4xl">
              Primary Residence Window Check
            </h1>
            <p className="text-sm text-[color:var(--muted)] md:text-base">
              A 12-36 month housing window guide focused on affordability,
              mortgage rates, and local market balance. No trading signals, no
              price predictions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={marketId}
              onChange={(event) => setMarketId(event.target.value)}
              className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
            >
              {markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              AI Summary Panel
            </h2>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-xs text-[color:var(--muted)]">
              {aiSummaryError ? (
                <div className="text-[11px] text-[color:var(--muted)]">
                  {aiSummaryError}
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <span>Buying window status</span>
                      <span className="text-[color:var(--ink)]">
                        {aiSummary.windowStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Affordability trend</span>
                      <span className="text-[color:var(--ink)]">
                        {aiSummary.affordabilityTrend}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Market pressure</span>
                      <span className="text-[color:var(--ink)]">
                        {aiSummary.marketPressure}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] p-3 text-[11px] text-[color:var(--muted)]">
                    {aiSummary.explanation}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)] md:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Interest Rate Context
            </h2>
            <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Fed Funds Rate
                </div>
                <div className="text-lg font-semibold text-[color:var(--ink)]">
                  {fedFunds.current != null ? percent(fedFunds.current) : "n/a"}
                </div>
              </div>
              <div className="grid gap-2 text-xs text-[color:var(--muted)]">
                <div>
                  3m change:{" "}
                  {fedFunds.change3m != null ? percent(fedFunds.change3m) : "n/a"}
                </div>
                <div>
                  12m change:{" "}
                  {fedFunds.change12m != null ? percent(fedFunds.change12m) : "n/a"}
                </div>
                <div>
                  Cycle status:{" "}
                  <span className="font-semibold text-[color:var(--ink)]">
                    {fedFunds.cycle}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-xs text-[color:var(--muted)]">
              Housing activity often lags rate shifts by 6-18 months. This panel
              is informational and does not imply timing signals.
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {fedFundsError
                ? fedFundsError
                : `Source: FRED (DFF)${
                    fedFunds.latestDate ? ` • Updated ${fedFunds.latestDate}` : ""
                  }`}
            </div>
          </div>
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Mortgage Rates
            </h2>
            <div className="grid gap-3 text-xs text-[color:var(--muted)]">
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em]">
                    30-year fixed
                  </span>
                  <span className="text-lg font-semibold text-[color:var(--ink)]">
                    {mortgageRates.mortgage30.current != null
                      ? percent(mortgageRates.mortgage30.current)
                      : "n/a"}
                  </span>
                </div>
                <div className="mt-2 grid gap-1">
                  <div>
                    12m range:{" "}
                    {mortgageRates.mortgage30.low12m != null &&
                    mortgageRates.mortgage30.high12m != null
                      ? `${percent(mortgageRates.mortgage30.low12m)}-${percent(
                          mortgageRates.mortgage30.high12m
                        )}`
                      : "n/a"}
                  </div>
                  <div>
                    Long-term avg:{" "}
                    {mortgageRates.mortgage30.longAvg != null
                      ? percent(mortgageRates.mortgage30.longAvg)
                      : "n/a"}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    2-year range outlook (sourced forecast)
                  </div>
                  {forecastError ? (
                    <div className="text-[11px] text-[color:var(--muted)]">
                      {forecastError}
                    </div>
                  ) : (
                    <div className="grid gap-2 text-[11px] text-[color:var(--ink)]">
                      <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        <span>
                          2026:{" "}
                          {forecastByYear?.year2026 != null
                            ? percent(forecastByYear.year2026)
                            : "n/a"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span>
                          Best: {forecastOutlook?.best ?? mockRates.mortgage30.outlook2y.best}
                        </span>
                        <span>
                          Base: {forecastOutlook?.base ?? mockRates.mortgage30.outlook2y.base}
                        </span>
                        <span>
                          Worst: {forecastOutlook?.worst ?? mockRates.mortgage30.outlook2y.worst}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-[11px] text-[color:var(--muted)]">
                Mortgage rates track the 10-year Treasury more closely than the
                Fed Funds rate.
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                {mortgageError
                  ? mortgageError
                  : `Source: ${mortgageSource.label}${
                      mortgageSource.latestDate
                        ? ` • Updated ${mortgageSource.latestDate}`
                        : ""
                    }`}
                {!forecastError && forecastSource
                  ? ` • Outlook: ${forecastSource}`
                  : ""}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)] lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="grid gap-3">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Affordability
            </h2>
            <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Median local home price
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ink)]">
                {affordability.medianPrice != null
                  ? money.format(affordability.medianPrice)
                  : "n/a"}
              </div>
              <div className="grid gap-2 text-xs text-[color:var(--muted)]">
                <div>
                  Estimated payment (30y, 20% down):{" "}
                  <span className="font-semibold text-[color:var(--ink)]">
                    {affordability.payment != null
                      ? money.format(affordability.payment)
                      : "n/a"}
                  </span>{" "}
                  / month
                </div>
                <div>
                  Payment share of median income:{" "}
                  <span className="font-semibold text-[color:var(--ink)]">
                    {affordability.paymentShare != null
                      ? percent(affordability.paymentShare)
                      : "n/a"}
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] p-3 text-xs text-[color:var(--muted)]">
                Improving affordability can come from lower rates even if home
                prices stay flat.
              </div>
            </div>
            <div className="grid gap-2 text-xs text-[color:var(--muted)]">
              <div className="text-[10px] uppercase tracking-[0.2em]">
                Historical affordability reference
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-md">
                {historicalAffordability.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center whitespace-nowrap rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-1 text-[10px] leading-tight"
                  >
                    {item.label}: {percent(item.value)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Local Market Activity
            </h2>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-xs text-[color:var(--muted)]">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span>Active inventory</span>
                  <span className="text-[color:var(--ink)]">
                    {activityLatest ? activityLatest.inventory : "n/a"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Months of supply</span>
                  <span className="text-[color:var(--ink)]">
                    {activityLatest ? activityLatest.monthsSupply.toFixed(1) : "n/a"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Days on market</span>
                  <span className="text-[color:var(--ink)]">
                    {activityLatest ? activityLatest.daysOnMarket : "n/a"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>New listings</span>
                  <span className="text-[color:var(--ink)]">
                    {activityLatest ? activityLatest.newListings : "n/a"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Closed sales</span>
                  <span className="text-[color:var(--ink)]">
                    {activityLatest ? activityLatest.closedSales : "n/a"}
                  </span>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2 text-[11px] text-[color:var(--muted)]">
                Market condition:{" "}
                <span className="font-semibold text-[color:var(--ink)]">
                  {activityLatest ? summaryLabel(condition) : "n/a"}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-xs text-[color:var(--muted)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.2em]">
                  36-month local market trend
                </div>
                <div className="flex flex-wrap gap-2">
                  {MARKET_METRICS.map((metric) => (
                    <button
                      key={metric.key}
                      type="button"
                      onClick={() => setMarketMetric(metric.key)}
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        marketMetric === metric.key
                          ? "border-[color:var(--ink)] bg-white text-[color:var(--ink)]"
                          : "border-[color:var(--line)] text-[color:var(--muted)]"
                      }`}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                {localMarketActivity?.trend?.length ? (
                  (() => {
                    const metric =
                      MARKET_METRICS.find((item) => item.key === marketMetric) ??
                      MARKET_METRICS[0];
                    return (
                      <MarketActivityChart
                        label={metric.label}
                        color={metric.color}
                        valueKey={metric.key}
                        formatValue={metric.format}
                        data={localMarketActivity.trend.map((row) => ({
                          date: row.date,
                          inventory: row.inventory,
                          monthsSupply: row.monthsSupply,
                          daysOnMarket: row.daysOnMarket,
                          newListings: row.newListings,
                          closedSales: row.closedSales,
                        }))}
                      />
                    );
                  })()
                ) : (
                  <div className="text-[11px] text-[color:var(--muted)]">
                    Trend data unavailable.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-[11px] text-[color:var(--muted)]">
              Buyer-leaning: higher supply or softer demand. Seller-leaning:
              tight supply with stronger sales.
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {localMarketError
                ? localMarketError
                : `Source: ${
                    localMarketActivity?.source === "redfin_city"
                      ? "Redfin (city)"
                      : localMarketActivity?.source === "redfin_county"
                      ? "Redfin (county)"
                      : localMarketActivity?.source
                      ? `Mocked (${localMarketActivity.source})`
                      : "Mocked"
                  }${
                    localMarketActivity?.fetchedAt
                      ? ` • Updated ${localMarketActivity.fetchedAt}`
                      : ""
                  }`}
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)] lg:grid-cols-[1fr_1fr]">
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Home Price Trend
            </h2>
            <div className="grid gap-2 text-xs text-[color:var(--muted)]">
              {nationalTrend.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2"
                >
                  <span>{row.label}</span>
                  <span className="text-[color:var(--ink)]">
                    {percent(row.value)} YoY
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-[11px] text-[color:var(--muted)]">
              Prices are sticky. Sustained declines typically require forced
              selling, credit tightening, or job losses.
            </div>
          </div>
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Supply & Construction
            </h2>
            <div className="grid gap-2 text-xs text-[color:var(--muted)]">
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>Building permits (monthly)</span>
                <span className="text-[color:var(--ink)]">
                  {activeMarket.permits}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>New completions (monthly)</span>
                <span className="text-[color:var(--ink)]">
                  {activeMarket.completions}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-[11px] text-[color:var(--muted)]">
              Limited new supply can support prices even when rates are high.
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
          <div className="grid gap-4">
            <h2 className="font-display text-xl text-[color:var(--ink)]">
              Local Economic Stability
            </h2>
            <div className="grid gap-2 text-xs text-[color:var(--muted)]">
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>Local unemployment rate</span>
                <span className="text-[color:var(--ink)]">
                  {localEconomy?.unemploymentRate != null
                    ? percent(localEconomy.unemploymentRate)
                    : "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>Unemployment change (YoY)</span>
                <span className="text-[color:var(--ink)]">
                  {localEconomy?.unemploymentChangeYoY != null
                    ? `${localEconomy.unemploymentChangeYoY.toFixed(1)} pts`
                    : "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>State unemployment rate</span>
                <span className="text-[color:var(--ink)]">
                  {localEconomy?.stateUnemploymentRate != null
                    ? percent(localEconomy.stateUnemploymentRate)
                    : "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>Employment growth (YoY)</span>
                <span className="text-[color:var(--ink)]">
                  {localEconomy?.employmentYoY != null
                    ? percent(localEconomy.employmentYoY)
                    : "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-white/80 px-3 py-2">
                <span>Labor force growth (YoY)</span>
                <span className="text-[color:var(--ink)]">
                  {localEconomy?.laborForceYoY != null
                    ? percent(localEconomy.laborForceYoY)
                    : "n/a"}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-[11px] text-[color:var(--muted)]">
              Downside risk grows if job losses or credit tightening force
              sellers into the market.
            </div>
            <div className="text-[11px] text-[color:var(--muted)]">
              City-level unemployment is not published by BLS for these metros.
              We use county-level LAUS data as the local proxy.
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {localEconomyError
                ? localEconomyError
                : `Source: ${localEconomy?.source ?? "BLS LAUS"}${
                    localEconomy?.latestLabel
                      ? ` • Updated ${localEconomy.latestLabel}`
                      : ""
                  }`}
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 p-4 text-xs text-[color:var(--muted)]">
              <div className="text-[10px] uppercase tracking-[0.2em]">
                24-month unemployment trend
              </div>
              <div className="mt-3">
                {localEconomy?.trend?.length ? (
                  <TrendChart data={localEconomy.trend} />
                ) : (
                  <div className="text-[11px] text-[color:var(--muted)]">
                    Trend data unavailable.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
