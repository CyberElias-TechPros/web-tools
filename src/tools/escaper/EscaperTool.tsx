import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Segmented, SelectField, Toggle } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { escapeText, unescapeText } from '@/lib/unicode';
import type { EscapeFormat } from '@/lib/unicode';
import { useLocalStorage } from '@/hooks';

type Mode = 'escape' | 'unescape';

const FORMATS: Array<{ value: EscapeFormat; label: string; example: string }> = [
  { value: 'js', label: 'JavaScript / TypeScript', example: '\\u00e9 \\u{1F600}' },
  { value: 'json', label: 'JSON', example: '\\u00e9 \\ud83d\\ude00' },
  { value: 'python', label: 'Python', example: '\\xe9 \\U0001f600' },
  { value: 'css', label: 'CSS', example: '\\e9 \\1f600' },
  { value: 'html-dec', label: 'HTML decimal entity', example: '&#233;' },
  { value: 'html-hex', label: 'HTML hex entity', example: '&#xe9;' },
  { value: 'url', label: 'URL percent-encoding', example: '%C3%A9' },
  { value: 'codepoint', label: 'Code point notation', example: 'U+00E9' },
];

const SAMPLE = 'Café naïve — “quotes” 日本語 👋 \ttab & <tag>';

export default function EscaperTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('escape');
  const [format, setFormat] = useLocalStorage<EscapeFormat>('esc:format', 'js');
  const [onlyNonAscii, setOnlyNonAscii] = useLocalStorage('esc:ascii', true);
  const [input, setInput] = useState('');

  const output = useMemo(() => (mode === 'escape' ? escapeText(input, format, onlyNonAscii) : unescapeText(input)), [mode, input, format, onlyNonAscii]);
  const fmt = FORMATS.find((f) => f.value === format);

  return (
    <ToolShell slug="string-escaper">
      <OptionsBar>
        <Segmented label="Direction" value={mode} onChange={(m) => { setMode(m); setInput(output); }} options={[{ value: 'escape', label: 'Escape' }, { value: 'unescape', label: 'Unescape' }]} />
        {mode === 'escape' && (
          <>
            <SelectField label="Format" value={format} onChange={setFormat} options={FORMATS} className="w-60" />
            <Toggle checked={onlyNonAscii} onChange={setOnlyNonAscii} label="Only non-ASCII" hint="Leave plain letters, digits and punctuation as they are" />
          </>
        )}
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label={mode === 'escape' ? 'Text' : 'Escaped text'} sample={mode === 'escape' ? SAMPLE : 'Caf\\u00e9 na\\u00efve \\u2014 \\u201Cquotes\\u201D &#26085;&#26412; %F0%9F%91%8B U+1F600'} rows={12} fill autoFocus />
        <TextOutput value={output} label={mode === 'escape' ? `Escaped (${fmt?.label ?? format})` : 'Unescaped text'} filename={mode === 'escape' ? 'escaped.txt' : 'unescaped.txt'} rows={12} fill wrap />
      </Workspace>
      <p className="muted mt-3 text-xs">
        {mode === 'escape' ? <>Example for é and 😀 in this format: <code className="font-mono">{fmt?.example}</code></> : <>Unescape understands \uXXXX, \u{'{'}…{'}'}, \xXX, \UXXXXXXXX, CSS \XXXX, HTML entities, percent-encoding and U+XXXX — mixed freely.</>}
      </p>
    </ToolShell>
  );
}
