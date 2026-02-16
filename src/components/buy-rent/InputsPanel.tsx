import { BuyInputs, RentInputs, ScenarioInputs } from "@/lib/buy-rent/types";
import { mortgagePayment } from "@/lib/buy-rent/finance";
import CurrencyInput from "./CurrencyInput";
import ScenarioControls from "./ScenarioControls";
import InvestmentsEditor from "./InvestmentsEditor";

interface InputsPanelProps {
  inputs: ScenarioInputs;
  onChange: (next: ScenarioInputs) => void;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function calcHousingOutflow(buy: BuyInputs): number {
  if (buy.purchasePrice <= 0) return 0;
  const mortgageBalance = Math.max(0, buy.purchasePrice - buy.downPaymentAmount);
  const mortgagePaymentActual =
    mortgageBalance > 0
      ? mortgagePayment(mortgageBalance, buy.mortgageRateAnnual, buy.termYears)
      : 0;
  const tax = (buy.purchasePrice * buy.propertyTaxRate) / 100 / 12;
  const maintenance = (buy.purchasePrice * buy.maintenanceRate) / 100 / 12;
  const insurance = buy.insuranceAnnual / 12;
  return mortgagePaymentActual + tax + maintenance + insurance + buy.hoaMonthly;
}

function updateBuyInputs(
  current: BuyInputs,
  patch: Partial<BuyInputs>
): BuyInputs {
  return { ...current, ...patch };
}

function updateRentInputs(
  current: RentInputs,
  patch: Partial<RentInputs>
): RentInputs {
  return { ...current, ...patch };
}

export default function InputsPanel({ inputs, onChange }: InputsPanelProps) {
  const updateBuyNow = (patch: Partial<ScenarioInputs["buyNow"]>) => {
    onChange({ ...inputs, buyNow: { ...inputs.buyNow, ...patch } });
  };

  const updateRentInvest = (patch: Partial<ScenarioInputs["rentInvest"]>) => {
    onChange({ ...inputs, rentInvest: { ...inputs.rentInvest, ...patch } });
  };

  const updateRentBuyLater = (
    patch: Partial<ScenarioInputs["rentBuyLater"]>
  ) => {
    onChange({ ...inputs, rentBuyLater: { ...inputs.rentBuyLater, ...patch } });
  };

  const handleBuyDownPayment = (
    buy: BuyInputs,
    purchasePrice: number,
    downPaymentAmount: number
  ) => {
    const downPaymentPercent =
      purchasePrice > 0 ? (downPaymentAmount / purchasePrice) * 100 : 0;
    return { ...buy, purchasePrice, downPaymentAmount, downPaymentPercent };
  };

  const handleBuyDownPaymentPercent = (
    buy: BuyInputs,
    purchasePrice: number,
    downPaymentPercent: number
  ) => {
    const downPaymentAmount = (purchasePrice * downPaymentPercent) / 100;
    return { ...buy, purchasePrice, downPaymentAmount, downPaymentPercent };
  };

  const buyNowHousingOutflow = calcHousingOutflow(inputs.buyNow.buy);
  const rentBuyLaterHousingOutflow = calcHousingOutflow(inputs.rentBuyLater.buy);

  return (
    <div className="panel">
      <ScenarioControls inputs={inputs} onChange={onChange} />

      <details className="card scenario-card focus-rentInvest">
        <summary>
          <h3>Rent + Invest Inputs</h3>
        </summary>
        <div className="card-body">
          <div className="grid-2">
          <div className="field-row">
            <label>Monthly rent</label>
            <CurrencyInput
              value={inputs.rentInvest.rent.monthlyRent}
              onChange={(event) =>
                updateRentInvest({
                  rent: updateRentInputs(inputs.rentInvest.rent, {
                    monthlyRent: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Rent inflation (annual %)</label>
            <input
              type="number"
              value={inputs.rentInvest.rent.rentInflationRate}
              onChange={(event) =>
                updateRentInvest({
                  rent: updateRentInputs(inputs.rentInvest.rent, {
                    rentInflationRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Renters insurance (monthly $)</label>
            <CurrencyInput
              value={inputs.rentInvest.rent.rentersInsuranceMonthly}
              onChange={(event) =>
                updateRentInvest({
                  rent: updateRentInputs(inputs.rentInvest.rent, {
                    rentersInsuranceMonthly: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Invest monthly (cap)</label>
            <CurrencyInput
              value={inputs.rentInvest.investments.monthlyContribution}
              onChange={(event) =>
                updateRentInvest({
                  investments: {
                    ...inputs.rentInvest.investments,
                    monthlyContribution: event,
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Additional Lump-Sum Investment ($)</label>
            <CurrencyInput
              value={inputs.rentInvest.investments.lumpSum}
              onChange={(event) =>
                updateRentInvest({
                  investments: {
                    ...inputs.rentInvest.investments,
                    lumpSum: event,
                  },
                })
              }
            />
          </div>
          </div>
        </div>
      </details>

      <details className="card scenario-card focus-buyNow">
        <summary>
          <h3>Buy Now Inputs</h3>
        </summary>
        <div className="card-body">
          <div className="grid-2">
          <div className="field-row">
            <label>Purchase price</label>
            <CurrencyInput
              value={inputs.buyNow.buy.purchasePrice}
              onChange={(event) =>
                updateBuyNow({
                  buy: handleBuyDownPayment(
                    inputs.buyNow.buy,
                    event,
                    inputs.buyNow.buy.downPaymentAmount
                  ),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Mortgage rate (annual %)</label>
            <input
              type="number"
              value={inputs.buyNow.buy.mortgageRateAnnual}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    mortgageRateAnnual: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Down payment ($)</label>
            <CurrencyInput
              value={inputs.buyNow.buy.downPaymentAmount}
              onChange={(event) =>
                updateBuyNow({
                  buy: handleBuyDownPayment(
                    inputs.buyNow.buy,
                    inputs.buyNow.buy.purchasePrice,
                    event
                  ),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Down payment (%)</label>
            <input
              type="number"
              value={inputs.buyNow.buy.downPaymentPercent}
              onChange={(event) =>
                updateBuyNow({
                  buy: handleBuyDownPaymentPercent(
                    inputs.buyNow.buy,
                    inputs.buyNow.buy.purchasePrice,
                    Number(event.target.value)
                  ),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Term (years)</label>
            <select
              value={inputs.buyNow.buy.termYears}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    termYears: Number(event.target.value) as 15 | 30,
                  }),
                })
              }
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
          </div>
          <div className="field-row">
            <label>Property tax (annual %)</label>
            <input
              type="number"
              value={inputs.buyNow.buy.propertyTaxRate}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    propertyTaxRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Insurance (annual $)</label>
            <CurrencyInput
              value={inputs.buyNow.buy.insuranceAnnual}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    insuranceAnnual: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Maintenance (annual %)</label>
            <input
              type="number"
              value={inputs.buyNow.buy.maintenanceRate}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    maintenanceRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>HOA (monthly $)</label>
            <CurrencyInput
              value={inputs.buyNow.buy.hoaMonthly}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    hoaMonthly: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Home price growth (annual %)</label>
            <input
              type="number"
              value={inputs.buyNow.buy.homeGrowthRate}
              onChange={(event) =>
                updateBuyNow({
                  buy: updateBuyInputs(inputs.buyNow.buy, {
                    homeGrowthRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Invest monthly (cap)</label>
            <CurrencyInput
              value={inputs.buyNow.investments.monthlyContribution}
              onChange={(event) =>
                updateBuyNow({
                  investments: {
                    ...inputs.buyNow.investments,
                    monthlyContribution: event,
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Housing outflow (monthly)</label>
            <div className="readout">{money.format(buyNowHousingOutflow)}</div>
          </div>
          <div className="field-row">
            <label>Additional Lump-Sum Investment ($)</label>
            <CurrencyInput
              value={inputs.buyNow.investments.lumpSum}
              onChange={(event) =>
                updateBuyNow({
                  investments: {
                    ...inputs.buyNow.investments,
                    lumpSum: event,
                  },
                })
              }
            />
          </div>
          </div>
        </div>
      </details>

      <details className="card scenario-card focus-rentBuyLater">
        <summary>
          <h3>Rent -&gt; Buy Later Inputs</h3>
        </summary>
        <div className="card-body">
          <div className="grid-2">
          <div className="field-row">
            <label>Buy after (years)</label>
            <input
              type="number"
              min={1}
              max={inputs.horizonYears - 1}
              value={inputs.rentBuyLater.buyLater.buyAfterYears}
              onChange={(event) =>
                updateRentBuyLater({
                  buyLater: {
                    ...inputs.rentBuyLater.buyLater,
                    buyAfterYears: Math.min(
                      Math.max(1, Number(event.target.value)),
                      inputs.horizonYears - 1
                    ),
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Invest monthly pre-buy (cap)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.investmentsPre.monthlyContribution}
              onChange={(event) =>
                updateRentBuyLater({
                  investmentsPre: {
                    ...inputs.rentBuyLater.investmentsPre,
                    monthlyContribution: event,
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Additional Lump-Sum Investment ($)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.investmentsPre.lumpSum}
              onChange={(event) =>
                updateRentBuyLater({
                  investmentsPre: {
                    ...inputs.rentBuyLater.investmentsPre,
                    lumpSum: event,
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Invest monthly post-buy (cap)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.investmentsPost.monthlyContribution}
              onChange={(event) =>
                updateRentBuyLater({
                  investmentsPost: {
                    ...inputs.rentBuyLater.investmentsPost,
                    monthlyContribution: event,
                  },
                })
              }
            />
          </div>
          </div>
          <h4>Rent phase</h4>
          <div className="grid-2">
          <div className="field-row">
            <label>Monthly rent</label>
            <CurrencyInput
              value={inputs.rentBuyLater.rent.monthlyRent}
              onChange={(event) =>
                updateRentBuyLater({
                  rent: updateRentInputs(inputs.rentBuyLater.rent, {
                    monthlyRent: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Rent inflation (annual %)</label>
            <input
              type="number"
              value={inputs.rentBuyLater.rent.rentInflationRate}
              onChange={(event) =>
                updateRentBuyLater({
                  rent: updateRentInputs(inputs.rentBuyLater.rent, {
                    rentInflationRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Renters insurance (monthly $)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.rent.rentersInsuranceMonthly}
              onChange={(event) =>
                updateRentBuyLater({
                  rent: updateRentInputs(inputs.rentBuyLater.rent, {
                    rentersInsuranceMonthly: event,
                  }),
                })
              }
            />
          </div>
          </div>

          <h4>Purchase phase</h4>
          <div className="grid-2">
          <div className="field-row">
            <label>Purchase price</label>
            <CurrencyInput
              value={inputs.rentBuyLater.buy.purchasePrice}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: handleBuyDownPayment(
                    inputs.rentBuyLater.buy,
                    event,
                    inputs.rentBuyLater.buy.downPaymentAmount
                  ),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Mortgage rate (annual %)</label>
            <input
              type="number"
              value={inputs.rentBuyLater.buy.mortgageRateAnnual}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    mortgageRateAnnual: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Down payment ($)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.buy.downPaymentAmount}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: handleBuyDownPayment(
                    inputs.rentBuyLater.buy,
                    inputs.rentBuyLater.buy.purchasePrice,
                    event
                  ),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Down payment (%)</label>
            <input
              type="number"
              value={inputs.rentBuyLater.buy.downPaymentPercent}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: handleBuyDownPaymentPercent(
                    inputs.rentBuyLater.buy,
                    inputs.rentBuyLater.buy.purchasePrice,
                    Number(event.target.value)
                  ),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Term (years)</label>
            <select
              value={inputs.rentBuyLater.buy.termYears}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    termYears: Number(event.target.value) as 15 | 30,
                  }),
                })
              }
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
          </div>
          <div className="field-row">
            <label>Property tax (annual %)</label>
            <input
              type="number"
              value={inputs.rentBuyLater.buy.propertyTaxRate}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    propertyTaxRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Insurance (annual $)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.buy.insuranceAnnual}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    insuranceAnnual: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Maintenance (annual %)</label>
            <input
              type="number"
              value={inputs.rentBuyLater.buy.maintenanceRate}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    maintenanceRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>HOA (monthly $)</label>
            <CurrencyInput
              value={inputs.rentBuyLater.buy.hoaMonthly}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    hoaMonthly: event,
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Home price growth (annual %)</label>
            <input
              type="number"
              value={inputs.rentBuyLater.buy.homeGrowthRate}
              onChange={(event) =>
                updateRentBuyLater({
                  buy: updateBuyInputs(inputs.rentBuyLater.buy, {
                    homeGrowthRate: Number(event.target.value),
                  }),
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Housing outflow (monthly)</label>
            <div className="readout">
              {money.format(rentBuyLaterHousingOutflow)}
            </div>
          </div>
          </div>
        </div>
      </details>

      <InvestmentsEditor
        assets={inputs.investmentAssets}
        onChange={(next) => onChange({ ...inputs, investmentAssets: next })}
      />

    </div>
  );
}
