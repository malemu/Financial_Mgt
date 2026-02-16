import { ScenarioKey, SimAllResult } from "@/lib/buy-rent/types";
import NetWorthChart from "./NetWorthChart";
import SummaryCards from "./SummaryCards";

interface ResultsPanelProps {
  results: SimAllResult;
  horizonYears: number;
  focusScenario: ScenarioKey;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function ResultsPanel({
  results,
  horizonYears,
  focusScenario,
}: ResultsPanelProps) {
  const chartData = results.buyNow.timeline.map((point, index) => ({
    month: point.monthIndex,
    buyNow: results.buyNow.timeline[index]?.netWorth ?? 0,
    rentInvest: results.rentInvest.timeline[index]?.netWorth ?? 0,
    rentBuyLater: results.rentBuyLater.timeline[index]?.netWorth ?? 0,
  }));

  const yearlyRows = Array.from({ length: horizonYears }, (_, i) => {
    const monthIndex = (i + 1) * 12;
    const buyNow = results.buyNow.timeline[monthIndex]?.netWorth ?? 0;
    const rentInvest = results.rentInvest.timeline[monthIndex]?.netWorth ?? 0;
    const rentBuyLater = results.rentBuyLater.timeline[monthIndex]?.netWorth ?? 0;
    return { year: i + 1, buyNow, rentInvest, rentBuyLater };
  });

  return (
    <div className="panel">
      <NetWorthChart data={chartData} focusScenario={focusScenario} />
      <SummaryCards
        cards={[
          { label: "Rent + Invest", result: results.rentInvest, accent: "accent-1" },
          { label: "Buy Now", result: results.buyNow, accent: "accent-2" },
          {
            label: "Rent -> Buy Later",
            result: results.rentBuyLater,
            accent: "accent-3",
          },
        ]}
      />
      <div className="card">
        <h3>Yearly Snapshot</h3>
        <div className="table">
          <div className="table-row table-header yearly">
            <div>Year</div>
            <div>Rent + Invest</div>
            <div>Buy Now</div>
            <div>Rent -&gt; Buy Later</div>
          </div>
          {yearlyRows.map((row) => (
            <div className="table-row yearly" key={row.year}>
              <div>{row.year}</div>
              <div>{money.format(row.rentInvest)}</div>
              <div>{money.format(row.buyNow)}</div>
              <div>{money.format(row.rentBuyLater)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
