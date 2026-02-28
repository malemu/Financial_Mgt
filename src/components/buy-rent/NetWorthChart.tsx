"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Formatter } from "recharts/types/component/DefaultTooltipContent";

type ChartPoint = {
  month: number;
  rentInvest: number;
  buyNow: number;
  rentBuyLater: number;
};

interface NetWorthChartProps {
  data: ChartPoint[];
  focusScenario: "rentInvest" | "buyNow" | "rentBuyLater";
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function NetWorthChart({
  data,
  focusScenario,
}: NetWorthChartProps) {
  const faded = 0.35;
  const full = 1;
  const tooltipFormatter = ((value?: number) =>
    money.format(typeof value === "number" ? value : 0)) as Formatter<number, string>;
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const chartContent = isClient ? (
    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,12,0.18)" />
        <XAxis
          dataKey="month"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          axisLine={{ stroke: "rgba(20,16,12,0.2)" }}
          tickLine={{ stroke: "rgba(20,16,12,0.2)" }}
        />
        <YAxis
          tickFormatter={(value) => money.format(value)}
          width={90}
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          axisLine={{ stroke: "rgba(20,16,12,0.2)" }}
          tickLine={{ stroke: "rgba(20,16,12,0.2)" }}
        />
        <Tooltip
          formatter={tooltipFormatter}
          labelFormatter={(label) => `Month ${label}`}
          contentStyle={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid var(--line)",
            borderRadius: "10px",
            fontSize: "12px",
          }}
        />
        <Line
          type="monotone"
          dataKey="rentInvest"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          strokeOpacity={focusScenario === "rentInvest" ? full : faded}
        />
        <Line
          type="monotone"
          dataKey="buyNow"
          stroke="var(--accent-2)"
          strokeWidth={2}
          dot={false}
          strokeOpacity={focusScenario === "buyNow" ? full : faded}
        />
        <Line
          type="monotone"
          dataKey="rentBuyLater"
          stroke="var(--accent-strong)"
          strokeWidth={2}
          dot={false}
          strokeOpacity={focusScenario === "rentBuyLater" ? full : faded}
        />
      </LineChart>
    </ResponsiveContainer>
  ) : (
    <div className="flex h-72 w-full items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white/70 text-xs text-[color:var(--muted)]">
      Loading chart…
    </div>
  );

  return (
    <div className="card chart">
      <h3>Net Worth Over Time</h3>
      {data.length === 0 ? (
        <div className="chart-empty">No data yet.</div>
      ) : (
        <div className="chart-area chart-area-reference">{chartContent}</div>
      )}
      <div className="legend">
        <span className="dot rent">Rent + Invest</span>
        <span className="dot buy">Buy Now</span>
        <span className="dot later">Rent -&gt; Buy Later</span>
      </div>
    </div>
  );
}
