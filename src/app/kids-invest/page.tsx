"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLocalStorageState } from "@/lib/use-local-storage";

type Frequency = "monthly" | "quarterly" | "yearly";

type ScenarioInput = {
  name: string;
  startYear: number;
  startAge: number;
  cagr: number;
  inflation: number;
  contribution: number;
  birthdayContribution: number;
  frequency: Frequency;
  years: number;
  lumpSum: number;
  compareCagrs: string;
};

type YearPoint = {
  year: number;
  value: number;
};

type ChartRow = {
  year: number;
  base: number;
  [key: string]: number;
};

const defaultInput: ScenarioInput = {
  name: "Child",
  startYear: new Date().getFullYear(),
  startAge: 2,
  cagr: 7,
  inflation: 2.5,
  contribution: 200,
  birthdayContribution: 0,
  frequency: "monthly",
  years: 20,
  lumpSum: 0,
  compareCagrs: "",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const parseCompareCagrs = (raw: string) =>
  raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

const contributionInterval = (frequency: Frequency) =>
  frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;

const computeScenario = (
  years: number,
  cagr: number,
  contribution: number,
  birthdayContribution: number,
  frequency: Frequency,
  lumpSum: number
) => {
  const months = Math.max(1, Math.round(years * 12));
  const interval = contributionInterval(frequency);
  const monthlyRate = Math.pow(1 + cagr / 100, 1 / 12);
  const points: YearPoint[] = [];
  let value = lumpSum;
  let contributions = lumpSum;
  let contributionCount = 0;

  for (let month = 1; month <= months; month += 1) {
    if ((month - 1) % interval === 0) {
      value += contribution;
      contributions += contribution;
      contributionCount += 1;
    }
    if (month % 12 === 1 && birthdayContribution > 0) {
      value += birthdayContribution;
      contributions += birthdayContribution;
    }
    value *= monthlyRate;
    if (month % 12 === 0) {
      points.push({
        year: Math.ceil(month / 12),
        value,
      });
    }
  }

  return {
    points,
    endingValue: value,
    contributions,
    contributionCount,
  };
};

export default function KidsInvestPage() {
  const [input, setInput] = useLocalStorageState<ScenarioInput>(
    "kids-invest-simulator",
    defaultInput
  );
  const compareCagrs = useMemo(
    () => parseCompareCagrs(input.compareCagrs),
    [input.compareCagrs]
  );

  const primary = useMemo(
    () =>
      computeScenario(
        input.years,
        input.cagr,
        input.contribution,
        input.birthdayContribution,
        input.frequency,
        input.lumpSum
      ),
    [input]
  );

  const comparisons = useMemo(
    () =>
      compareCagrs.map((cagr) =>
        computeScenario(
          input.years,
          cagr,
          input.contribution,
          input.birthdayContribution,
          input.frequency,
          input.lumpSum
        )
      ),
    [compareCagrs, input]
  );

  const chartData = useMemo(() => {
    const rows: ChartRow[] = primary.points.map((point) => ({
      year: input.startYear + point.year - 1,
      base: point.value,
      base_real: point.value / Math.pow(1 + input.inflation / 100, point.year),
    }));
    compareCagrs.forEach((cagr, index) => {
      const key = `cagr_${index}`;
      const series = comparisons[index]?.points ?? [];
      series.forEach((point, idx) => {
        if (rows[idx]) rows[idx][key] = point.value;
      });
    });
    return rows;
  }, [primary.points, comparisons, compareCagrs, input.startYear]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,107,93,0.18),_transparent_68%)]" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(208,129,58,0.18),_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,255,255,0.15))]" />
        <div className="absolute inset-0 opacity-60 mix-blend-multiply [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_24px,rgba(214,206,196,0.18)_25px,rgba(214,206,196,0.18)_26px)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Family Planning
            </span>
            <h1 className="font-display text-3xl leading-tight text-[color:var(--ink)] md:text-4xl">
              Kids Investment Simulator
            </h1>
            <p className="max-w-2xl text-sm text-[color:var(--muted)] md:text-base">
              Calm, long-horizon planning to visualize the impact of consistency,
              compounding, and time. Assumes a steady CAGR with no market timing.
            </p>
          </div>
          <a
            href="/"
            className="rounded-full border border-[color:var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
          >
            Home
          </a>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.6fr]">
          <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
            <h3 className="font-display text-xl text-[color:var(--ink)]">
              Inputs
            </h3>
            <div className="mt-4 grid gap-4 text-sm text-[color:var(--muted)]">
              <label className="grid gap-2">
                Child name
                <input
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.name}
                  onChange={(event) =>
                    setInput((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Start year
                <input
                  type="number"
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.startYear}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      startYear: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Start age
                <input
                  type="number"
                  min={0}
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.startAge}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      startAge: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Expected CAGR (%)
                <input
                  type="number"
                  step="0.1"
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.cagr}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      cagr: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Inflation assumption (%)
                <input
                  type="number"
                  step="0.1"
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.inflation}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      inflation: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Contribution amount
                <input
                  type="number"
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.contribution}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      contribution: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Birthday contribution (annual)
                <input
                  type="number"
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.birthdayContribution}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      birthdayContribution: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Contribution frequency
                <select
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.frequency}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      frequency: event.target.value as Frequency,
                    }))
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label className="grid gap-2">
                Simulation length (years)
                <input
                  type="number"
                  min={10}
                  max={30}
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.years}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      years: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Optional initial lump sum
                <input
                  type="number"
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.lumpSum}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      lumpSum: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                Optional CAGR comparisons (comma separated)
                <input
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
                  value={input.compareCagrs}
                  onChange={(event) =>
                    setInput((prev) => ({
                      ...prev,
                      compareCagrs: event.target.value,
                    }))
                  }
                  placeholder="5, 7, 9"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
            <h3 className="font-display text-xl text-[color:var(--ink)]">
              Long-Term Projection
            </h3>
            <p className="text-xs text-[color:var(--muted)]">
              Assumes steady compounding and disciplined contributions. No
              market timing, no volatility.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Ending Value
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
                  {money.format(primary.endingValue)}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Total Contributed
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
                  {money.format(primary.contributions)}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Years Simulated
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
                  {input.years}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  CAGR Used
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
                  {input.cagr.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                {input.name || "Child"} - {input.startYear}-{input.startYear + input.years} - Age {input.startAge}-{input.startAge + input.years}
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,16,12,0.12)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: "var(--muted)", fontSize: 11 }}
                      tickFormatter={(value) => {
                        const age = input.startAge + (Number(value) - input.startYear);
                        return `${value} (Age ${age})`;
                      }}
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
                      formatter={(value: number, name: string) => {
                        if (name.startsWith("cagr_")) {
                          const index = Number(name.split("_")[1] ?? 0);
                          const cagr = compareCagrs[index];
                          return [money.format(value), `${cagr.toFixed(1)}% CAGR`];
                        }
                        if (name === "base_real") {
                          return [money.format(value), "Inflation-adjusted"];
                        }
                        return [money.format(value), "Base CAGR"];
                      }}
                      labelFormatter={(label) => {
                        const age = input.startAge + (Number(label) - input.startYear);
                        return `Year ${label} (Age ${age})`;
                      }}
                      contentStyle={{
                        background: "rgba(255,255,255,0.95)",
                        border: "1px solid var(--line)",
                        borderRadius: "10px",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="base"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="base_real"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="6 6"
                      strokeOpacity={0.6}
                    />
                    {compareCagrs.map((cagr, index) => (
                      <Line
                        key={`cmp-${cagr}`}
                        type="monotone"
                        dataKey={`cagr_${index}`}
                        stroke={index % 2 === 0 ? "var(--accent-2)" : "var(--accent-strong)"}
                        strokeWidth={2}
                        dot={false}
                        strokeOpacity={0.6}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                  Base CAGR
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full border border-[color:var(--accent)]" />
                  Inflation-adjusted
                </span>
                {compareCagrs.map((cagr, index) => (
                  <span key={cagr} className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        index % 2 === 0
                          ? "bg-[color:var(--accent-2)]"
                          : "bg-[color:var(--accent-strong)]"
                      }`}
                    />
                    {cagr.toFixed(1)}% CAGR
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

