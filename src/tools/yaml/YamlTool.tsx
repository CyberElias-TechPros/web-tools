import { useMemo, useState } from 'react';
import YAML from 'yaml';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Segmented, Toggle } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { parseJson } from '@/lib/json';
import { useDebounced, useLocalStorage } from '@/hooks';

type Mode = 'yaml-to-json' | 'json-to-yaml';

const SAMPLE_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web, tier: frontend }
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          env:
            - name: LOG_LEVEL
              value: "info"
          resources:
            limits: { cpu: 500m, memory: 256Mi }
# anchors work too
defaults: &defaults
  retries: 3
job:
  <<: *defaults
  timeout: 30s
`;

const SAMPLE_JSON = `{"name":"web-tools","version":"2.0.0","private":true,"scripts":{"dev":"vite","build":"tsc -b && vite build"},"keywords":["tools","offline"],"engines":{"node":">=20"}}`;

export default function YamlTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('yaml-to-json');
  const [input, setInput] = useState('');
  const [indent, setIndent] = useLocalStorage<'2' | '4'>('yaml:indent', '2');
  const [sortKeys, setSortKeys] = useLocalStorage('yaml:sort', false);
  const [flow, setFlow] = useLocalStorage('yaml:flow', false);
  const debounced = useDebounced(input, 120);

  const result = useMemo(() => {
    if (!debounced.trim()) return { output: '', error: null as string | null, docs: 0 };
    const spaces = Number(indent);
    try {
      if (mode === 'yaml-to-json') {
        const docs = YAML.parseAllDocuments(debounced, { merge: true });
        const errors = docs.flatMap((d) => d.errors);
        if (errors.length) {
          const first = errors[0]!;
          const pos = first.linePos?.[0];
          return { output: '', error: `${first.message.split('\n')[0]}${pos ? ` (line ${pos.line}, column ${pos.col})` : ''}`, docs: 0 };
        }
        const values = docs.map((d) => d.toJS({ maxAliasCount: 1000 }) as unknown);
        const value = values.length === 1 ? values[0] : values;
        const replacer = sortKeys ? sortReplacer : undefined;
        return { output: JSON.stringify(value, replacer, spaces), error: null, docs: docs.length };
      }
      const parsed = parseJson(debounced);
      if (!parsed.ok) return { output: '', error: `${parsed.error.message} (line ${parsed.error.line}, column ${parsed.error.column})`, docs: 0 };
      return { output: YAML.stringify(parsed.value, { indent: spaces, sortMapEntries: sortKeys, collectionStyle: flow ? 'flow' : 'block', lineWidth: 0 }), error: null, docs: 1 };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : String(e), docs: 0 };
    }
  }, [debounced, mode, indent, sortKeys, flow]);

  return (
    <ToolShell slug="yaml-json">
      <OptionsBar>
        <Segmented label="Direction" value={mode} onChange={setMode} options={[{ value: 'yaml-to-json', label: 'YAML → JSON' }, { value: 'json-to-yaml', label: 'JSON → YAML' }]} />
        <Segmented size="sm" label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }]} />
        <Toggle checked={sortKeys} onChange={setSortKeys} label="Sort keys" />
        {mode === 'json-to-yaml' && <Toggle checked={flow} onChange={setFlow} label="Flow style" hint="{ a: 1 } instead of block indentation" />}
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label={mode === 'yaml-to-json' ? 'YAML' : 'JSON'} sample={mode === 'yaml-to-json' ? SAMPLE_YAML : SAMPLE_JSON} accept=".yaml,.yml,.json,text/yaml,application/json" rows={22} invalid={Boolean(result.error)} fill autoFocus />
        <div className="flex flex-col gap-3">
          {result.error && (
            <Callout tone="error" title={mode === 'yaml-to-json' ? 'YAML error' : 'JSON error'}>
              {result.error}
            </Callout>
          )}
          <TextOutput
            value={result.output}
            label={mode === 'yaml-to-json' ? 'JSON' : 'YAML'}
            filename={mode === 'yaml-to-json' ? 'converted.json' : 'converted.yaml'}
            mime={mode === 'yaml-to-json' ? 'application/json' : 'text/yaml'}
            rows={22}
            fill
            footer={result.docs > 1 ? <span>{result.docs} documents merged into an array</span> : undefined}
          />
        </div>
      </Workspace>
    </ToolShell>
  );
}

function sortReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
  }
  return value;
}
