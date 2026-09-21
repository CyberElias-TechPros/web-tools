import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, Segmented, Toggle } from '@/components/ui';
import { DataTable, OptionsBar, TextOutput } from '@/components/TextIO';
import { fakePeople } from '@/lib/lorem';
import type { FakePerson } from '@/lib/lorem';
import { jsonToCsv } from '@/lib/csv';
import { useLocalStorage } from '@/hooks';

type Format = 'json' | 'csv' | 'sql' | 'ts';

const FIELDS: Array<{ id: keyof FakePerson | 'street' | 'city' | 'postcode' | 'country'; label: string }> = [
  { id: 'id', label: 'id' },
  { id: 'firstName', label: 'firstName' },
  { id: 'lastName', label: 'lastName' },
  { id: 'fullName', label: 'fullName' },
  { id: 'email', label: 'email' },
  { id: 'phone', label: 'phone' },
  { id: 'company', label: 'company' },
  { id: 'jobTitle', label: 'jobTitle' },
  { id: 'street', label: 'street' },
  { id: 'city', label: 'city' },
  { id: 'postcode', label: 'postcode' },
  { id: 'country', label: 'country' },
  { id: 'birthDate', label: 'birthDate' },
];

const randomSeed = (): number => Math.floor(Math.random() * 100_000);

function flatten(p: FakePerson, fields: string[]): Record<string, string> {
  const flat: Record<string, string> = { ...(p as unknown as Record<string, string>), street: p.address.street, city: p.address.city, postcode: p.address.postcode, country: p.address.country };
  return Object.fromEntries(fields.map((f) => [f, flat[f] ?? '']));
}

export default function MockDataTool(): React.ReactElement {
  const [count, setCount] = useLocalStorage('mock:count', 10);
  const [format, setFormat] = useLocalStorage<Format>('mock:format', 'json');
  const [fields, setFields] = useLocalStorage<string[]>('mock:fields', ['id', 'fullName', 'email', 'phone', 'company', 'jobTitle', 'city', 'country', 'birthDate']);
  const [seed, setSeed] = useState<number>(randomSeed);

  const rows = useMemo(() => fakePeople(Math.min(1000, Math.max(1, count)), seed).map((p) => flatten(p, fields)), [count, seed, fields]);

  const output = useMemo(() => {
    if (!rows.length || !fields.length) return '';
    switch (format) {
      case 'json':
        return JSON.stringify(rows, null, 2);
      case 'csv':
        return jsonToCsv(rows);
      case 'sql': {
        const cols = fields.map((f) => `"${f.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}"`).join(', ');
        const values = rows.map((r) => `  (${fields.map((f) => `'${String(r[f] ?? '').replace(/'/g, "''")}'`).join(', ')})`).join(',\n');
        return `INSERT INTO people (${cols}) VALUES\n${values};`;
      }
      case 'ts':
        return `export const people = ${JSON.stringify(rows, null, 2)} as const;`;
    }
  }, [rows, format, fields]);

  const toggle = (id: string): void => setFields((f) => (f.includes(id) ? f.filter((x) => x !== id) : FIELDS.map((x) => x.id).filter((x) => x === id || f.includes(x))));

  return (
    <ToolShell slug="mock-data">
      <OptionsBar>
        <NumberField label="Rows" value={count} onChange={setCount} min={1} max={1000} className="w-28" />
        <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }, { value: 'sql', label: 'SQL' }, { value: 'ts', label: 'TypeScript' }]} size="sm" />
        <button type="button" className="btn btn-sm" onClick={() => setSeed(randomSeed())}>
          Regenerate
        </button>
        <span className="muted font-mono text-xs">seed {seed}</span>
      </OptionsBar>
      <Panel title="Fields" className="mb-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2 p-4">
          {FIELDS.map((f) => (
            <Toggle key={f.id} checked={fields.includes(f.id)} onChange={() => toggle(f.id)} label={f.label} />
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Preview (${rows.length} rows)`}>
          <DataTable headers={fields} rows={rows.slice(0, 50).map((r) => fields.map((f) => r[f] ?? ''))} maxHeight="28rem" />
        </Panel>
        <TextOutput value={output} label={format.toUpperCase()} filename={`people.${format === 'ts' ? 'ts' : format}`} mime={format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain'} rows={22} fill />
      </div>
      <p className="muted mt-3 text-xs">Deterministic per seed — share the seed to reproduce the same dataset. Names, emails and addresses are invented; any resemblance to real people is coincidental.</p>
    </ToolShell>
  );
}
