import { ScenarioInputs } from "./types";

const defaultBuy = {
  purchasePrice: 650000,
  downPaymentAmount: 130000,
  downPaymentPercent: 20,
  mortgageRateAnnual: 6.5,
  termYears: 30,
  propertyTaxRate: 1.0,
  insuranceAnnual: 1400,
  maintenanceRate: 1.0,
  hoaMonthly: 0,
  homeGrowthRate: 3.5,
} satisfies import("./types").BuyInputs;

const defaultRent = {
  monthlyRent: 2600,
  rentInflationRate: 3.0,
  rentersInsuranceMonthly: 15,
} satisfies import("./types").RentInputs;

export const defaultInputs: ScenarioInputs = {
  horizonYears: 5,
  monthlyIncome: 6500,
  monthlyLivingExpenses: 1800,
  scenarioFocus: "rentInvest",
  investmentAssets: [
    { id: "us-stocks", name: "US Stocks", cagr: 7.0, weight: 70 },
    { id: "bonds", name: "Bonds", cagr: 3.0, weight: 25 },
    { id: "cash", name: "Cash-like", cagr: 1.0, weight: 5 },
  ],
  rentInvest: {
    rent: { ...defaultRent },
    investments: {
      monthlyContribution: 800,
      lumpSum: 0,
    },
  },
  buyNow: {
    buy: { ...defaultBuy },
    investments: {
      monthlyContribution: 400,
      lumpSum: 0,
    },
  },
  rentBuyLater: {
    rent: { ...defaultRent },
    buy: { ...defaultBuy },
    investmentsPre: {
      monthlyContribution: 600,
      lumpSum: 0,
    },
    investmentsPost: {
      monthlyContribution: 300,
      lumpSum: 0,
    },
    buyLater: {
      buyAfterYears: 3,
    },
  },
};
