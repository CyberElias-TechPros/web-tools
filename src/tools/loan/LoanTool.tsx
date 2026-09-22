import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, SelectField, Stat } from '@/components/ui';
import { DataTable, HeroResult } from '@/components/TextIO';
import { CURRENCIES, amortize, formatMoney } from '@/lib/finance';
import { useLocalStorage } from '@/hooks';

export default function LoanTool(): React.ReactElement {
  const [principal, setPrincipal] = useLocalStorage('loan:principal', 250000);
  const [rate, setRate] = useLocalStorage('loan:rate', 6.5);
  const [years, setYears] = useLocalStorage('loan:years', 30);
  const [extra, setExtra] = useLocalStorage('loan:extra', 0);
  const [currency, setCurrency] = useLocalStorage('loan:currency', 'USD');
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly');

  const result = useMemo(() => amortize({ principal: Math.max(0, principal), annualRate: Math.max(0, rate), years: Math.max(0.1, years), extraMonthly: Math.max(0, extra) }), [principal, rate, years, extra]);
  const money = (n: number): string => formatMoney(n, currency);
  const interestShare = result.totalPaid > 0 ? (result.totalInterest / result.totalPaid) * 100 : 0;

  return (
    <ToolShell slug="loan-calculator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="Loan">
          <div className="flex flex-col gap-3 p-4">
            <SelectField label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <NumberField label="Amount borrowed" value={principal} onChange={setPrincipal} min={0} step={1000} />
            <NumberField label="Annual interest rate (%)" value={rate} onChange={setRate} min={0} max={100} step={0.05} />
            <NumberField label="Term (years)" value={years} onChange={setYears} min={0.5} max={50} step={0.5} />
            <NumberField label="Extra payment per month" value={extra} onChange={setExtra} min={0} step={50} />
            <div className="flex flex-wrap gap-1.5">
              {[
                ['Mortgage', 250000, 6.5, 30],
                ['Car', 28000, 7.9, 5],
                ['Personal', 10000, 11.5, 3],
                ['Student', 45000, 5.5, 10],
              ].map(([label, p, r, y]) => (
                <button key={String(label)} type="button" className="chip hover:opacity-80" onClick={() => { setPrincipal(Number(p)); setRate(Number(r)); setYears(Number(y)); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <HeroResult label="Monthly payment" value={money(result.monthlyPayment + Math.max(0, extra))} copy={(result.monthlyPayment + Math.max(0, extra)).toFixed(2)} sub={extra > 0 ? `${money(result.monthlyPayment)} required + ${money(extra)} extra` : `${result.months} payments`} />
          <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
            <Stat label="Total paid" value={money(result.totalPaid)} />
            <Stat label="Total interest" value={money(result.totalInterest)} tone="bad" />
            <Stat label="Interest share" value={`${interestShare.toFixed(1)}%`} />
            <Stat label="Paid off" value={result.payoffDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} />
          </div>
          {extra > 0 && (
            <div className="card grid grid-cols-2 gap-3 px-4 py-3">
              <Stat label="Interest saved by extra payments" value={money(result.interestSavedByExtra)} tone="good" />
              <Stat label="Time saved" value={`${Math.floor(result.monthsSavedByExtra / 12)}y ${result.monthsSavedByExtra % 12}m`} tone="good" />
            </div>
          )}
          <Panel title="Principal vs interest over time">
            <div className="p-4">
              <div className="flex h-24 items-end gap-px" role="img" aria-label="Bar chart of yearly principal and interest">
                {result.yearly.map((y) => {
                  const total = y.principal + y.interest;
                  const max = Math.max(...result.yearly.map((r) => r.principal + r.interest));
                  return (
                    <div key={y.year} className="flex flex-1 flex-col justify-end" style={{ height: '100%' }} title={`Year ${y.year}: ${money(y.principal)} principal, ${money(y.interest)} interest`}>
                      <div style={{ height: `${(y.interest / max) * 100}%`, background: 'var(--danger)', opacity: 0.7 }} />
                      <div style={{ height: `${(y.principal / max) * 100}%`, background: 'var(--accent)' }} />
                      <span className="sr-only">{`Year ${y.year}: ${money(total)}`}</span>
                    </div>
                  );
                })}
              </div>
              <p className="muted mt-2 text-xs"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--accent)' }} /> principal · <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--danger)', opacity: 0.7 }} /> interest, per year</p>
            </div>
          </Panel>
          <Panel
            title="Amortisation schedule"
            actions={
              <SelectField label="View" value={view} onChange={(v) => setView(v)} options={[{ value: 'yearly', label: 'By year' }, { value: 'monthly', label: 'By month' }]} className="w-32" />
            }
          >
            {view === 'yearly' ? (
              <DataTable headers={['Year', 'Principal', 'Interest', 'Balance']} rows={result.yearly.map((y) => [String(y.year), money(y.principal), money(y.interest), money(y.balance)])} maxHeight="20rem" />
            ) : (
              <DataTable headers={['Month', 'Payment', 'Principal', 'Interest', 'Balance']} rows={result.schedule.map((r) => [String(r.month), money(r.payment), money(r.principal), money(r.interest), money(r.balance)])} maxHeight="20rem" />
            )}
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
