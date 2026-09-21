import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, SelectField, TextField, Toggle } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { CODEGEN_TARGETS, generateTypes } from '@/lib/json-to-ts';
import type { CodegenTarget } from '@/lib/json-to-ts';
import { parseJson } from '@/lib/json';
import { useDebounced, useLocalStorage } from '@/hooks';

const SAMPLE = `{
  "id": "9b2f6c4e-1a3d-4f9e-8c1b-2d3e4f5a6b7c",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "createdAt": "2024-03-01T10:15:00Z",
  "age": 36,
  "score": 98.5,
  "isAdmin": true,
  "tags": ["math", "engines"],
  "address": { "street": "12 St James's Square", "city": "London", "postcode": "SW1Y 4JH", "geo": { "lat": 51.5, "lng": -0.13 } },
  "orders": [
    { "id": 1, "total": 19.99, "shipped": true, "note": null },
    { "id": 2, "total": 5, "shipped": false, "coupon": "SPRING" }
  ]
}`;

const EXT: Record<CodegenTarget, string> = { typescript: 'ts', 'typescript-type': 'ts', zod: 'ts', 'json-schema': 'json', python: 'py', go: 'go', kotlin: 'kt', swift: 'swift' };

export default function JsonTypesTool(): React.ReactElement {
  const [input, setInput] = useState(SAMPLE);
  const [target, setTarget] = useLocalStorage<CodegenTarget>('j2t:target', 'typescript');
  const [rootName, setRootName] = useLocalStorage('j2t:root', 'Root');
  const [readonly, setReadonly] = useLocalStorage('j2t:readonly', false);
  const [exportTypes, setExportTypes] = useLocalStorage('j2t:export', true);
  const [inferDates, setInferDates] = useLocalStorage('j2t:dates', true);
  const [optionalNulls, setOptionalNulls] = useLocalStorage('j2t:nulls', true);
  const debounced = useDebounced(input, 150);

  const result = useMemo(() => {
    if (!debounced.trim()) return { code: '', error: null as string | null };
    const parsed = parseJson(debounced);
    if (!parsed.ok) return { code: '', error: `${parsed.error.message} (line ${parsed.error.line}, column ${parsed.error.column})` };
    try {
      return { code: generateTypes(parsed.value, { target, rootName: rootName.trim() || 'Root', readonly, exportTypes, inferDates, optionalNulls }), error: null };
    } catch (e) {
      return { code: '', error: e instanceof Error ? e.message : String(e) };
    }
  }, [debounced, target, rootName, readonly, exportTypes, inferDates, optionalNulls]);

  return (
    <ToolShell slug="json-to-types">
      <OptionsBar>
        <SelectField label="Target" value={target} onChange={setTarget} options={CODEGEN_TARGETS.map((t) => ({ value: t.id, label: t.label }))} className="w-56" />
        <TextField label="Root type name" value={rootName} onChange={setRootName} mono className="w-44" />
        <Toggle checked={optionalNulls} onChange={setOptionalNulls} label="null → optional" hint="Treat null values as optional fields" />
        <Toggle checked={inferDates} onChange={setInferDates} label="Detect dates & formats" />
        {(target === 'typescript' || target === 'typescript-type') && <Toggle checked={readonly} onChange={setReadonly} label="readonly" />}
        {target !== 'json-schema' && <Toggle checked={exportTypes} onChange={setExportTypes} label="export" />}
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label="JSON sample" sample={SAMPLE} accept=".json,application/json" rows={22} invalid={Boolean(result.error)} fill />
        <div className="flex flex-col gap-3">
          {result.error && (
            <Callout tone="error" title="Invalid JSON">
              {result.error}
            </Callout>
          )}
          <TextOutput value={result.code} label={CODEGEN_TARGETS.find((t) => t.id === target)?.label ?? 'Output'} filename={`${(rootName || 'types').toLowerCase()}.${EXT[target]}`} rows={22} fill />
        </div>
      </Workspace>
    </ToolShell>
  );
}
