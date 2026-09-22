/**
 * Money maths: amortised loans, compound interest, savings goals, tips,
 * percentages, VAT and currency-agnostic formatting.
 */

export interface LoanInput {
  principal: number;
  annualRate: number; // percent
  years: number;
  extraMonthly?: number;
}

export interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  cumulativeInterest: number;
}

export interface LoanResult {
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  months: number;
  payoffDate: Date;
  schedule: AmortizationRow[];
  yearly: Array<{ year: number; principal: number; interest: number; balance: number }>;
  interestSavedByExtra: number;
  monthsSavedByExtra: number;
}

export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

export function amortize(input: LoanInput, start = new Date()): LoanResult {
  const months = Math.round(input.years * 12);
  const base = monthlyPayment(input.principal, input.annualRate, months);
  const r = input.annualRate / 100 / 12;
  const extra = Math.max(0, input.extraMonthly ?? 0);
  const schedule: AmortizationRow[] = [];
  let balance = input.principal;
  let cumulativeInterest = 0;
  let month = 0;
  while (balance > 0.005 && month < 1200) {
    month++;
    const interest = balance * r;
    let principalPart = base + extra - interest;
    if (principalPart > balance) principalPart = balance;
    balance -= principalPart;
    cumulativeInterest += interest;
    schedule.push({ month, payment: principalPart + interest, principal: principalPart, interest, balance: Math.max(0, balance), cumulativeInterest });
  }
  const totalInterest = cumulativeInterest;
  const totalPaid = input.principal + totalInterest;
  const baseInterest = base * months - input.principal;
  const yearly: LoanResult['yearly'] = [];
  for (let y = 0; y < Math.ceil(schedule.length / 12); y++) {
    const rows = schedule.slice(y * 12, y * 12 + 12);
    yearly.push({
      year: y + 1,
      principal: rows.reduce((s, x) => s + x.principal, 0),
      interest: rows.reduce((s, x) => s + x.interest, 0),
      balance: rows[rows.length - 1]?.balance ?? 0,
    });
  }
  const payoff = new Date(start.getTime());
  payoff.setMonth(payoff.getMonth() + schedule.length);
  return {
    monthlyPayment: base,
    totalPaid,
    totalInterest,
    months: schedule.length,
    payoffDate: payoff,
    schedule,
    yearly,
    interestSavedByExtra: extra > 0 ? Math.max(0, baseInterest - totalInterest) : 0,
    monthsSavedByExtra: extra > 0 ? Math.max(0, months - schedule.length) : 0,
  };
}

export interface CompoundInput {
  principal: number;
  annualRate: number;
  years: number;
  compoundsPerYear: number;
  monthlyContribution: number;
  contributionTiming?: 'start' | 'end';
}

export interface CompoundResult {
  finalBalance: number;
  totalContributions: number;
  totalInterest: number;
  yearly: Array<{ year: number; balance: number; contributions: number; interest: number }>;
}

export function compoundInterest(input: CompoundInput): CompoundResult {
  const n = Math.max(1, input.compoundsPerYear);
  const rate = input.annualRate / 100;
  let balance = input.principal;
  let contributions = input.principal;
  const yearly: CompoundResult['yearly'] = [];
  const periodsPerYear = 12; // contributions monthly; interest applied per compounding period
  const totalMonths = Math.round(input.years * 12);
  for (let m = 1; m <= totalMonths; m++) {
    if (input.contributionTiming === 'start') {
      balance += input.monthlyContribution;
      contributions += input.monthlyContribution;
    }
    // Apply the monthly-equivalent growth of n compounds per year.
    balance *= (1 + rate / n) ** (n / periodsPerYear);
    if (input.contributionTiming !== 'start') {
      balance += input.monthlyContribution;
      contributions += input.monthlyContribution;
    }
    if (m % 12 === 0 || m === totalMonths) {
      yearly.push({ year: Math.ceil(m / 12), balance, contributions, interest: balance - contributions });
    }
  }
  return { finalBalance: balance, totalContributions: contributions, totalInterest: balance - contributions, yearly };
}

export function savingsGoal(target: number, current: number, annualRate: number, months: number): number {
  const r = annualRate / 100 / 12;
  const future = current * (1 + r) ** months;
  const need = target - future;
  if (need <= 0) return 0;
  if (r === 0) return need / months;
  return (need * r) / ((1 + r) ** months - 1);
}

export function tipSplit(bill: number, tipPercent: number, people: number, roundUp = false): { tip: number; total: number; perPerson: number; tipPerPerson: number } {
  const tip = bill * (tipPercent / 100);
  let total = bill + tip;
  const n = Math.max(1, Math.floor(people));
  let perPerson = total / n;
  if (roundUp) {
    perPerson = Math.ceil(perPerson);
    total = perPerson * n;
  }
  return { tip: total - bill, total, perPerson, tipPerPerson: (total - bill) / n };
}

export function percentageChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : Infinity;
  return ((to - from) / Math.abs(from)) * 100;
}

export function formatMoney(n: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD', 'INR', 'JPY', 'CNY', 'BRL', 'ZAR', 'KES', 'GHS', 'CHF', 'SEK', 'MXN', 'AED', 'SGD'];

export function vat(amount: number, ratePercent: number, inclusive: boolean): { net: number; tax: number; gross: number } {
  if (inclusive) {
    const net = amount / (1 + ratePercent / 100);
    return { net, tax: amount - net, gross: amount };
  }
  const tax = amount * (ratePercent / 100);
  return { net: amount, tax, gross: amount + tax };
}

export function ruleOf72(ratePercent: number): number {
  return ratePercent > 0 ? 72 / ratePercent : Infinity;
}
