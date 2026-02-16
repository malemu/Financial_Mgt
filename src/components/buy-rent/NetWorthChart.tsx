"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

  return (
    <div className="card chart">
      <h3>Net Worth Over Time</h3>
      {data.length === 0 ? (
        <div className="chart-empty">No data yet.</div>
      ) : (
        <div className="chart-area chart-area-reference">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(20,16,12,0.18)"
              />
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
                formatter={(value: number) => money.format(value)}
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
        </div>
      )}
      <div className="legend">
        <span className="dot rent">Rent + Invest</span>
        <span className="dot buy">Buy Now</span>
        <span className="dot later">Rent -&gt; Buy Later</span>
      </div>
    </div>
  );
}
