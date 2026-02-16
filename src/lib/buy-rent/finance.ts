export function monthlyRateFromAnnual(annualPercent: number): number {
  return annualPercent / 100 / 12;
}

export function mortgagePayment(
  principal: number,
  annualRatePercent: number,
  termYears: number
): number {
  if (principal <= 0 || termYears <= 0) {
    return 0;
  }
  const r = monthlyRateFromAnnual(annualRatePercent);
  const n = termYears * 12;
  if (r === 0) {
    return principal / n;
  }
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function amortizeOneMonth(
  balance: number,
  annualRatePercent: number,
  payment: number
): { interest: number; principal: number; balance: number } {
  if (balance <= 0) {
    return { interest: 0, principal: 0, balance: 0 };
  }
  const r = monthlyRateFromAnnual(annualRatePercent);
  const interest = balance * r;
  const principal = Math.max(0, Math.min(payment - interest, balance));
  const newBalance = Math.max(0, balance - principal);
  return { interest, principal, balance: newBalance };
}

export function grow(value: number, annualRatePercent: number): number {
  if (value <= 0) {
    return value;
  }
  return value * (1 + monthlyRateFromAnnual(annualRatePercent));
}
