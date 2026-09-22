import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Segmented, Stat } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { formatHtml, minifyHtml } from '@/lib/cssfmt';
import { formatBytes, savingsPercent } from '@/lib/image';
import { useDebounced, useLocalStorage } from '@/hooks';

type Mode = 'format' | 'minify';

const SAMPLE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Sample</title><style>body{margin:0}</style></head><body><header class="site"><nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav></header><main><h1>Hello, <em>world</em>!</h1><p>This is <strong>inline</strong> content that should stay on one line.</p><pre><code>  keep
   this  </code></pre><img src="a.png" alt=""><br><table><tr><td>1</td><td>2</td></tr></table></main><!-- footer --><footer><p>&copy; 2024</p></footer><script>console.log("hi")</script></body></html>`;

export default function HtmlTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('format');
  const [indent, setIndent] = useLocalStorage<'2' | '4' | 'tab'>('html:indent', '2');
  const debounced = useDebounced(input, 120);

  const output = useMemo(() => {
    if (!debounced.trim()) return '';
    const indentStr = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
    return mode === 'minify' ? minifyHtml(debounced) : formatHtml(debounced, indentStr);
  }, [debounced, mode, indent]);

  const inBytes = new TextEncoder().encode(debounced).length;
  const outBytes = new TextEncoder().encode(output).length;
  const tagCount = (debounced.match(/<[a-zA-Z][^>]*>/g) ?? []).length;

  return (
    <ToolShell slug="html-formatter">
      <OptionsBar>
        <Segmented label="Operation" value={mode} onChange={setMode} options={[{ value: 'format', label: 'Beautify' }, { value: 'minify', label: 'Minify' }]} />
        {mode === 'format' && <Segmented size="sm" label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]} />}
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label="HTML" sample={SAMPLE} accept=".html,.htm,.xhtml,text/html" rows={20} fill autoFocus />
        <div className="flex flex-col gap-3">
          {debounced && (
            <div className="card grid grid-cols-3 gap-3 px-4 py-3">
              <Stat label="Tags" value={tagCount} />
              <Stat label="Input" value={formatBytes(inBytes)} />
              <Stat label="Output" value={`${formatBytes(outBytes)} (${savingsPercent(inBytes, outBytes) >= 0 ? '−' : '+'}${Math.abs(savingsPercent(inBytes, outBytes))}%)`} tone={outBytes < inBytes ? 'good' : 'default'} />
            </div>
          )}
          <TextOutput value={output} label={mode === 'format' ? 'Formatted HTML' : 'Minified HTML'} filename={mode === 'format' ? 'formatted.html' : 'minified.html'} mime="text/html" rows={20} fill wrap={mode === 'format'} />
        </div>
      </Workspace>
      <p className="muted mt-3 text-xs">
        Inline elements stay on their line; <code className="font-mono">pre</code>, <code className="font-mono">textarea</code>, <code className="font-mono">script</code> and <code className="font-mono">style</code> contents are preserved verbatim.
      </p>
    </ToolShell>
  );
}
