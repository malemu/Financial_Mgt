"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Holding } from "@/lib/types";
import { defaultHoldings, defaultPriceMap } from "@/lib/mock-data";
import { computePortfolioValue, computePositionValue, getPrice } from "@/lib/finance";
import { useHoldingsState } from "@/hooks/useHoldingsState";
import { usePriceMapState } from "@/hooks/usePriceMapState";

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export default function HoldingsPage() {
  const {
    holdings,
    updateHolding: updateHoldingRecord,
    addHolding: addHoldingRecord,
    removeHolding: removeHoldingRecord,
  } = useHoldingsState(defaultHoldings);
  const { priceMap, setPrice, ensurePrice, renameAsset, removeAsset } = usePriceMapState(
    defaultPriceMap
  );

  const portfolioValue = useMemo(
    () => computePortfolioValue(holdings, priceMap),
    [holdings, priceMap]
  );

  const handleHoldingChange = (index: number, patch: Partial<Holding>) => {
    const target = holdings[index];
    if (!target) return;
    const previousId = target.asset_id;
    const nextPatch = { ...patch };
    if (nextPatch.asset_id) {
      nextPatch.asset_id = nextPatch.asset_id.toUpperCase();
    }
    void updateHoldingRecord(previousId, nextPatch);
    if (nextPatch.asset_id && nextPatch.asset_id !== previousId) {
      void renameAsset(previousId, nextPatch.asset_id);
    }
  };

  const handleAddHolding = async () => {
    const holding = await addHoldingRecord();
    await ensurePrice(holding.asset_id, 0);
  };

  const handleRemoveHolding = async (index: number) => {
    const holding = holdings[index];
    if (!holding) return;
    await removeHoldingRecord(holding.asset_id);
    await removeAsset(holding.asset_id);
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
              Holdings Ledger
            </span>
            <h1 className="font-display text-3xl leading-tight text-[color:var(--ink)] md:text-4xl">
              Holdings & Net Worth Inputs
            </h1>
            <p className="max-w-2xl text-sm text-[color:var(--muted)] md:text-base">
              Enter shares, entry price, and cost basis to keep the portfolio
              value and net worth projections accurate.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-[color:var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
            >
              Home
            </Link>
            <button
              onClick={handleAddHolding}
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
            >
              Add Holding
            </button>
          </div>
        </header>

        <section className="rounded-3xl border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Portfolio Value
            </div>
            <div className="text-lg font-semibold text-[color:var(--ink)]">
              {formatCurrency(portfolioValue)}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {holdings.map((holding, index) => {
            const currentPrice = getPrice(priceMap, holding.asset_id);
            const positionValue = computePositionValue(holding, priceMap);
            return (
              <div
                key={`${holding.asset_id}-${index}`}
                className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4 text-xs text-[color:var(--muted)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      className="w-20 rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink)]"
                      value={holding.asset_id}
                      onChange={(event) =>
                        handleHoldingChange(index, {
                          asset_id: event.target.value.toUpperCase(),
                        })
                      }
                    />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                      Holdings
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveHolding(index)}
                    className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  <span>Current Price</span>
                  <span className="text-[color:var(--ink)]">
                    {formatCurrency(currentPrice)}
                  </span>
                  <span className="ml-auto text-[color:var(--muted)]">
                    Position Value
                  </span>
                  <span className="text-[color:var(--ink)]">
                    {formatCurrency(positionValue)}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid min-w-0 gap-1">
                    Shares
                    <input
                      className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={holding.shares}
                      onChange={(event) =>
                        handleHoldingChange(index, {
                          shares: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    Entry Price
                    <input
                      className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={holding.entry_price}
                      onChange={(event) =>
                        handleHoldingChange(index, {
                          entry_price: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    Cost Basis
                    <input
                      className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={holding.cost_basis}
                      onChange={(event) =>
                        handleHoldingChange(index, {
                          cost_basis: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    Current Price
                    <input
                      className="w-full rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-[color:var(--ink)]"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={currentPrice}
                      onChange={(event) =>
                        void setPrice(holding.asset_id, Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
