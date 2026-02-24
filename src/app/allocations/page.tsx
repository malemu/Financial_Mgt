"use client";

import { useMemo, useState } from "react";
import { Allocation } from "@/lib/types";
import { defaultAllocations, defaultHoldings, defaultPriceMap } from "@/lib/mock-data";
import { useLocalStorageState } from "@/lib/use-local-storage";
import { computeDrift } from "@/lib/finance";

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

export default function AllocationsPage() {
  const [allocations, setAllocations] = useLocalStorageState<Allocation[]>(
    "allocations",
    defaultAllocations
  );
  const [holdings] = useLocalStorageState("holdings", defaultHoldings);
  const [priceMap] = useLocalStorageState("prices", defaultPriceMap);
  const drift = useMemo(
    () => computeDrift(allocations, holdings, priceMap),
    [allocations, holdings, priceMap]
  );
  const [view, setView] = useState<"cards" | "drift">("cards");

  const updateAllocation = (id: string, patch: Partial<Allocation>) => {
    setAllocations((prev) =>
      prev.map((allocation) =>
        allocation.id === id ? { ...allocation, ...patch } : allocation
      )
    );
  };

  const addAllocation = () => {
    const id = `alloc-${Date.now()}`;
    setAllocations((prev) => [
      ...prev,
      {
        id,
        asset_id: "NEW",
        asset_type: "stock",
        target_weight: 5,
        max_weight: 10,
        conviction_tier: 3,
        expected_cagr: 15,
        role: "core growth",
        thesis_summary: "Define thesis.",
        kill_criteria: "Define kill criteria.",
        thesis_last_review: new Date().toISOString().slice(0, 10),
        fundamentals_summary: "Add fundamentals summary.",
        price_action: "Add price action context.",
        thesis_valid: true,
      },
    ]);
  };

  const removeAllocation = (id: string) => {
    setAllocations((prev) => prev.filter((allocation) => allocation.id !== id));
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,107,93,0.22),_transparent_68%)]" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(208,129,58,0.24),_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,255,255,0.1))]" />
        <div className="absolute inset-0 opacity-60 mix-blend-multiply [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_24px,rgba(214,206,196,0.2)_25px,rgba(214,206,196,0.2)_26px)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Allocation Control
            </span>
            <h1 className="font-display text-3xl leading-tight text-[color:var(--ink)] md:text-4xl">
              Allocation Source of Truth
            </h1>
            <p className="max-w-2xl text-sm text-[color:var(--muted)] md:text-base">
              Explicit, user-defined allocation data drives every decision. Edit
              weights, conviction, thesis, and rules here.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="rounded-full border border-[color:var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
            >
              Home
            </a>
            <button
              onClick={addAllocation}
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
            >
              Add Allocation
            </button>
          </div>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-xs text-[color:var(--muted)]">
          <span>
            View mode:{" "}
            <strong className="text-[color:var(--ink)]">{view}</strong>
          </span>
          <div className="flex gap-2">
            {["cards", "drift"].map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode as "cards" | "drift")}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                  view === mode
                    ? "border-[color:var(--ink)] text-[color:var(--ink)]"
                    : "border-[color:var(--line)] text-[color:var(--muted)]"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        {view === "drift" && (
          <section className="grid gap-3">
            {drift.map((item) => (
              <div
                key={item.asset_id}
                className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-[color:var(--ink)]">
                    {item.asset_id}
                  </p>
                  <p className="text-xs text-[color:var(--muted)]">
                    Target {item.target_weight}% | Actual {formatPercent(item.actual_weight)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      item.status === "Over"
                        ? "text-[color:var(--danger)]"
                        : item.status === "Under"
                        ? "text-[color:var(--accent-2)]"
                        : "text-[color:var(--success)]"
                    }`}
                  >
                    {item.drift > 0 ? "+" : ""}
                    {formatPercent(item.drift)}
                  </p>
                  <p className="text-xs text-[color:var(--muted)]">
                    {item.status}
                    {item.max_violation ? " | Max" : ""}
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}

        {view === "cards" && (
          <section className="grid gap-4">
            {allocations.map((item) => (
              <div
                key={item.id}
                className="grid gap-4 rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-5 md:grid-cols-[1fr_1fr]"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-[color:var(--ink)]">
                        {item.asset_id}
                      </p>
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        {item.asset_type}
                      </p>
                    </div>
                    <button
                      onClick={() => removeAllocation(item.id)}
                      className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-2 text-xs text-[color:var(--muted)] sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1">
                      Asset ID
                      <input
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.asset_id}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            asset_id: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-1">
                      Asset Type
                      <select
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.asset_type}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            asset_type: event.target.value as Allocation["asset_type"],
                          })
                        }
                      >
                        <option value="stock">stock</option>
                        <option value="crypto">crypto</option>
                        <option value="index">index</option>
                        <option value="cash">cash</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      Role
                      <select
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.role}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            role: event.target.value as Allocation["role"],
                          })
                        }
                      >
                        <option value="core growth">core growth</option>
                        <option value="optionality">optionality</option>
                        <option value="ballast">ballast</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--muted)]">
                      <input
                        type="checkbox"
                        checked={item.thesis_valid}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            thesis_valid: event.target.checked,
                          })
                        }
                      />
                      Thesis valid
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                    <span className="rounded-full border border-[color:var(--line)] px-2 py-1">
                      Conviction {item.conviction_tier}
                    </span>
                    <span className="rounded-full border border-[color:var(--line)] px-2 py-1">
                      Expected CAGR {item.expected_cagr}%
                    </span>
                    <span className="rounded-full border border-[color:var(--line)] px-2 py-1">
                      {item.role}
                    </span>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-3 text-xs text-[color:var(--muted)] sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid min-w-0 gap-1">
                      Target %
                      <input
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.target_weight}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            target_weight: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="grid min-w-0 gap-1">
                      Max %
                      <input
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.max_weight}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            max_weight: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="grid min-w-0 gap-1">
                      Conviction
                      <input
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.conviction_tier}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            conviction_tier: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="grid min-w-0 gap-1">
                      Expected CAGR
                      <input
                        className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.expected_cagr}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            expected_cagr: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-3 text-xs text-[color:var(--muted)]">
                    <label className="grid gap-1">
                      Thesis Summary
                      <textarea
                        className="min-h-[70px] rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.thesis_summary}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            thesis_summary: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-1">
                      Kill Criteria
                      <textarea
                        className="min-h-[70px] rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                        value={item.kill_criteria}
                        onChange={(event) =>
                          updateAllocation(item.id, {
                            kill_criteria: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
