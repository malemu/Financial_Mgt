import { ScenarioResult } from "@/lib/buy-rent/types";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface SummaryCardData {
  label: string;
  result: ScenarioResult;
  accent: string;
}

interface SummaryCardsProps {
  cards: SummaryCardData[];
}

export default function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <div className="summary-grid">
      {cards.map((card) => (
        <div key={card.label} className={`card summary ${card.accent}`}>
          <h4>{card.label}</h4>
          <div className="summary-main">
            {money.format(card.result.totals.totalNetWorth)}
          </div>
          <div className="summary-list">
            <div>Investments: {money.format(card.result.totals.investments)}</div>
            <div>Home value: {money.format(card.result.totals.homeValue)}</div>
            <div>
              Mortgage balance: {money.format(card.result.totals.mortgageBalance)}
            </div>
            <div>Equity: {money.format(card.result.totals.equity)}</div>
            <div>
              Housing outflow:{" "}
              {money.format(card.result.totals.totalHousingOutflow)}
            </div>
            <div>
              Contributions: {money.format(card.result.totals.totalContributions)}
            </div>
            <div>
              Interest paid: {money.format(card.result.totals.totalInterestPaid)}
            </div>
            <div>
              Principal paid: {money.format(card.result.totals.totalPrincipalPaid)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
