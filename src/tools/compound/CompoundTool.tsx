import { useMemo } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, Segmented, SelectField, Stat } from '@/components/ui';
import { DataTable, HeroResult } from '@/components/TextIO';
import { CURRENCIES, compoundInterest, formatMoney, ruleOf72 } from '@/lib/finance';
import { useLocalStorage } from '@/hooks';

export default function CompoundTool(): React.ReactElement {
  const [principal, setPrincipal] = useLocalStorage('ci:principal', 10000);
  const [rate, setRate] = useLocalStorage('ci:rate', 7);
  const [years, setYears] = useLocalStorage('ci:years', 20);
  const [monthly, setMonthly] = useLocalStorage('ci:monthly', 200);
  const [freq, setFreq] = useLocalStorage('ci:freq', 12);
  const [timing, setTiming] = useLocalStorage<'start' | 'end'>('ci:timing', 'end');
  const [currency, setCurrency] = useLocalStorage('ci:currency', 'USD');

  const result = useMemo(() => compoundInterest({ principal: Math.max(0, principal), annualRate: Math.max(0, rate), years: Math.max(1, Math.floor(years)), compoundsPerYear: freq, monthlyContribution: Math.max(0, monthly), contributionTiming: timing }), [principal, rate, years, monthly, freq, timing]);
  const money = (n: number): string => formatMoney(n, currency);
  const max = Math.max(...result.yearly.map((y) => y.balance), 1);
  const doubling = ruleOf72(rate);

  return (
    <ToolShell slug="compound-interest">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="Inputs">
          <div className="flex flex-col gap-3 p-4">
            <SelectField label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <NumberField label="Starting amount" value={principal} onChange={setPrincipal} min={0} step={500} />
            <NumberField label="Monthly contribution" value={monthly} onChange={setMonthly} min={0} step={50} />
            <Segmented label="Contribute at" value={timing} onChange={setTiming} options={[{ value: 'start', label: 'Start of month' }, { value: 'end', label: 'End of month' }]} size="sm" />
            <NumberField label="Annual return (%)" value={rate} onChange={setRate} min={0} max={100} step={0.1} />
            <SelectField label="Compounding" value={String(freq)} onChange={(v) => setFreq(Number(v))} options={[{ value: '1', label: 'Yearly' }, { value: '2', label: 'Half-yearly' }, { value: '4', label: 'Quarterly' }, { value: '12', label: 'Monthly' }, { value: '52', label: 'Weekly' }, { value: '365', label: 'Daily' }]} />
            <NumberField label="Years" value={years} onChange={setYears} min={1} max={80} />
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <HeroResult label={`Balance after ${Math.max(1, Math.floor(years))} years`} value={money(result.finalBalance)} copy={result.finalBalance.toFixed(2)} sub={`${money(result.totalContributions)} contributed · ${money(result.totalInterest)} earned`} />
          <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
            <Stat label="Contributions" value={money(result.totalContributions)} />
            <Stat label="Interest earned" value={money(result.totalInterest)} tone="good" />
            <Stat label="Growth multiple" value={`${result.totalContributions > 0 ? (result.finalBalance / result.totalContributions).toFixed(2) : '—'}×`} />
            <Stat label="Doubles every" value={Number.isFinite(doubling) ? `~${doubling.toFixed(1)} years` : '—'} title="Rule of 72" />
          </div>
          <Panel title="Growth">
            <div className="p-4">
              <div className="flex h-32 items-end gap-px" role="img" aria-label="Bar chart of balance by year, split into contributions and interest">
                {result.yearly.map((y) => (
                  <div key={y.year} className="flex flex-1 flex-col justify-end" style={{ height: '100%' }} title={`Year ${y.year}: ${money(y.balance)}`}>
                    <div style={{ height: `${((y.balance - y.contributions) / max) * 100}%`, background: 'var(--accent)' }} />
                    <div style={{ height: `${(y.contributions / max) * 100}%`, background: 'var(--accent-2)', opacity: 0.8 }} />
                  </div>
                ))}
              </div>
              <p className="muted mt-2 text-xs"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--accent-2)' }} /> contributions · <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--accent)' }} /> interest</p>
            </div>
          </Panel>
          <Panel title="Year by year">
            <DataTable headers={['Year', 'Contributed', 'Interest', 'Balance']} rows={result.yearly.map((y) => [String(y.year), money(y.contributions), money(y.interest), money(y.balance)])} maxHeight="20rem" />
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
