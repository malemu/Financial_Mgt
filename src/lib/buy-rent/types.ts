export type HorizonYears = 5 | 10 | 15 | 20;

export interface BuyInputs {
  purchasePrice: number;
  downPaymentAmount: number;
  downPaymentPercent: number;
  mortgageRateAnnual: number;
  termYears: 15 | 30;
  propertyTaxRate: number;
  insuranceAnnual: number;
  maintenanceRate: number;
  hoaMonthly: number;
  homeGrowthRate: number;
}

export interface RentInputs {
  monthlyRent: number;
  rentInflationRate: number;
  rentersInsuranceMonthly: number;
}

export interface InvestmentAsset {
  id: string;
  name: string;
  cagr: number;
  weight: number;
}

export interface InvestmentPlan {
  monthlyContribution: number;
  lumpSum: number;
}

export interface BuyLaterInputs {
  buyAfterYears: number;
}

export type ScenarioKey = "rentInvest" | "buyNow" | "rentBuyLater";

export interface ScenarioInputs {
  horizonYears: HorizonYears;
  monthlyIncome: number;
  monthlyLivingExpenses: number;
  scenarioFocus: ScenarioKey;
  investmentAssets: InvestmentAsset[];
  rentInvest: {
    rent: RentInputs;
    investments: InvestmentPlan;
  };
  buyNow: {
    buy: BuyInputs;
    investments: InvestmentPlan;
  };
  rentBuyLater: {
    rent: RentInputs;
    buy: BuyInputs;
    investmentsPre: InvestmentPlan;
    investmentsPost: InvestmentPlan;
    buyLater: BuyLaterInputs;
  };
}

export interface MonthResult {
  monthIndex: number;
  investments: number;
  homeValue: number;
  mortgageBalance: number;
  equity: number;
  netWorth: number;
  housingOutflow: number;
  contributions: number;
  expenseReserve: number;
  interestPaid: number;
  principalPaid: number;
  cumulativeInterestPaid: number;
  cumulativePrincipalPaid: number;
}

export interface ScenarioTotals {
  totalNetWorth: number;
  investments: number;
  homeValue: number;
  mortgageBalance: number;
  equity: number;
  totalHousingOutflow: number;
  totalContributions: number;
  expenseReserve: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
}

export interface ScenarioResult {
  timeline: MonthResult[];
  totals: ScenarioTotals;
}

export interface SimAllResult {
  rentInvest: ScenarioResult;
  buyNow: ScenarioResult;
  rentBuyLater: ScenarioResult;
}
