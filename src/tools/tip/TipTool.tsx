import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, SelectField, Stat, Toggle } from '@/components/ui';
import { HeroResult } from '@/components/TextIO';
import { CURRENCIES, formatMoney, tipSplit } from '@/lib/finance';
import { useLocalStorage } from '@/hooks';

export default function TipTool(): React.ReactElement {
  const [bill, setBill] = useLocalStorage('tip:bill', 86.4);
  const [percent, setPercent] = useLocalStorage('tip:percent', 15);
  const [people, setPeople] = useLocalStorage('tip:people', 2);
  const [roundUp, setRoundUp] = useLocalStorage('tip:round', false);
  const [currency, setCurrency] = useLocalStorage('tip:currency', 'USD');

  const r = tipSplit(Math.max(0, bill), Math.max(0, percent), Math.max(1, people), roundUp);
  const money = (n: number): string => formatMoney(n, currency);

  return (
    <ToolShell slug="tip-calculator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="Bill">
          <div className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <NumberField label="Bill amount" value={bill} onChange={setBill} min={0} step={0.01} />
              <SelectField label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <div>
              <NumberField label="Tip (%)" value={percent} onChange={setPercent} min={0} max={100} step={0.5} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[0, 10, 12.5, 15, 18, 20, 25].map((p) => (
                  <button key={p} type="button" className="chip hover:opacity-80" aria-pressed={percent === p} onClick={() => setPercent(p)}>
                    {p}%
                  </button>
                ))}
              </div>
            </div>
            <NumberField label="Split between" value={people} onChange={setPeople} min={1} max={100} />
            <Toggle checked={roundUp} onChange={setRoundUp} label="Round each share up to a whole unit" />
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <HeroResult label={people > 1 ? `Each of ${people} pays` : 'Total to pay'} value={money(r.perPerson)} copy={r.perPerson.toFixed(2)} sub={`${money(r.tipPerPerson)} of that is tip`} />
          <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
            <Stat label="Bill" value={money(bill)} />
            <Stat label="Tip" value={money(r.tip)} />
            <Stat label="Total" value={money(r.total)} />
            <Stat label="Effective tip" value={`${bill > 0 ? ((r.tip / bill) * 100).toFixed(1) : '0'}%`} />
          </div>
          <Panel title="Quick reference">
            <table className="w-full text-sm">
              <thead>
                <tr className="muted text-left text-xs uppercase">
                  <th scope="col" className="px-4 py-2 font-semibold">Tip</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Amount</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Total</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Per person</th>
                </tr>
              </thead>
              <tbody>
                {[10, 12.5, 15, 18, 20, 22, 25].map((p) => {
                  const row = tipSplit(Math.max(0, bill), p, Math.max(1, people), roundUp);
                  return (
                    <tr key={p} className={`border-t font-mono ${p === percent ? 'font-semibold' : ''}`}>
                      <td className="px-4 py-1.5">{p}%</td>
                      <td className="px-2 py-1.5">{money(row.tip)}</td>
                      <td className="px-2 py-1.5">{money(row.total)}</td>
                      <td className="px-2 py-1.5">{money(row.perPerson)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
