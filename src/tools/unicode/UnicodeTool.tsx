import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Stat } from '@/components/ui';
import { KeyValue, TextInput } from '@/components/TextIO';
import { inspectText } from '@/lib/unicode';
import type { CharInfo } from '@/lib/unicode';
import { useDebounced } from '@/hooks';

const SAMPLE = 'Héllo, wörld! 👋🏽 Ω≈ç√ — ‍zero\u200Bwidth ﬁ ½ ①';

export default function UnicodeTool(): React.ReactElement {
  const [input, setInput] = useState(SAMPLE);
  const [selected, setSelected] = useState<number>(0);
  const debounced = useDebounced(input, 100);
  const info = useMemo(() => inspectText(debounced), [debounced]);
  const current: CharInfo | undefined = info.chars[Math.min(selected, info.chars.length - 1)];

  return (
    <ToolShell slug="unicode-inspector">
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <div className="flex flex-col gap-4">
          <TextInput value={input} onChange={setInput} label="Text" rows={4} autoFocus />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Graphemes" value={info.graphemes} title="What a person would count as characters" />
            <Stat label="Code points" value={info.codePoints} />
            <Stat label="UTF-16 units" value={info.utf16Units} title="JavaScript .length" />
            <Stat label="UTF-8 bytes" value={info.utf8Bytes} />
            <Stat label="Invisible" value={info.chars.filter((c) => c.isInvisible).length} tone={info.chars.some((c) => c.isInvisible) ? 'bad' : 'default'} />
          </div>
          {info.truncated && <Callout tone="info">Showing the first {info.chars.length} code points.</Callout>}
          <Panel title="Characters" description="Click any character to inspect it.">
            <ol className="flex flex-wrap gap-1 p-3" aria-label="Characters">
              {info.chars.map((c, i) => (
                <li key={`${i}-${c.codePoint}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={i === selected}
                    aria-label={`${c.name} U+${c.hex}`}
                    className="flex h-12 w-11 flex-col items-center justify-center rounded-lg border font-mono transition"
                    style={{
                      background: i === selected ? 'color-mix(in oklab, var(--accent) 22%, transparent)' : c.isInvisible ? 'color-mix(in oklab, var(--danger) 16%, transparent)' : c.isCombining ? 'color-mix(in oklab, var(--accent-3) 16%, transparent)' : undefined,
                      borderColor: i === selected ? 'var(--accent)' : undefined,
                    }}
                  >
                    <span className="text-base leading-none">{c.isInvisible ? '·' : c.char === ' ' ? '␠' : c.char === '\n' ? '⏎' : c.char}</span>
                    <span className="muted mt-1 text-[0.55rem] leading-none">{c.hex}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <Panel title="Details" description={current ? `U+${current.hex}` : undefined}>
          {current ? (
            <div>
              <div className="flex items-center gap-4 border-b px-4 py-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-5xl" style={{ background: 'color-mix(in oklab, var(--accent) 14%, transparent)' }} aria-hidden>
                  {current.isInvisible ? '·' : current.char}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">{current.name}</div>
                  <div className="muted text-xs">{current.category} · {current.block}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {current.isEmoji && <span className="chip">emoji</span>}
                    {current.isCombining && <span className="chip">combining</span>}
                    {current.isInvisible && <span className="chip">invisible</span>}
                  </div>
                </div>
              </div>
              <KeyValue
                dense
                className="px-4"
                rows={[
                  { key: 'Code point', value: `U+${current.hex}`, copy: `U+${current.hex}` },
                  { key: 'Decimal', value: String(current.codePoint), copy: String(current.codePoint) },
                  { key: 'UTF-8', value: current.utf8, copy: current.utf8 },
                  { key: 'UTF-16', value: current.utf16, copy: current.utf16 },
                  { key: 'JavaScript', value: current.jsEscape, copy: current.jsEscape },
                  { key: 'CSS', value: current.cssEscape, copy: current.cssEscape },
                  { key: 'HTML', value: current.htmlEntity, copy: current.htmlEntity },
                ]}
              />
            </div>
          ) : (
            <p className="muted p-4 text-sm">Type something to inspect.</p>
          )}
        </Panel>
      </div>
    </ToolShell>
  );
}
