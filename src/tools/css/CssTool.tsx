import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Segmented, Stat, Toggle } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { cssStats, formatCss, minifyCss } from '@/lib/cssfmt';
import { formatBytes, savingsPercent } from '@/lib/image';
import { useDebounced, useLocalStorage } from '@/hooks';

type Mode = 'format' | 'minify';

const SAMPLE = `:root{--brand:#ff6a00;--radius:12px}*,*::before,*::after{box-sizing:border-box}
/*! keep this license comment */
.card{display:flex;flex-direction:column;gap:.5rem;padding:1rem 1.25rem;border-radius:var(--radius);background:linear-gradient(135deg,#fff,#f4f4f5);box-shadow:0 1px 2px rgba(0,0,0,.08)}.card:hover,.card:focus-within{transform:translateY(-2px)}
@media (min-width:768px){.card{padding:1.5rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`;

export default function CssTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('format');
  const [indent, setIndent] = useLocalStorage<'2' | '4' | 'tab'>('css:indent', '2');
  const [comments, setComments] = useLocalStorage('css:comments', true);
  const [blankLines, setBlankLines] = useLocalStorage('css:blank', true);
  const debounced = useDebounced(input, 120);

  const result = useMemo(() => {
    if (!debounced.trim()) return { output: '', stats: null as ReturnType<typeof cssStats> | null };
    const indentStr = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
    const output = mode === 'minify' ? minifyCss(debounced, comments) : formatCss(debounced, { indent: indentStr, preserveComments: comments, blankLineBetweenRules: blankLines });
    return { output, stats: cssStats(debounced) };
  }, [debounced, mode, indent, comments, blankLines]);

  const inBytes = new TextEncoder().encode(debounced).length;
  const outBytes = new TextEncoder().encode(result.output).length;

  return (
    <ToolShell slug="css-formatter">
      <OptionsBar>
        <Segmented label="Operation" value={mode} onChange={setMode} options={[{ value: 'format', label: 'Beautify' }, { value: 'minify', label: 'Minify' }]} />
        {mode === 'format' && <Segmented size="sm" label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]} />}
        <Toggle checked={comments} onChange={setComments} label={mode === 'minify' ? 'Keep /*! */ comments' : 'Keep comments'} />
        {mode === 'format' && <Toggle checked={blankLines} onChange={setBlankLines} label="Blank line between rules" />}
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label="CSS" sample={SAMPLE} accept=".css,text/css" rows={20} fill autoFocus />
        <div className="flex flex-col gap-3">
          {result.stats && (
            <div className="card grid grid-cols-3 gap-3 px-4 py-3 sm:grid-cols-6">
              <Stat label="Rules" value={result.stats.rules} />
              <Stat label="Selectors" value={result.stats.selectors} />
              <Stat label="Declarations" value={result.stats.declarations} />
              <Stat label="Comments" value={result.stats.comments} />
              <Stat label="Input" value={formatBytes(inBytes)} />
              <Stat label="Output" value={`${formatBytes(outBytes)} (${savingsPercent(inBytes, outBytes) >= 0 ? '−' : '+'}${Math.abs(savingsPercent(inBytes, outBytes))}%)`} tone={outBytes < inBytes ? 'good' : 'default'} />
            </div>
          )}
          <TextOutput value={result.output} label={mode === 'format' ? 'Formatted CSS' : 'Minified CSS'} filename={mode === 'format' ? 'styles.css' : 'styles.min.css'} mime="text/css" rows={20} fill wrap={mode === 'format'} />
        </div>
      </Workspace>
    </ToolShell>
  );
}
