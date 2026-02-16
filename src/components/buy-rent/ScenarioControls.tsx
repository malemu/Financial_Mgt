import { HorizonYears, ScenarioInputs, ScenarioKey } from "@/lib/buy-rent/types";
import CurrencyInput from "./CurrencyInput";

interface ScenarioControlsProps {
  inputs: ScenarioInputs;
  onChange: (next: ScenarioInputs) => void;
}

const horizonOptions: HorizonYears[] = [5, 10, 15, 20];

export default function ScenarioControls({
  inputs,
  onChange,
}: ScenarioControlsProps) {
  const setHorizon = (value: HorizonYears) => {
    const clampedBuyAfter = Math.min(
      Math.max(1, inputs.rentBuyLater.buyLater.buyAfterYears),
      value - 1
    );
    onChange({
      ...inputs,
      horizonYears: value,
      rentBuyLater: {
        ...inputs.rentBuyLater,
        buyLater: {
          ...inputs.rentBuyLater.buyLater,
          buyAfterYears: clampedBuyAfter,
        },
      },
    });
  };

  return (
    <details className={`card scenario-card focus-${inputs.scenarioFocus}`}>
      <summary>
        <h3>Scenario Controls</h3>
      </summary>
      <div className="card-body">
        <div className="field-row">
          <label>Scenario focus</label>
          <select
            className="scenario-focus"
            value={inputs.scenarioFocus}
            onChange={(event) =>
              onChange({
                ...inputs,
                scenarioFocus: event.target.value as ScenarioKey,
              })
            }
          >
            <option value="rentInvest">Rent + Invest</option>
            <option value="buyNow">Buy Now</option>
            <option value="rentBuyLater">Rent -&gt; Buy Later</option>
          </select>
        </div>
        <div className="field-row">
          <label>Monthly income</label>
          <CurrencyInput
            value={inputs.monthlyIncome}
            onChange={(event) =>
              onChange({
                ...inputs,
                monthlyIncome: event,
              })
            }
          />
        </div>
        <div className="field-row">
          <label>Horizon</label>
          <select
            value={inputs.horizonYears}
            onChange={(event) =>
              setHorizon(Number(event.target.value) as HorizonYears)
            }
          >
            {horizonOptions.map((option) => (
              <option key={option} value={option}>
                {option} years
              </option>
            ))}
          </select>
        </div>
      </div>
    </details>
  );
}
