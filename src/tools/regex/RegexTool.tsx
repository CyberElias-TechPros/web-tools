import { useMemo, useState } from 'react';
import { BookOpen, Regex as RegexIcon, Trash2 } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  EmptyState,
  Panel,
  Segmented,
  Stat,
} from '@/components/ui';
import {
  FLAG_INFO,
  explainRegex,
  lintRegex,
  parseRegex,
  runRegex,
  runReplace,
} from '@/lib/regex';
import type { RegexMatch, RegexNode } from '@/lib/regex';
import { useDebounced, useLocalStorage } from '@/hooks';

interface Preset {
  name: string;
  pattern: string;
  flags: string;
  sample: string;
}

const PRESETS: Preset[] = [
  {
    name: 'Email address',
    pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    flags: 'g',
    sample: 'Contact ada@example.com or grace.hopper+work@navy.mil.uk before 5pm. Not an email: @nope.',
  },
  {
    name: 'URL',
    pattern: 'https?://[\\w.-]+(?:/[\\w./?%&=~+-]*)?',
    flags: 'g',
    sample: 'See https://example.com/docs?page=2 and http://localhost:3000/api for details.',
  },
  {
    name: 'ISO date',
    pattern: '(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])',
    flags: 'g',
    sample: 'Deployed 2024-11-03, rolled back 2024-11-04, fixed 2025-01-15. Invalid: 2024-13-45.',
  },
  {
    name: 'IPv4 address',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\b',
    flags: 'g',
    sample: 'Allow 192.168.1.1 and 10.0.0.254, block 999.1.1.1 and 172.16.0.1.',
  },
  {
    name: 'Hex colour',
    pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b',
    flags: 'g',
    sample: 'Palette: #fff, #1a2b3c, #6366F1. Not a colour: #12345 or #xyzxyz.',
  },
  {
    name: 'Duplicate word',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    flags: 'gi',
    sample: 'This this is a a common typo that that slips past review.',
  },
  {
    name: 'Log line',
    pattern: '^(?<level>ERROR|WARN|INFO)\\s+\\[(?<time>[^\\]]+)\\]\\s+(?<message>.*)$',
    flags: 'gm',
    sample: `INFO  [2025-01-14T09:12:01Z] service started
WARN  [2025-01-14T09:12:44Z] pool nearly exhausted
ERROR [2025-01-14T09:13:02Z] connection refused`,
  },
];

const HIGHLIGHT_COLORS = [
  'color-mix(in oklab, var(--accent) 34%, transparent)',
  'color-mix(in oklab, var(--ok) 34%, transparent)',
  'color-mix(in oklab, var(--warn) 34%, transparent)',
];

export default function RegexTool(): React.ReactElement {
  const [pattern, setPattern] = useLocalStorage<string>('wt:regex:pattern', PRESETS[0]!.pattern);
  const [flags, setFlags] = useLocalStorage<string>('wt:regex:flags', 'g');
  const [text, setText] = useLocalStorage<string>('wt:regex:text', PRESETS[0]!.sample);
  const [tab, setTab] = useState<'matches' | 'explain' | 'replace'>('matches');
  const [replacement, setReplacement] = useState('[$&]');

  const debouncedPattern = useDebounced(pattern, 200);
  const debouncedText = useDebounced(text, 200);

  const parsed = useMemo(() => parseRegex(debouncedPattern), [debouncedPattern]);

  const runtime = useMemo(() => {
    if (!debouncedPattern) return null;
    return runRegex(debouncedPattern, flags, debouncedText);
  }, [debouncedPattern, flags, debouncedText]);

  const explanation = useMemo(
    () => (parsed.ast ? explainRegex(parsed.ast) : []),
    [parsed.ast],
  );

  const warnings = useMemo(
    () => (parsed.ast ? lintRegex(parsed.ast, debouncedPattern, flags) : []),
    [parsed.ast, debouncedPattern, flags],
  );

  const replaceResult = useMemo(() => {
    if (tab !== 'replace' || !debouncedPattern) return null;
    return runReplace(debouncedPattern, flags, debouncedText, replacement);
  }, [tab, debouncedPattern, flags, debouncedText, replacement]);

  const toggleFlag = (flag: string): void => {
    setFlags((prev) => (prev.includes(flag) ? prev.replace(flag, '') : prev + flag));
  };

  const matches = runtime?.matches ?? [];
  const hasError = Boolean(parsed.error) || Boolean(runtime?.error);

  return (
    <ToolShell
      slug="regex-tester"
      wide
      actions={
        <CopyButton value={`/${pattern}/${flags}`} label="Copy pattern" small />
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Pattern" bodyClassName="p-3 space-y-3">
            <div className="flex items-stretch gap-0 rounded-lg border" style={{ background: 'var(--surface)' }}>
              <span className="muted grid shrink-0 place-items-center px-2.5 font-mono text-base">/</span>
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Enter a regular expression…"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Regular expression pattern"
                aria-invalid={Boolean(parsed.error)}
                className="code-area min-w-0 flex-1 bg-transparent py-2.5 !text-sm outline-none"
                style={{ color: parsed.error ? 'var(--danger)' : 'var(--text)' }}
              />
              <span className="muted grid shrink-0 place-items-center px-1 font-mono text-base">/</span>
              <span
                className="grid shrink-0 place-items-center pr-2.5 font-mono text-sm"
                style={{ color: 'var(--accent)' }}
              >
                {flags}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FLAG_INFO.map((info) => {
                const active = flags.includes(info.flag);
                return (
                  <button
                    key={info.flag}
                    type="button"
                    onClick={() => toggleFlag(info.flag)}
                    title={`${info.name}: ${info.description}`}
                    aria-pressed={active}
                    className="chip cursor-pointer font-mono transition-colors"
                    style={
                      active
                        ? {
                            background: 'color-mix(in oklab, var(--accent) 20%, transparent)',
                            borderColor: 'var(--accent)',
                            color: 'var(--accent)',
                          }
                        : undefined
                    }
                  >
                    {info.flag}
                    <span className="font-sans">{info.name}</span>
                  </button>
                );
              })}
            </div>

            {parsed.error && (
              <Callout tone="error" title="The pattern is not valid">
                <p>{parsed.error.message}</p>
                <pre className="surface-3 code-area mt-2 overflow-x-auto rounded border p-2 text-[0.7rem]">
                  {pattern}
                  {'\n'}
                  {' '.repeat(Math.max(0, parsed.error.index - 1))}
                  <span style={{ color: 'var(--danger)' }}>▲</span>
                </pre>
              </Callout>
            )}

            {runtime?.error && !parsed.error && (
              <Callout tone="error" title="The browser rejected this pattern">
                {runtime.error}
              </Callout>
            )}

            {warnings.map((warning, index) => (
              <Callout
                key={index}
                tone={warning.severity === 'error' ? 'error' : warning.severity === 'warning' ? 'warning' : 'info'}
              >
                {warning.message}
              </Callout>
            ))}

            {runtime?.truncated && (
              <Callout tone="warning" title="Match loop stopped early">
                This pattern produced too many matches or ran past the safety time limit. Results
                below are partial — a sign the pattern may be more expensive than intended.
              </Callout>
            )}
          </Panel>

          <Panel
            title="Test string"
            actions={
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setText('')}
                disabled={!text}
                aria-label="Clear the test string"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            }
            bodyClassName="p-0"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the text you want to match against…"
              spellCheck={false}
              aria-label="Test string"
              className="code-area h-40 w-full resize-y bg-transparent p-3 outline-none"
            />
            <div className="border-t">
              <div className="muted px-3 py-1.5 text-xs font-semibold">Highlighted matches</div>
              <div className="code-area max-h-64 overflow-auto px-3 pb-3 whitespace-pre-wrap">
                {hasError || matches.length === 0 ? (
                  <span className="muted">{text || 'Nothing to highlight.'}</span>
                ) : (
                  <Highlighted text={debouncedText} matches={matches} />
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title={
              <Segmented
                size="sm"
                label="Result view"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'matches', label: `Matches${matches.length ? ` (${matches.length})` : ''}` },
                  { value: 'explain', label: 'Explanation' },
                  { value: 'replace', label: 'Replace' },
                ]}
              />
            }
            bodyClassName="overflow-auto"
          >
            {tab === 'matches' && (
              <MatchList matches={matches} error={hasError} groupNames={parsed.groupNames} />
            )}

            {tab === 'explain' && (
              <div className="p-3">
                {!parsed.ast ? (
                  <EmptyState
                    icon={<BookOpen size={28} />}
                    title="Enter a valid pattern to see it explained"
                    compact
                  />
                ) : (
                  <>
                    <ol className="space-y-1">
                      {explanation.map((line, index) => (
                        <li
                          key={index}
                          className="text-sm leading-relaxed"
                          style={{ paddingLeft: line.depth * 18 }}
                        >
                          <span className="muted mr-2 font-mono text-xs">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          {line.text}
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 border-t pt-3">
                      <p className="muted mb-2 text-xs font-semibold tracking-wide uppercase">
                        Structure
                      </p>
                      <RegexTreeView node={parsed.ast} depth={0} />
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'replace' && (
              <div className="space-y-3 p-3">
                <div>
                  <label className="label" htmlFor="replacement">
                    Replacement template
                  </label>
                  <input
                    id="replacement"
                    type="text"
                    className="field code-area"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    placeholder="$1 — $&"
                    spellCheck={false}
                  />
                  <p className="muted mt-1 text-xs">
                    <code className="font-mono">$&amp;</code> whole match ·{' '}
                    <code className="font-mono">$1</code> group 1 ·{' '}
                    <code className="font-mono">$&lt;name&gt;</code> named group ·{' '}
                    <code className="font-mono">$$</code> a literal dollar sign
                  </p>
                </div>
                {replaceResult?.error ? (
                  <Callout tone="error">{replaceResult.error}</Callout>
                ) : (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="label mb-0">Result</span>
                      <CopyButton value={replaceResult?.output ?? ''} small />
                    </div>
                    <pre className="surface-3 code-area max-h-64 overflow-auto rounded-lg border p-3 whitespace-pre-wrap">
                      {replaceResult?.output || <span className="muted">Nothing to replace yet.</span>}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Summary" bodyClassName="grid grid-cols-2 gap-4 p-4">
            <Stat label="Matches" value={matches.length} tone={matches.length ? 'good' : 'default'} />
            <Stat label="Groups" value={parsed.groupCount} />
            <Stat
              label="Coverage"
              value={
                debouncedText.length
                  ? `${Math.round((matches.reduce((sum, m) => sum + m.length, 0) / debouncedText.length) * 100)}%`
                  : '—'
              }
              title="Share of the test string covered by matches"
            />
            <Stat
              label="Run time"
              value={runtime ? `${runtime.durationMs.toFixed(1)} ms` : '—'}
              tone={runtime && runtime.durationMs > 300 ? 'bad' : 'default'}
            />
          </Panel>

          <Panel title="Presets" bodyClassName="p-2">
            <ul className="space-y-0.5">
              {PRESETS.map((preset) => (
                <li key={preset.name}>
                  <button
                    type="button"
                    className="hover:surface-3 w-full rounded-lg px-2.5 py-2 text-left transition-colors"
                    onClick={() => {
                      setPattern(preset.pattern);
                      setFlags(preset.flags);
                      setText(preset.sample);
                    }}
                  >
                    <span className="block text-sm font-medium">{preset.name}</span>
                    <code className="muted block truncate font-mono text-[0.7rem]">
                      /{preset.pattern}/{preset.flags}
                    </code>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Cheat sheet" bodyClassName="p-3">
            <dl className="space-y-1.5 text-xs">
              {[
                ['\\d \\w \\s', 'digit · word char · whitespace'],
                ['\\D \\W \\S', 'the negation of each'],
                ['.', 'any character except newline'],
                ['[abc] [^abc]', 'one of · none of'],
                ['[a-z0-9]', 'character ranges'],
                ['* + ?', '0+ · 1+ · optional'],
                ['{2} {2,} {2,5}', 'exact · at least · range'],
                ['*? +?', 'lazy: match as little as possible'],
                ['^ $', 'start · end (of line with m)'],
                ['\\b', 'word boundary'],
                ['(x)', 'capture group'],
                ['(?:x)', 'group without capturing'],
                ['(?<n>x)', 'named capture group'],
                ['(?=x) (?!x)', 'lookahead: is · is not followed by'],
                ['(?<=x) (?<!x)', 'lookbehind: is · is not preceded by'],
                ['a|b', 'either alternative'],
              ].map(([syntax, meaning]) => (
                <div key={syntax} className="flex gap-2">
                  <dt className="w-24 shrink-0 font-mono" style={{ color: 'var(--accent)' }}>
                    {syntax}
                  </dt>
                  <dd className="muted min-w-0 flex-1">{meaning}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}

function Highlighted({ text, matches }: { text: string; matches: RegexMatch[] }): React.ReactElement {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.index > cursor) nodes.push(<span key={`t${index}`}>{text.slice(cursor, match.index)}</span>);
    nodes.push(
      <mark
        key={`m${index}`}
        className="rounded-[3px]"
        style={{ background: HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length], color: 'inherit' }}
        title={`Match ${index + 1} at index ${match.index}`}
      >
        {match.value || '∅'}
      </mark>,
    );
    cursor = match.index + Math.max(match.length, 0);
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

function MatchList({
  matches,
  error,
  groupNames,
}: {
  matches: RegexMatch[];
  error: boolean;
  groupNames: string[];
}): React.ReactElement {
  if (error) {
    return <EmptyState icon={<RegexIcon size={28} />} title="Fix the pattern to see matches" compact />;
  }
  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<RegexIcon size={28} />}
        title="No matches"
        description="The pattern is valid but does not match anything in the test string. Check the flags — without g only the first match is found."
        compact
      />
    );
  }
  return (
    <ul className="divide-y">
      {matches.slice(0, 200).map((match, index) => (
        <li key={index} className="px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="chip font-mono">#{index + 1}</span>
            <code className="code-area break-all" style={{ color: 'var(--accent)' }}>
              {match.value || '(empty match)'}
            </code>
            <span className="muted ml-auto font-mono text-[0.7rem]">
              index {match.index}–{match.index + match.length}
            </span>
          </div>
          {match.groups.length > 0 && (
            <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 pl-1 text-xs sm:grid-cols-2">
              {match.groups
                .filter((group) => !(group.index > 0 && groupNames.includes(group.name)))
                .map((group, gi) => (
                  <div key={gi} className="flex gap-2">
                    <dt className="muted shrink-0 font-mono">
                      {/^\d+$/.test(group.name) ? `$${group.name}` : group.name}
                    </dt>
                    <dd className="code-area min-w-0 flex-1 truncate">
                      {group.value === undefined ? (
                        <span className="muted italic">did not participate</span>
                      ) : group.value === '' ? (
                        <span className="muted italic">empty</span>
                      ) : (
                        group.value
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          )}
        </li>
      ))}
      {matches.length > 200 && (
        <li className="muted px-3 py-2 text-xs">
          Showing the first 200 of {matches.length.toLocaleString()} matches.
        </li>
      )}
    </ul>
  );
}

const NODE_LABEL: Record<string, string> = {
  alternation: 'alternation',
  sequence: 'sequence',
  group: 'group',
  literal: 'literal',
  charClass: 'character class',
  shorthand: 'shorthand class',
  anchor: 'anchor',
  quantifier: 'quantifier',
  backreference: 'backreference',
  dot: 'any character',
};

function RegexTreeView({ node, depth }: { node: RegexNode; depth: number }): React.ReactElement | null {
  if (depth > 20) return null;

  const detail = ((): string => {
    switch (node.type) {
      case 'literal':
        return JSON.stringify(node.value);
      case 'shorthand':
        return `\\${node.value}`;
      case 'anchor':
        return node.value;
      case 'group':
        return node.name ? `${node.kind} “${node.name}”` : node.kind;
      case 'quantifier':
        return `{${node.min},${node.max ?? '∞'}}${node.lazy ? ' lazy' : ''}`;
      case 'charClass':
        return node.negated ? 'negated' : '';
      case 'backreference':
        return `→ ${node.ref}`;
      default:
        return '';
    }
  })();

  const children: RegexNode[] =
    node.type === 'sequence'
      ? node.items
      : node.type === 'alternation'
        ? node.options
        : node.type === 'group'
          ? [node.body]
          : node.type === 'quantifier'
            ? [node.child]
            : [];

  // Collapse single-child sequences to keep the tree readable.
  if (node.type === 'sequence' && node.items.length === 1) {
    return <RegexTreeView node={node.items[0]!} depth={depth} />;
  }

  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      <div className="code-area flex items-baseline gap-2 py-0.5">
        <span className="muted">{depth > 0 ? '└' : ''}</span>
        <span style={{ color: 'var(--accent)' }}>{NODE_LABEL[node.type]}</span>
        {detail && <span className="muted">{detail}</span>}
      </div>
      {children.map((child, index) => (
        <RegexTreeView key={index} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
