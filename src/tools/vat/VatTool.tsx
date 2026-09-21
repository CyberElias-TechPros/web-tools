import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, Segmented, SelectField, Stat } from '@/components/ui';
import { HeroResult } from '@/components/TextIO';
import { CURRENCIES, formatMoney, vat } from '@/lib/finance';
import { useLocalStorage } from '@/hooks';

const RATES: Array<{ label: string; rate: number }> = [
  { label: 'UK 20%', rate: 20 },
  { label: 'Germany 19%', rate: 19 },
  { label: 'France 20%', rate: 20 },
  { label: 'Ireland 23%', rate: 23 },
  { label: 'Nigeria 7.5%', rate: 7.5 },
  { label: 'Kenya 16%', rate: 16 },
  { label: 'South Africa 15%', rate: 15 },
  { label: 'India GST 18%', rate: 18 },
  { label: 'Australia GST 10%', rate: 10 },
  { label: 'Canada GST 5%', rate: 5 },
  { label: 'UAE 5%', rate: 5 },
  { label: 'Japan 10%', rate: 10 },
];

export default function VatTool(): React.ReactElement {
  const [amount, setAmount] = useLocalStorage('vat:amount', 120);
  const [rate, setRate] = useLocalStorage('vat:rate', 20);
  const [mode, setMode] = useLocalStorage<'add' | 'remove'>('vat:mode', 'add');
  const [currency, setCurrency] = useLocalStorage('vat:currency', 'GBP');

  const r = vat(Math.max(0, amount), Math.max(0, rate), mode === 'remove');
  const money = (n: number): string => formatMoney(n, currency);

  return (
    <ToolShell slug="vat-calculator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="Amount">
          <div className="flex flex-col gap-3 p-4">
            <Segmented label="Direction" value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add tax to net' }, { value: 'remove', label: 'Extract tax from gross' }]} size="sm" />
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <NumberField label={mode === 'add' ? 'Net amount (before tax)' : 'Gross amount (tax included)'} value={amount} onChange={setAmount} min={0} step={0.01} />
              <SelectField label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <NumberField label="Rate (%)" value={rate} onChange={setRate} min={0} max={100} step={0.5} />
            <div className="flex flex-wrap gap-1.5">
              {RATES.map((p) => (
                <button key={p.label} type="button" className="chip hover:opacity-80" onClick={() => setRate(p.rate)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <HeroResult label={mode === 'add' ? 'Gross (including tax)' : 'Net (excluding tax)'} value={money(mode === 'add' ? r.gross : r.net)} copy={(mode === 'add' ? r.gross : r.net).toFixed(2)} sub={`Tax at ${rate}%: ${money(r.tax)}`} />
          <div className="card grid grid-cols-3 gap-3 px-4 py-3">
            <Stat label="Net" value={money(r.net)} />
            <Stat label="Tax" value={money(r.tax)} />
            <Stat label="Gross" value={money(r.gross)} />
          </div>
          <Panel title="Formula">
            <div className="p-4 font-mono text-sm">
              {mode === 'add' ? (
                <>
                  <div>tax = net × {rate}% = {money(r.tax)}</div>
                  <div>gross = net + tax = {money(r.gross)}</div>
                </>
              ) : (
                <>
                  <div>net = gross ÷ (1 + {rate}/100) = {money(r.net)}</div>
                  <div>tax = gross − net = {money(r.tax)}</div>
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
