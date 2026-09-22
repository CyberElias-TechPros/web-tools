import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { CopyButton, Panel, Segmented } from '@/components/ui';
import { TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { CASES, convertCase, detectCase } from '@/lib/textcase';
import type { CaseId } from '@/lib/textcase';

const SAMPLE = 'the quick brown fox jumps over the lazy dog\nuser_profile_settings\nBackgroundColorValue';

export default function CaseTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<CaseId>('title');

  const detected = useMemo(() => (input.trim() ? detectCase(input) : null), [input]);
  const output = useMemo(() => convertCase(input, target), [input, target]);
  const all = useMemo(() => CASES.map((c) => ({ ...c, value: input.trim() ? convertCase(input.split('\n')[0] ?? '', c.id) : c.example })), [input]);

  return (
    <ToolShell slug="case-converter">
      <Workspace>
        <TextInput value={input} onChange={setInput} label="Text" sample={SAMPLE} rows={10} fill autoFocus footer={detected ? <span>Detected: <strong>{CASES.find((c) => c.id === detected)?.label}</strong></span> : undefined} />
        <div className="flex flex-col gap-3">
          <Segmented label="Convert to" value={target} onChange={setTarget} options={CASES.map((c) => ({ value: c.id, label: c.label }))} size="sm" />
          <TextOutput value={output} label={CASES.find((c) => c.id === target)?.label ?? 'Output'} filename="converted.txt" rows={10} fill />
        </div>
      </Workspace>
      <Panel title="Every case at once" description="First line of your text in each style — click to copy." className="mt-4">
        <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
          {all.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="muted block text-xs">{c.label}</span>
                <span className="block truncate font-mono">{c.value}</span>
              </span>
              <CopyButton value={c.value} small label="" className="!px-1.5" />
            </li>
          ))}
        </ul>
      </Panel>
    </ToolShell>
  );
}
