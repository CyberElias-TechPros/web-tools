import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, CopyButton, Panel } from '@/components/ui';
import { TextInput } from '@/components/TextIO';
import { UNICODE_STYLES, styleText } from '@/lib/unicode';

const EXTRA: Array<{ id: string; label: string; fn: (s: string) => string }> = [
  { id: 'spaced', label: 'S p a c e d', fn: (s) => Array.from(s).join(' ') },
  { id: 'upside', label: 'uʍop ǝpᴉsdn', fn: flip },
  { id: 'strike', label: 'S̶t̶r̶i̶k̶e̶', fn: (s) => Array.from(s).map((c) => (c === ' ' ? c : `${c}\u0336`)).join('') },
  { id: 'underline', label: 'U̲n̲d̲e̲r̲l̲i̲n̲e̲', fn: (s) => Array.from(s).map((c) => (c === ' ' ? c : `${c}\u0332`)).join('') },
  { id: 'reverse', label: 'esreveR', fn: (s) => Array.from(s).reverse().join('') },
  { id: 'clap', label: 'Clap 👏 case', fn: (s) => s.trim().split(/\s+/).join(' 👏 ') },
  { id: 'sponge', label: 'sPoNgE cAsE', fn: (s) => Array.from(s).map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('') },
];

export default function FancyTextTool(): React.ReactElement {
  const [input, setInput] = useState('Make it look different');
  const text = input || 'Make it look different';
  const rows = useMemo(() => [...UNICODE_STYLES.map((s) => ({ id: s.id, label: s.label, value: styleText(text, s.id) })), ...EXTRA.map((e) => ({ id: e.id, label: e.label, value: e.fn(text) }))], [text]);

  return (
    <ToolShell slug="fancy-text">
      <TextInput value={input} onChange={setInput} label="Your text" rows={3} autoFocus />
      <Callout tone="info" className="my-4">
        These are real Unicode characters (mathematical alphanumerics and combining marks), so they paste anywhere plain text works — bios, usernames, messages. Screen readers may spell them out letter by letter, so keep it for decoration.
      </Callout>
      <Panel title="Styles">
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className="muted block text-xs">{r.label}</span>
                <span className="block truncate text-lg" lang="und">{r.value}</span>
              </span>
              <CopyButton value={r.value} small />
            </li>
          ))}
        </ul>
      </Panel>
    </ToolShell>
  );
}

const FLIP: Record<string, string> = Object.fromEntries(
  'abcdefghijklmnopqrstuvwxyz0123456789.,!?\'"()[]{}<>&_'.split('').map((c, i) => [c, 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz0ƖᄅƐㄣϛ9ㄥ86˙\'¡¿,„)(][}{><⅋‾'.split('')[i] ?? c]),
);
function flip(s: string): string {
  return Array.from(s.toLowerCase())
    .map((c) => FLIP[c] ?? c)
    .reverse()
    .join('');
}
