"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BusinessDay,
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
} from "lightweight-charts";

type CandlePoint = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type LinePoint = {
  time: string;
  value: number;
};

type WeeklyHistoryResponse = {
  candles: CandlePoint[];
  ma50: LinePoint[];
  ma200: LinePoint[];
};

type ChartCandlePoint = Omit<CandlePoint, "time"> & { time: BusinessDay };
type ChartLinePoint = Omit<LinePoint, "time"> & { time: BusinessDay };

type Props = {
  ticker: string;
};

export default function WeeklyStockChart({ ticker }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<WeeklyHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const toBusinessDay = (isoDate: string): BusinessDay => {
    const [year, month, day] = isoDate.split("-").map((part) => Number(part));
    return { year, month, day };
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/weekly-history?ticker=${encodeURIComponent(ticker)}`
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Failed to load weekly history.");
        }
        const payload = (await response.json()) as WeeklyHistoryResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load chart.");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !data?.candles.length) return;
    const width = Math.max(1, Math.floor(root.getBoundingClientRect().width));

    const chart = createChart(root, {
      width,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#59697a",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(125, 139, 153, 0.15)" },
        horzLines: { color: "rgba(125, 139, 153, 0.15)" },
      },
      rightPriceScale: {
        borderColor: "rgba(125, 139, 153, 0.25)",
      },
      timeScale: {
        borderColor: "rgba(125, 139, 153, 0.25)",
      },
      crosshair: {
        vertLine: { color: "rgba(43, 58, 75, 0.35)" },
        horzLine: { color: "rgba(43, 58, 75, 0.35)" },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#1f7a5a",
      downColor: "#9b3d3d",
      borderVisible: false,
      wickUpColor: "#1f7a5a",
      wickDownColor: "#9b3d3d",
      priceLineVisible: false,
    });
    const chartCandles: ChartCandlePoint[] = data.candles.map((item) => ({
      ...item,
      time: toBusinessDay(item.time),
    }));
    candleSeries.setData(chartCandles);

    const ma50 = chart.addSeries(LineSeries, {
      color: "rgba(75, 132, 196, 0.9)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    const chartMa50: ChartLinePoint[] = data.ma50.map((item) => ({
      ...item,
      time: toBusinessDay(item.time),
    }));
    ma50.setData(chartMa50);

    const ma200 = chart.addSeries(LineSeries, {
      color: "rgba(196, 143, 75, 0.9)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    const chartMa200: ChartLinePoint[] = data.ma200.map((item) => ({
      ...item,
      time: toBusinessDay(item.time),
    }));
    ma200.setData(chartMa200);

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      const nextWidth = Math.max(1, Math.floor(root.getBoundingClientRect().width));
      chart.applyOptions({ width: nextWidth });
    });
    observer.observe(root);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-5 text-sm text-[color:var(--muted)]">
        Loading weekly chart...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[color:var(--danger)] bg-white/80 px-4 py-5 text-sm text-[color:var(--danger)]">
        {error}
      </div>
    );
  }

  if (!data?.candles.length) {
    return (
      <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-5 text-sm text-[color:var(--muted)]">
        No weekly history available.
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white/80">
      <div ref={rootRef} className="w-full" />
    </div>
  );
}
