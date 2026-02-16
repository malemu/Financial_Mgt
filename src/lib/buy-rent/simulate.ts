import {
  ScenarioInputs,
  ScenarioResult,
  MonthResult,
  SimAllResult,
  BuyInputs,
  RentInputs,
} from "./types";
import {
  monthlyRateFromAnnual,
  mortgagePayment,
  amortizeOneMonth,
  grow,
} from "./finance";

const EPS = 1e-9;

function weightedMonthlyRate(assets: ScenarioInputs["investmentAssets"]): number {
  const totalWeight = assets.reduce((sum, asset) => sum + asset.weight, 0);
  if (totalWeight <= EPS) {
    return 0;
  }
  return assets.reduce(
    (sum, asset) =>
      sum +
      (asset.weight / totalWeight) * monthlyRateFromAnnual(asset.cagr),
    0
  );
}

function createBaseTimeline(
  initial: Omit<
    MonthResult,
    | "monthIndex"
    | "housingOutflow"
    | "contributions"
    | "expenseReserve"
    | "interestPaid"
    | "principalPaid"
    | "cumulativeInterestPaid"
    | "cumulativePrincipalPaid"
  >
): MonthResult[] {
  return [
    {
      monthIndex: 0,
      housingOutflow: 0,
      contributions: 0,
      expenseReserve: 0,
      interestPaid: 0,
      principalPaid: 0,
      cumulativeInterestPaid: 0,
      cumulativePrincipalPaid: 0,
      ...initial,
    },
  ];
}

function finalizeTimeline(timeline: MonthResult[]): ScenarioResult {
  const last = timeline[timeline.length - 1];
  const totals = timeline.reduce(
    (acc, month) => {
      acc.totalHousingOutflow += month.housingOutflow;
      acc.totalContributions += month.contributions;
      acc.totalInterestPaid = Math.max(
        acc.totalInterestPaid,
        month.cumulativeInterestPaid
      );
      acc.totalPrincipalPaid = Math.max(
        acc.totalPrincipalPaid,
        month.cumulativePrincipalPaid
      );
      return acc;
    },
    {
      totalHousingOutflow: 0,
      totalContributions: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
    }
  );

  return {
    timeline,
    totals: {
      totalNetWorth: last.netWorth,
      investments: last.investments,
      homeValue: last.homeValue,
      mortgageBalance: last.mortgageBalance,
      equity: last.equity,
      totalHousingOutflow: totals.totalHousingOutflow,
      totalContributions: totals.totalContributions,
      expenseReserve: last.expenseReserve,
      totalInterestPaid: totals.totalInterestPaid,
      totalPrincipalPaid: totals.totalPrincipalPaid,
    },
  };
}

function applyCashFlow({
  income,
  housingOutflow,
  plannedContribution,
  livingExpenses,
}: {
  income: number;
  housingOutflow: number;
  plannedContribution: number;
  livingExpenses: number;
}) {
  const baseline = income - housingOutflow - livingExpenses;
  const contributions = Math.min(plannedContribution, Math.max(0, baseline));
  const expenseReserve = Math.max(
    0,
    income - housingOutflow - contributions - livingExpenses
  );

  return {
    contributions,
    expenseReserve,
  };
}

function rentHousingCost(rent: number, inputs: RentInputs): number {
  return rent + inputs.rentersInsuranceMonthly;
}

function ownerHousingCost(
  homeValue: number,
  buy: BuyInputs,
  mortgagePaymentActual: number
): number {
  const tax = (homeValue * buy.propertyTaxRate) / 100 / 12;
  const maintenance = (homeValue * buy.maintenanceRate) / 100 / 12;
  const insurance = buy.insuranceAnnual / 12;
  return mortgagePaymentActual + tax + maintenance + insurance + buy.hoaMonthly;
}

export function simulateBuyNow(inputs: ScenarioInputs): ScenarioResult {
  const months = inputs.horizonYears * 12;
  const weightedRate = weightedMonthlyRate(inputs.investmentAssets);
  const buy = inputs.buyNow.buy;
  const downPayment = buy.downPaymentAmount;

  let investments = Math.max(0, inputs.buyNow.investments.lumpSum);
  let homeValue = buy.purchasePrice;
  let mortgageBalance = buy.purchasePrice - downPayment;
  let monthlyPayment = mortgagePayment(
    mortgageBalance,
    buy.mortgageRateAnnual,
    buy.termYears
  );
  let cumulativeInterestPaid = 0;
  let cumulativePrincipalPaid = 0;

  const timeline = createBaseTimeline({
    investments,
    homeValue,
    mortgageBalance,
    equity: Math.max(0, downPayment),
    netWorth: Math.max(0, downPayment),
  });

  for (let m = 1; m <= months; m += 1) {
    let housingOutflow = 0;
    let mortgagePaymentActual = 0;
    let interestPaid = 0;
    let principalPaid = 0;

    if (homeValue > 0) {
      mortgagePaymentActual = mortgageBalance > 0 ? monthlyPayment : 0;
      housingOutflow = ownerHousingCost(homeValue, buy, mortgagePaymentActual);
    }

    const cashFlow = applyCashFlow({
      income: inputs.monthlyIncome,
      housingOutflow,
      plannedContribution: inputs.buyNow.investments.monthlyContribution,
      livingExpenses: inputs.monthlyLivingExpenses,
    });

    const contributions = cashFlow.contributions;
    const expenseReserve = cashFlow.expenseReserve;

    investments = investments * (1 + weightedRate) + contributions;

    if (mortgageBalance > 0) {
      const amortized = amortizeOneMonth(
        mortgageBalance,
        buy.mortgageRateAnnual,
        mortgagePaymentActual
      );
      mortgageBalance = amortized.balance;
      interestPaid = amortized.interest;
      principalPaid = amortized.principal;
      cumulativeInterestPaid += interestPaid;
      cumulativePrincipalPaid += principalPaid;
    }

    if (homeValue > 0) {
      homeValue = grow(homeValue, buy.homeGrowthRate);
    }

    const equity = Math.max(0, homeValue - mortgageBalance);
    const netWorth = investments + equity;

    timeline.push({
      monthIndex: m,
      investments,
      homeValue,
      mortgageBalance,
      equity,
      netWorth,
      housingOutflow,
      contributions,
      expenseReserve,
      interestPaid,
      principalPaid,
      cumulativeInterestPaid,
      cumulativePrincipalPaid,
    });
  }

  return finalizeTimeline(timeline);
}

export function simulateRentInvest(inputs: ScenarioInputs): ScenarioResult {
  const months = inputs.horizonYears * 12;
  const weightedRate = weightedMonthlyRate(inputs.investmentAssets);
  let investments =
    Math.max(0, inputs.buyNow.buy.downPaymentAmount) +
    Math.max(0, inputs.rentInvest.investments.lumpSum);
  let rent = inputs.rentInvest.rent.monthlyRent;

  const timeline = createBaseTimeline({
    investments,
    homeValue: 0,
    mortgageBalance: 0,
    equity: 0,
    netWorth: investments,
  });

  for (let m = 1; m <= months; m += 1) {
    const housingOutflow = rentHousingCost(rent, inputs.rentInvest.rent);
    const cashFlow = applyCashFlow({
      income: inputs.monthlyIncome,
      housingOutflow,
      plannedContribution: inputs.rentInvest.investments.monthlyContribution,
      livingExpenses: inputs.monthlyLivingExpenses,
    });

    const contributions = cashFlow.contributions;
    const expenseReserve = cashFlow.expenseReserve;

    investments = investments * (1 + weightedRate) + contributions;

    const netWorth = investments;
    timeline.push({
      monthIndex: m,
      investments,
      homeValue: 0,
      mortgageBalance: 0,
      equity: 0,
      netWorth,
      housingOutflow,
      contributions,
      expenseReserve,
      interestPaid: 0,
      principalPaid: 0,
      cumulativeInterestPaid: 0,
      cumulativePrincipalPaid: 0,
    });

    rent = rent * (1 + monthlyRateFromAnnual(inputs.rentInvest.rent.rentInflationRate));
  }

  return finalizeTimeline(timeline);
}

export function simulateRentBuyLater(inputs: ScenarioInputs): ScenarioResult {
  const months = inputs.horizonYears * 12;
  const weightedRate = weightedMonthlyRate(inputs.investmentAssets);
  const buyAfterMonths = Math.min(
    inputs.rentBuyLater.buyLater.buyAfterYears * 12,
    months
  );

  let investments =
    Math.max(0, inputs.rentBuyLater.buy.downPaymentAmount) +
    Math.max(0, inputs.rentBuyLater.investmentsPre.lumpSum);
  let rent = inputs.rentBuyLater.rent.monthlyRent;
  let homeValue = 0;
  let mortgageBalance = 0;
  let monthlyPayment = 0;
  let cumulativeInterestPaid = 0;
  let cumulativePrincipalPaid = 0;

  const timeline = createBaseTimeline({
    investments,
    homeValue,
    mortgageBalance,
    equity: 0,
    netWorth: investments,
  });

  for (let m = 1; m <= months; m += 1) {
    let housingOutflow = 0;
    let interestPaid = 0;
    let principalPaid = 0;
    let plannedContribution = inputs.rentBuyLater.investmentsPre.monthlyContribution;

    if (m < buyAfterMonths) {
      housingOutflow = rentHousingCost(rent, inputs.rentBuyLater.rent);
    } else if (m === buyAfterMonths) {
      const purchasePriceAtBuy =
        inputs.rentBuyLater.buy.purchasePrice *
        Math.pow(
          1 + monthlyRateFromAnnual(inputs.rentBuyLater.buy.homeGrowthRate),
          m - 1
        );
      const downPaymentTarget = Math.max(
        0,
        inputs.rentBuyLater.buy.downPaymentAmount
      );
      const downPaymentAtBuy = Math.min(investments, downPaymentTarget);
      investments -= downPaymentAtBuy;
      homeValue = purchasePriceAtBuy;
      mortgageBalance = purchasePriceAtBuy - downPaymentAtBuy;
      monthlyPayment = mortgagePayment(
        mortgageBalance,
        inputs.rentBuyLater.buy.mortgageRateAnnual,
        inputs.rentBuyLater.buy.termYears
      );

      const mortgagePaymentActual = mortgageBalance > 0 ? monthlyPayment : 0;
      housingOutflow = ownerHousingCost(
        homeValue,
        inputs.rentBuyLater.buy,
        mortgagePaymentActual
      );
      plannedContribution = inputs.rentBuyLater.investmentsPost.monthlyContribution;
    } else {
      const mortgagePaymentActual = mortgageBalance > 0 ? monthlyPayment : 0;
      housingOutflow = ownerHousingCost(
        homeValue,
        inputs.rentBuyLater.buy,
        mortgagePaymentActual
      );
      plannedContribution = inputs.rentBuyLater.investmentsPost.monthlyContribution;
    }

    const cashFlow = applyCashFlow({
      income: inputs.monthlyIncome,
      housingOutflow,
      plannedContribution,
      livingExpenses: inputs.monthlyLivingExpenses,
    });

    const contributions = cashFlow.contributions;
    const expenseReserve = cashFlow.expenseReserve;

    investments = investments * (1 + weightedRate) + contributions;

    if (homeValue > 0) {
      const mortgagePaymentActual = mortgageBalance > 0 ? monthlyPayment : 0;
      const amortized = amortizeOneMonth(
        mortgageBalance,
        inputs.rentBuyLater.buy.mortgageRateAnnual,
        mortgagePaymentActual
      );
      mortgageBalance = amortized.balance;
      interestPaid = amortized.interest;
      principalPaid = amortized.principal;
      cumulativeInterestPaid += interestPaid;
      cumulativePrincipalPaid += principalPaid;
      homeValue = grow(homeValue, inputs.rentBuyLater.buy.homeGrowthRate);
    }

    const equity = Math.max(0, homeValue - mortgageBalance);
    const netWorth = investments + equity;

    timeline.push({
      monthIndex: m,
      investments,
      homeValue,
      mortgageBalance,
      equity,
      netWorth,
      housingOutflow,
      contributions,
      expenseReserve,
      interestPaid,
      principalPaid,
      cumulativeInterestPaid,
      cumulativePrincipalPaid,
    });

    if (m < buyAfterMonths) {
      rent =
        rent *
        (1 + monthlyRateFromAnnual(inputs.rentBuyLater.rent.rentInflationRate));
    }
  }

  return finalizeTimeline(timeline);
}

export function simulateAll(inputs: ScenarioInputs): SimAllResult {
  return {
    buyNow: simulateBuyNow(inputs),
    rentInvest: simulateRentInvest(inputs),
    rentBuyLater: simulateRentBuyLater(inputs),
  };
}
