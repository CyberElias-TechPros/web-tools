import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { CopyButton, Panel, SelectField, TextField } from '@/components/ui';
import { HeroResult } from '@/components/TextIO';
import { COOKING_VOLUMES, INGREDIENT_DENSITIES, OVEN_TEMPERATURES, UNIT_CATEGORIES, convertUnit, cookingToGrams, formatQuantity, parseQuantity } from '@/lib/units';
import { useLocalStorage } from '@/hooks';

export default function UnitsTool(): React.ReactElement {
  const [categoryId, setCategoryId] = useLocalStorage('units:cat', 'length');
  const [fromId, setFromId] = useLocalStorage('units:from', 'm');
  const [toId, setToId] = useLocalStorage('units:to', 'ft');
  const [raw, setRaw] = useState('1');
  const [quick, setQuick] = useState('');

  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId) ?? UNIT_CATEGORIES[0]!;
  const from = category.units.find((u) => u.id === fromId) ?? category.units[0]!;
  const to = category.units.find((u) => u.id === toId) ?? category.units[1] ?? category.units[0]!;
  const value = parseFloat(raw.replace(/,/g, ''));
  const valid = Number.isFinite(value);
  const result = valid ? convertUnit(value, from, to) : NaN;

  const table = valid ? category.units.map((u) => ({ unit: u, value: convertUnit(value, from, u) })) : [];

  const quickParsed = useMemo(() => {
    if (!quick.trim()) return null;
    const q = parseQuantity(quick);
    if (!q) return { error: 'Try something like “12.5 kg”, “3 ft” or “100 mph”.' } as const;
    return { ...q, rows: q.category.units.filter((u) => u.id !== q.unit.id).map((u) => ({ unit: u, value: convertUnit(q.value, q.unit, u) })) } as const;
  }, [quick]);

  const pickCategory = (id: string): void => {
    const cat = UNIT_CATEGORIES.find((c) => c.id === id);
    if (!cat) return;
    setCategoryId(id);
    setFromId(cat.units[0]!.id);
    setToId((cat.units[1] ?? cat.units[0])!.id);
  };

  const [cookAmount, setCookAmount] = useState('1');
  const [cookVolume, setCookVolume] = useState('cup');
  const [ingredient, setIngredient] = useState('flour');
  const grams = cookingToGrams(parseFloat(cookAmount) || 0, cookVolume, ingredient);

  return (
    <ToolShell slug="unit-converter">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Convert">
            <div className="flex flex-col gap-3 p-4">
              <SelectField label="Category" value={category.id} onChange={pickCategory} options={UNIT_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
              <TextField label="Value" value={raw} onChange={setRaw} mono autoFocus invalid={!valid && raw.trim() !== ''} />
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <SelectField label="From" value={from.id} onChange={setFromId} options={category.units.map((u) => ({ value: u.id, label: `${u.label} (${u.symbol})` }))} />
                <button type="button" className="btn btn-sm mb-0.5" onClick={() => { setFromId(to.id); setToId(from.id); }} aria-label="Swap units">
                  ⇄
                </button>
                <SelectField label="To" value={to.id} onChange={setToId} options={category.units.map((u) => ({ value: u.id, label: `${u.label} (${u.symbol})` }))} />
              </div>
            </div>
          </Panel>
          <Panel title="Quick convert" description="Type a quantity with its unit.">
            <div className="flex flex-col gap-2 p-4">
              <TextField label="Quantity" value={quick} onChange={setQuick} mono placeholder="12.5 kg" invalid={Boolean(quickParsed && 'error' in quickParsed)} hint={quickParsed && 'error' in quickParsed ? quickParsed.error : undefined} />
              {quickParsed && !('error' in quickParsed) && (
                <ul className="max-h-48 divide-y overflow-auto text-sm">
                  {quickParsed.rows.map((r) => (
                    <li key={r.unit.id} className="flex justify-between gap-2 py-1.5">
                      <span className="muted">{r.unit.label}</span>
                      <span className="font-mono">{formatQuantity(r.value)} {r.unit.symbol}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <HeroResult label={`${valid ? formatQuantity(value) : '—'} ${from.symbol} in ${to.label}`} value={valid ? `${formatQuantity(result)} ${to.symbol}` : '—'} copy={valid ? formatQuantity(result) : undefined} sub={valid && result !== 0 && from.factor && to.factor && category.id !== 'temperature' ? `1 ${from.symbol} = ${formatQuantity(convertUnit(1, from, to))} ${to.symbol}` : undefined} />
          <Panel title={`All ${category.label.toLowerCase()} units`}>
            <ul className="grid gap-px sm:grid-cols-2">
              {table.map((r) => (
                <li key={r.unit.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="muted block text-xs">{r.unit.label}</span>
                    <span className="block truncate font-mono">{formatQuantity(r.value)} {r.unit.symbol}</span>
                  </span>
                  <CopyButton value={formatQuantity(r.value)} small label="" className="!px-1.5" />
                </li>
              ))}
            </ul>
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Kitchen: cups to grams">
              <div className="flex flex-col gap-2 p-4">
                <div className="grid grid-cols-[5rem_1fr] gap-2">
                  <TextField label="Amount" value={cookAmount} onChange={setCookAmount} mono />
                  <SelectField label="Measure" value={cookVolume} onChange={setCookVolume} options={COOKING_VOLUMES.map((v) => ({ value: v.id, label: v.label }))} />
                </div>
                <SelectField label="Ingredient" value={ingredient} onChange={setIngredient} options={INGREDIENT_DENSITIES.map((i) => ({ value: i.id, label: i.label }))} />
                <p className="font-mono text-lg">{grams !== null ? `${formatQuantity(grams, 4)} g` : '—'}</p>
              </div>
            </Panel>
            <Panel title="Oven temperatures">
              <table className="w-full text-sm">
                <thead>
                  <tr className="muted text-left text-xs uppercase">
                    <th scope="col" className="px-4 py-2 font-semibold">°C</th>
                    <th scope="col" className="px-2 py-2 font-semibold">°F</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Gas</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Heat</th>
                  </tr>
                </thead>
                <tbody>
                  {OVEN_TEMPERATURES.map((t) => (
                    <tr key={t.c} className="border-t font-mono">
                      <td className="px-4 py-1">{t.c}</td>
                      <td className="px-2 py-1">{t.f}</td>
                      <td className="px-2 py-1">{t.gas}</td>
                      <td className="px-2 py-1 font-sans">{t.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
