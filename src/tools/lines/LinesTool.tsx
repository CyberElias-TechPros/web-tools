import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, SelectField, Stat, TextField, Toggle } from '@/components/ui';
import { TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { defaultLineOptions, processLines } from '@/lib/lines';
import type { LineOptions } from '@/lib/lines';
import { useLocalStorage } from '@/hooks';

const SAMPLE = `banana
apple
  cherry
apple
Banana
10 pears
2 figs

date
elderberry`;

export default function LinesTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [opts, setOpts] = useLocalStorage<LineOptions>('lines:opts', defaultLineOptions);
  const set = <K extends keyof LineOptions>(key: K, value: LineOptions[K]): void => setOpts((o) => ({ ...o, [key]: value }));

  const result = useMemo(() => processLines(input, opts), [input, opts]);

  return (
    <ToolShell slug="line-tools">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <Panel title="Operations" description="Applied top to bottom.">
          <div className="flex flex-col gap-3 p-4">
            <Toggle checked={opts.trim} onChange={(v) => set('trim', v)} label="Trim whitespace" />
            <Toggle checked={opts.removeEmpty} onChange={(v) => set('removeEmpty', v)} label="Remove empty lines" />
            <Toggle checked={opts.dedupe} onChange={(v) => set('dedupe', v)} label="Remove duplicates" />
            {opts.dedupe && <Toggle checked={opts.dedupeCaseInsensitive} onChange={(v) => set('dedupeCaseInsensitive', v)} label="…ignoring case" className="ml-6" />}
            <SelectField
              label="Sort"
              value={opts.sort}
              onChange={(v) => set('sort', v)}
              options={[
                { value: 'none', label: 'Keep order' },
                { value: 'alpha', label: 'A → Z (case-sensitive)' },
                { value: 'alpha-ci', label: 'A → Z (ignore case)' },
                { value: 'natural', label: 'Natural (file2 before file10)' },
                { value: 'numeric', label: 'By first number' },
                { value: 'length', label: 'By length' },
                { value: 'random', label: 'Shuffle' },
              ]}
            />
            {opts.sort !== 'none' && opts.sort !== 'random' && <Toggle checked={opts.descending} onChange={(v) => set('descending', v)} label="Descending" className="ml-6" />}
            <Toggle checked={opts.reverse} onChange={(v) => set('reverse', v)} label="Reverse order (after sort)" />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Prefix" value={opts.prefix} onChange={(v) => set('prefix', v)} mono placeholder="- " />
              <TextField label="Suffix" value={opts.suffix} onChange={(v) => set('suffix', v)} mono placeholder="," />
            </div>
            <SelectField label="Numbering" value={opts.numbering} onChange={(v) => set('numbering', v)} options={[{ value: 'none', label: 'None' }, { value: 'plain', label: '1 line' }, { value: 'dot', label: '1. line' }, { value: 'paren', label: '1) line' }, { value: 'padded', label: '001 line' }]} />
            <TextField label="Keep lines containing" value={opts.filterInclude} onChange={(v) => set('filterInclude', v)} mono />
            <TextField label="Drop lines containing" value={opts.filterExclude} onChange={(v) => set('filterExclude', v)} mono />
            <Toggle checked={opts.filterRegex} onChange={(v) => set('filterRegex', v)} label="Filters are regular expressions" />
            <button type="button" className="btn btn-sm self-start" onClick={() => setOpts(defaultLineOptions)}>
              Reset options
            </button>
          </div>
        </Panel>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Lines in" value={result.inputLines} />
            <Stat label="Lines out" value={result.outputLines} />
            <Stat label="Duplicates removed" value={result.removedDuplicates} />
          </div>
          {result.error && <Callout tone="error">{result.error}</Callout>}
          <Workspace>
            <TextInput value={input} onChange={setInput} label="Input lines" sample={SAMPLE} accept=".txt,.csv,.log,text/*" rows={18} fill autoFocus />
            <TextOutput value={result.text} label="Result" filename="lines.txt" rows={18} fill />
          </Workspace>
        </div>
      </div>
    </ToolShell>
  );
}
