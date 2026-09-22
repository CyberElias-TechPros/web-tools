import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Panel, ProgressBar, Stat } from '@/components/ui';
import { DataTable, TextInput } from '@/components/TextIO';
import { PLATFORM_LIMITS, analyzeText, formatDuration } from '@/lib/readability';
import { useDebounced } from '@/hooks';

const SAMPLE = `Every small job, finished in the browser. Nothing you paste, drop or type leaves this tab — there is no server to send it to.

The tools here are built for the moments between the real work: the PDF that needs merging before a meeting, the JSON that will not parse, the colour that has to pass a contrast check. Each one opens instantly, works offline, and gives you the answer without an account.`;

export default function WordCountTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const debounced = useDebounced(input, 120);
  const stats = useMemo(() => analyzeText(debounced), [debounced]);
  const ease = stats.scores.fleschReadingEase;

  return (
    <ToolShell slug="word-counter">
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Words" value={stats.words} />
            <Stat label="Characters" value={stats.characters} title={`${stats.charactersNoSpaces} without spaces`} />
            <Stat label="Sentences" value={stats.sentences} />
            <Stat label="Paragraphs" value={stats.paragraphs} />
          </div>
          <TextInput value={input} onChange={setInput} label="Your text" sample={SAMPLE} accept=".txt,.md,text/*" rows={18} autoFocus />
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Readability">
              <div className="flex flex-col gap-3 p-4">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>Flesch reading ease</span>
                    <span className="font-mono font-semibold">{stats.words ? ease.toFixed(0) : '—'}</span>
                  </div>
                  <ProgressBar value={Math.max(0, Math.min(100, ease))} max={100} label="Reading ease" className="mt-1" />
                  <p className="muted mt-1 text-xs">{stats.words ? `${stats.easeLabel} · ${stats.gradeLabel}` : 'Type or paste to analyse.'}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {[
                    ['Flesch–Kincaid grade', stats.scores.fleschKincaidGrade],
                    ['Gunning fog', stats.scores.gunningFog],
                    ['SMOG', stats.scores.smog],
                    ['Coleman–Liau', stats.scores.colemanLiau],
                    ['ARI', stats.scores.ari],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between gap-2 border-b py-1">
                      <dt className="muted">{k}</dt>
                      <dd className="font-mono">{stats.words ? Number(v).toFixed(1) : '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Panel>
            <Panel title="Details">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-sm">
                {[
                  ['Reading time', formatDuration(stats.readingTimeSeconds)],
                  ['Speaking time', formatDuration(stats.speakingTimeSeconds)],
                  ['Unique words', String(stats.uniqueWords)],
                  ['Syllables', String(stats.syllables)],
                  ['Complex words', String(stats.complexWords)],
                  ['Avg word length', stats.avgWordLength.toFixed(1)],
                  ['Avg sentence', `${stats.avgSentenceLength.toFixed(1)} words`],
                  ['Lines', String(stats.lines)],
                  ['Letters', String(stats.letters)],
                  ['Longest word', stats.longestWord || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b py-1">
                    <dt className="muted">{k}</dt>
                    <dd className="truncate font-mono">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Platform limits">
            <ul className="divide-y">
              {PLATFORM_LIMITS.map((p) => {
                const used = p.unit === 'characters' ? stats.characters : stats.words;
                const pct = Math.min(100, (used / p.limit) * 100);
                const over = used > p.limit;
                return (
                  <li key={p.name} className="px-4 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{p.name}</span>
                      <span className={`font-mono text-xs ${over ? 'font-semibold' : 'muted'}`} style={over ? { color: 'var(--danger)' } : undefined}>
                        {used.toLocaleString()} / {p.limit.toLocaleString()} {p.unit === 'characters' ? 'chars' : 'words'}
                      </span>
                    </div>
                    <ProgressBar value={pct} max={100} label={`${p.name} usage`} tone={over ? 'danger' : pct > 85 ? 'warn' : 'accent'} className="mt-1" />
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Top words" description="Stop words excluded.">
            {stats.topWords.length ? (
              <DataTable headers={['Word', 'Count', 'Share']} rows={stats.topWords.slice(0, 12).map((w) => [w.word, String(w.count), `${w.percent.toFixed(1)}%`])} maxHeight="20rem" />
            ) : (
              <p className="muted p-4 text-sm">Nothing to count yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
