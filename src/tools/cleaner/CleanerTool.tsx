import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, SelectField, Stat, Toggle } from '@/components/ui';
import { TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { cleanText, defaultCleanOptions, findInvisibles } from '@/lib/unicode';
import type { CleanOptions } from '@/lib/unicode';
import { useLocalStorage } from '@/hooks';

const SAMPLE = `\uFEFFSmart “quotes” and ‘apostrophes’ — plus an en–dash, a zero\u200Bwidth space, a soft\u00ADhyphen and a non\u00A0breaking space.   \nTrailing spaces here    \n\n\n\nToo many blank lines above. Ellipsis… and full-width ｌｅｔｔｅｒｓ.`;

export default function CleanerTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [opts, setOpts] = useLocalStorage<CleanOptions>('cleaner:opts', defaultCleanOptions);
  const set = <K extends keyof CleanOptions>(key: K, value: CleanOptions[K]): void => setOpts((o) => ({ ...o, [key]: value }));

  const result = useMemo(() => cleanText(input, opts), [input, opts]);
  const invisibles = useMemo(() => findInvisibles(input), [input]);
  const remaining = useMemo(() => findInvisibles(result.text), [result.text]);

  return (
    <ToolShell slug="text-cleaner">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <Panel title="Fixes">
          <div className="flex flex-col gap-3 p-4">
            <Toggle checked={opts.removeZeroWidth} onChange={(v) => set('removeZeroWidth', v)} label="Remove zero-width & invisible characters" />
            <Toggle checked={opts.normalizeSpaces} onChange={(v) => set('normalizeSpaces', v)} label="Normalise exotic spaces to plain spaces" />
            <Toggle checked={opts.removeControl} onChange={(v) => set('removeControl', v)} label="Strip control characters" />
            <Toggle checked={opts.removeBom} onChange={(v) => set('removeBom', v)} label="Remove byte-order mark" />
            <Toggle checked={opts.straightenQuotes} onChange={(v) => set('straightenQuotes', v)} label="Straighten “smart” quotes" />
            <Toggle checked={opts.normalizeDashes} onChange={(v) => set('normalizeDashes', v)} label="Dashes & ellipsis to ASCII" />
            <Toggle checked={opts.trimLines} onChange={(v) => set('trimLines', v)} label="Trim trailing whitespace per line" />
            <Toggle checked={opts.collapseBlankLines} onChange={(v) => set('collapseBlankLines', v)} label="Collapse repeated blank lines" />
            <SelectField label="Unicode normalisation" value={opts.normalizeForm} onChange={(v) => set('normalizeForm', v)} options={[{ value: 'none', label: 'None' }, { value: 'NFC', label: 'NFC (composed — recommended)' }, { value: 'NFD', label: 'NFD (decomposed)' }, { value: 'NFKC', label: 'NFKC (compatibility, composed)' }, { value: 'NFKD', label: 'NFKD (compatibility, decomposed)' }]} />
            <p className="muted text-xs">NFKC also folds full-width letters, ligatures (ﬁ → fi) and superscripts to plain text.</p>
          </div>
        </Panel>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Characters changed" value={result.changes} tone={result.changes ? 'good' : 'default'} />
            <Stat label="Hidden characters found" value={invisibles.length} tone={invisibles.length ? 'bad' : 'default'} />
            <Stat label="Remaining after clean" value={remaining.length} tone={remaining.length ? 'bad' : 'good'} />
          </div>
          {invisibles.length > 0 && (
            <Callout tone="warning" title={`${invisibles.length} invisible character${invisibles.length === 1 ? '' : 's'} in the input`}>
              <ul className="mt-1 max-h-28 overflow-auto font-mono text-xs">
                {invisibles.slice(0, 40).map((h) => (
                  <li key={`${h.line}:${h.column}:${h.codePoint}`}>
                    line {h.line}, col {h.column}: U+{h.codePoint.toString(16).toUpperCase().padStart(4, '0')} {h.name}
                  </li>
                ))}
                {invisibles.length > 40 && <li>…and {invisibles.length - 40} more</li>}
              </ul>
            </Callout>
          )}
          <Workspace>
            <TextInput value={input} onChange={setInput} label="Messy text" sample={SAMPLE} accept=".txt,.md,.csv,text/*" rows={16} fill autoFocus />
            <TextOutput value={result.text} label="Clean text" filename="clean.txt" rows={16} fill />
          </Workspace>
        </div>
      </div>
    </ToolShell>
  );
}
