export type GrowthModel = "portfolio" | "asset";

export type InjectionPlan = {
  oneTimeEnabled: boolean;
  oneTimeAmount: number;
  oneTimeMonth: number;
  recurringEnabled: boolean;
  recurringAmount: number;
  recurringStartMonth: number;
  recurringEndMonth?: number;
};

export type AssetBuckets = {
  stocks: number;
  crypto: number;
  cash: number;
};

export type SimulationInputs = {
  startValue: number;
  horizonMonths: number;
  model: GrowthModel;
  portfolioCagr: number;
  assetCagr: AssetBuckets;
  buckets: AssetBuckets;
  injections: InjectionPlan;
};

export type SimulationResult = {
  series: number[];
  crossingIndex?: number;
};

const applyInjections = (
  monthIndex: number,
  value: number,
  injections: InjectionPlan
) => {
  let next = value;
  if (injections.oneTimeEnabled && monthIndex === injections.oneTimeMonth) {
    next += injections.oneTimeAmount;
  }
  if (injections.recurringEnabled) {
    const end =
      injections.recurringEndMonth ?? Number.POSITIVE_INFINITY;
    if (
      monthIndex >= injections.recurringStartMonth &&
      monthIndex <= end
    ) {
      next += injections.recurringAmount;
    }
  }
  return next;
};

export const runSimulation = (inputs: SimulationInputs): SimulationResult => {
  const { horizonMonths, model } = inputs;
  const series: number[] = [Math.max(0, inputs.startValue)];

  let stocks = Math.max(0, inputs.buckets.stocks);
  let crypto = Math.max(0, inputs.buckets.crypto);
  let cash = Math.max(0, inputs.buckets.cash);

  if (inputs.injections.oneTimeEnabled && inputs.injections.oneTimeMonth === 0) {
    stocks += inputs.injections.oneTimeAmount;
  }

  for (let month = 1; month <= horizonMonths; month += 1) {
    if (model === "portfolio") {
      const rate = inputs.portfolioCagr / 100 / 12;
      let value = series[series.length - 1] * (1 + rate);
      value = applyInjections(month, value, inputs.injections);
      series.push(value);
      continue;
    }

    const stockRate = inputs.assetCagr.stocks / 100 / 12;
    const cryptoRate = inputs.assetCagr.crypto / 100 / 12;
    const cashRate = inputs.assetCagr.cash / 100 / 12;

    stocks *= 1 + stockRate;
    crypto *= 1 + cryptoRate;
    cash *= 1 + cashRate;

    let total = stocks + crypto + cash;
    const injectedTotal = applyInjections(month, total, inputs.injections);
    const injectionDelta = injectedTotal - total;
    if (injectionDelta > 0) {
      stocks += injectionDelta;
      total = stocks + crypto + cash;
    }
    series.push(total);
  }

  return { series };
};

export const findGoalCrossing = (series: number[], goal: number) => {
  const index = series.findIndex((value) => value >= goal);
  return index >= 0 ? index : undefined;
};

export const solveMonthlyInjection = (
  inputs: Omit<SimulationInputs, "injections">,
  injections: Omit<InjectionPlan, "recurringAmount">,
  goal: number
) => {
  let low = 0;
  let high = goal;
  let answer = 0;

  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const result = runSimulation({
      ...inputs,
      injections: {
        ...injections,
        recurringAmount: mid,
      },
    });
    const finalValue = result.series[result.series.length - 1] ?? 0;
    if (finalValue >= goal) {
      answer = mid;
      high = mid;
    } else {
      low = mid;
    }
  }

  return Math.round(answer);
};

export const buildTargetSeries = (
  startValue: number,
  goal: number,
  monthsToGoal: number
) => {
  if (monthsToGoal <= 0) return [startValue];
  const series = [];
  for (let i = 0; i <= monthsToGoal; i += 1) {
    const ratio = i / monthsToGoal;
    series.push(startValue + (goal - startValue) * ratio);
  }
  return series;
};
