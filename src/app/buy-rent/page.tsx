"use client";

import { useMemo, useState } from "react";
import { defaultInputs } from "@/lib/buy-rent/defaults";
import { ScenarioInputs } from "@/lib/buy-rent/types";
import { simulateAll } from "@/lib/buy-rent/simulate";
import InputsPanel from "@/components/buy-rent/InputsPanel";
import ResultsPanel from "@/components/buy-rent/ResultsPanel";
import { useLocalStorageState } from "@/lib/use-local-storage";
import "./buy-rent.css";

const STORAGE_KEY = "rent-buy-invest-inputs-v3";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function mergeInputs(base: ScenarioInputs, incoming: Partial<ScenarioInputs>) {
  return {
    ...base,
    ...incoming,
    investmentAssets: incoming.investmentAssets ?? base.investmentAssets,
    rentInvest: {
      ...base.rentInvest,
      ...(incoming.rentInvest ?? {}),
      rent: { ...base.rentInvest.rent, ...(incoming.rentInvest?.rent ?? {}) },
      investments: {
        ...base.rentInvest.investments,
        ...(incoming.rentInvest?.investments ?? {}),
      },
    },
    buyNow: {
      ...base.buyNow,
      ...(incoming.buyNow ?? {}),
      buy: { ...base.buyNow.buy, ...(incoming.buyNow?.buy ?? {}) },
      investments: {
        ...base.buyNow.investments,
        ...(incoming.buyNow?.investments ?? {}),
      },
    },
    rentBuyLater: {
      ...base.rentBuyLater,
      ...(incoming.rentBuyLater ?? {}),
      rent: {
        ...base.rentBuyLater.rent,
        ...(incoming.rentBuyLater?.rent ?? {}),
      },
      buy: {
        ...base.rentBuyLater.buy,
        ...(incoming.rentBuyLater?.buy ?? {}),
      },
      investmentsPre: {
        ...base.rentBuyLater.investmentsPre,
        ...(incoming.rentBuyLater?.investmentsPre ?? {}),
      },
      investmentsPost: {
        ...base.rentBuyLater.investmentsPost,
        ...(incoming.rentBuyLater?.investmentsPost ?? {}),
      },
      buyLater: {
        ...base.rentBuyLater.buyLater,
        ...(incoming.rentBuyLater?.buyLater ?? {}),
      },
    },
  };
}

export default function BuyRentPage() {
  const [storedInputs, setStoredInputs] = useLocalStorageState<
    ScenarioInputs | Partial<ScenarioInputs>
  >(STORAGE_KEY, defaultInputs);
  const inputs = useMemo(
    () => mergeInputs(defaultInputs, storedInputs),
    [storedInputs]
  );
  const results = useMemo(() => simulateAll(inputs), [inputs]);
  const focusedResult = results[inputs.scenarioFocus];
  const latest = focusedResult.timeline.at(-1);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_rgba(15,107,93,0.22),_transparent_68%)]" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(208,129,58,0.24),_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,255,255,0.1))]" />
        <div className="absolute inset-0 opacity-60 mix-blend-multiply [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_24px,rgba(214,206,196,0.2)_25px,rgba(214,206,196,0.2)_26px)]" />
      </div>

      <main className="buy-rent relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:px-10">
        <div className="hero">
          <div>
            <p className="eyebrow">Rent vs Buy vs Invest Simulator</p>
            <h1 className="font-display">Map the next chapter of your wealth.</h1>
            <p className="subhead">
              Deterministic monthly simulator comparing renting, buying now, or
              buying later. Defaults are editable for your market.
            </p>
          </div>
          <div className={`hero-card focus-${inputs.scenarioFocus}`}>
            <div>
              <span className="label">Net Worth</span>
              <strong>{money.format(latest?.netWorth ?? 0)}</strong>
            </div>
            <div>
              <span className="label">Investments</span>
              <strong>{money.format(latest?.investments ?? 0)}</strong>
            </div>
            {inputs.scenarioFocus !== "rentInvest" && (
              <div>
                <span className="label">Equity</span>
                <strong>{money.format(latest?.equity ?? 0)}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="layout">
          <div className="panel-left">
            <InputsPanel inputs={inputs} onChange={setStoredInputs} />
          </div>
        <div className="panel-right">
          <ResultsPanel
            results={results}
            horizonYears={inputs.horizonYears}
            focusScenario={inputs.scenarioFocus}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
