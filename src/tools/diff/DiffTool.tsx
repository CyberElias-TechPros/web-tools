import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Download, FileUp, GitCompareArrows, Trash2, Wand2 } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  EmptyState,
  Panel,
  Segmented,
  Stat,
  Toasts,
  Toggle,
  useToasts,
} from '@/components/ui';
import { defaultDiffOptions, diffLines, toUnifiedDiff } from '@/lib/diff';
import type { DiffChunk, DiffLine, DiffOptions, DiffResult } from '@/lib/diff';
import { downloadText, readFileAsText } from '@/lib/files';
import { useDebounced, useLocalStorage, useMediaQuery } from '@/hooks';

const SAMPLE_LEFT = `{
  "name": "checkout-api",
  "version": "2.3.0",
  "port": 8080,
  "database": {
    "host": "db.internal",
    "poolSize": 10
  },
  "features": ["orders", "refunds"],
  "logLevel": "info"
}`;

const SAMPLE_RIGHT = `{
  "name": "checkout-api",
  "version": "2.4.1",
  "port": 8080,
  "database": {
    "host": "db-primary.internal",
    "poolSize": 25,
    "timeoutMs": 3000
  },
  "features": ["orders", "refunds", "subscriptions"],
  "logLevel": "warn"
}`;

type ViewMode = 'split' | 'inline' | 'unified';

const OP_BG: Record<string, string> = {
  insert: 'color-mix(in oklab, var(--ok) 16%, transparent)',
  delete: 'color-mix(in oklab, var(--danger) 16%, transparent)',
  replace: 'color-mix(in oklab, var(--warn) 14%, transparent)',
  equal: 'transparent',
};

export default function DiffTool(): React.ReactElement {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [options, setOptions] = useLocalStorage<DiffOptions>('wt:diff:options', defaultDiffOptions);
  const [view, setView] = useLocalStorage<ViewMode>('wt:diff:view', 'split');
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leftInput = useRef<HTMLInputElement>(null);
  const rightInput = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const isNarrow = !useMediaQuery('(min-width: 900px)');
  const effectiveView: ViewMode = isNarrow && view === 'split' ? 'inline' : view;

  const debouncedLeft = useDebounced(left, 200);
  const debouncedRight = useDebounced(right, 200);

  const result = useMemo<DiffResult>(() => {
    if (!debouncedLeft && !debouncedRight) {
      return { lines: [], stats: { added: 0, removed: 0, changed: 0, unchanged: 0, similarity: 1 } };
    }
    return diffLines(debouncedLeft, debouncedRight, options);
  }, [debouncedLeft, debouncedRight, options]);

  const unified = useMemo(
    () => (result.lines.length ? toUnifiedDiff(result, 'original', 'modified') : ''),
    [result],
  );

  const visibleLines = useMemo(() => {
    if (!onlyChanges) return result.lines;
    // Keep two lines of context around each change for orientation.
    const keep = new Set<number>();
    result.lines.forEach((line, index) => {
      if (line.op !== 'equal') {
        for (let i = Math.max(0, index - 2); i <= Math.min(result.lines.length - 1, index + 2); i++) {
          keep.add(i);
        }
      }
    });
    return result.lines.filter((_, index) => keep.has(index));
  }, [result.lines, onlyChanges]);

  const loadFile = useCallback(
    async (files: FileList | null, side: 'left' | 'right') => {
      const file = files?.[0];
      if (!file) return;
      setError(null);
      try {
        const text = await readFileAsText(file);
        if (side === 'left') setLeft(text);
        else setRight(text);
        push(`Loaded “${file.name}” into the ${side} side.`, 'success');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [push],
  );

  const swap = (): void => {
    setLeft(right);
    setRight(left);
  };

  const set = <K extends keyof DiffOptions>(key: K, value: DiffOptions[K]): void =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const identical =
    (debouncedLeft || debouncedRight) &&
    result.stats.added === 0 &&
    result.stats.removed === 0 &&
    result.stats.changed === 0;

  return (
    <ToolShell
      slug="text-diff"
      wide
      actions={
        <>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setLeft(SAMPLE_LEFT);
              setRight(SAMPLE_RIGHT);
            }}
          >
            <Wand2 size={14} aria-hidden />
            Sample
          </button>
          <button type="button" className="btn btn-sm" onClick={swap} disabled={!left && !right}>
            <ArrowLeftRight size={14} aria-hidden />
            Swap
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setLeft('');
              setRight('');
            }}
            disabled={!left && !right}
          >
            <Trash2 size={14} aria-hidden />
            Clear
          </button>
        </>
      }
    >
      {error && (
        <Callout tone="error" className="mb-3" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Panel
          title="Original"
          actions={
            <>
              <input
                ref={leftInput}
                type="file"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  void loadFile(e.target.files, 'left');
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn btn-sm" onClick={() => leftInput.current?.click()}>
                <FileUp size={14} aria-hidden />
                Open
              </button>
            </>
          }
        >
          <textarea
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder="Paste the original text or code here…"
            spellCheck={false}
            aria-label="Original text"
            className="code-area h-48 w-full resize-y bg-transparent p-3 outline-none"
          />
        </Panel>

        <Panel
          title="Modified"
          actions={
            <>
              <input
                ref={rightInput}
                type="file"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  void loadFile(e.target.files, 'right');
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => rightInput.current?.click()}
              >
                <FileUp size={14} aria-hidden />
                Open
              </button>
            </>
          }
        >
          <textarea
            value={right}
            onChange={(e) => setRight(e.target.value)}
            placeholder="Paste the changed version here…"
            spellCheck={false}
            aria-label="Modified text"
            className="code-area h-48 w-full resize-y bg-transparent p-3 outline-none"
          />
        </Panel>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 p-3">
        <Segmented
          size="sm"
          label="View mode"
          value={effectiveView}
          onChange={setView}
          options={[
            ...(isNarrow ? [] : [{ value: 'split' as const, label: 'Side by side' }]),
            { value: 'inline' as const, label: 'Inline' },
            { value: 'unified' as const, label: 'Unified patch' },
          ]}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Toggle
            checked={options.ignoreCase}
            onChange={(v) => set('ignoreCase', v)}
            label="Ignore case"
          />
          <Toggle
            checked={options.ignoreWhitespace}
            onChange={(v) => set('ignoreWhitespace', v)}
            label="Ignore all whitespace"
          />
          <Toggle
            checked={options.ignoreBlankLines}
            onChange={(v) => set('ignoreBlankLines', v)}
            label="Ignore blank lines"
          />
          <Toggle
            checked={options.sortLines}
            onChange={(v) => set('sortLines', v)}
            label="Sort lines first"
          />
          <Toggle checked={onlyChanges} onChange={setOnlyChanges} label="Only changed lines" />
        </div>
      </div>

      {(debouncedLeft || debouncedRight) && (
        <div className="card mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
          <Stat label="Added" value={`+${result.stats.added}`} tone="good" />
          <Stat label="Removed" value={`−${result.stats.removed}`} tone="bad" />
          <Stat label="Modified" value={result.stats.changed} />
          <Stat label="Unchanged" value={result.stats.unchanged} />
          <Stat label="Similarity" value={`${Math.round(result.stats.similarity * 100)}%`} />
        </div>
      )}

      <Panel
        title="Differences"
        actions={
          effectiveView === 'unified' ? (
            <>
              <CopyButton value={unified} label="Copy patch" small />
              <button
                type="button"
                className="btn btn-sm"
                disabled={!unified}
                onClick={() => downloadText(unified, 'changes.patch', 'text/x-patch')}
              >
                <Download size={14} aria-hidden />
                <span className="hidden sm:inline">Download .patch</span>
              </button>
            </>
          ) : null
        }
        bodyClassName="overflow-auto"
      >
        {result.lines.length === 0 ? (
          <EmptyState
            icon={<GitCompareArrows size={30} />}
            title="Nothing to compare yet"
            description="Paste text into both panels above. The comparison updates as you type."
          />
        ) : identical ? (
          <div className="p-4">
            <Callout tone="success" title="The two inputs are identical">
              {options.ignoreCase || options.ignoreWhitespace || options.ignoreBlankLines
                ? 'No differences remain once the active ignore rules are applied.'
                : 'Every line matches exactly, including whitespace.'}
            </Callout>
          </div>
        ) : effectiveView === 'unified' ? (
          <pre className="code-area max-h-[65vh] overflow-auto p-3">
            {unified.split('\n').map((line, index) => (
              <div
                key={index}
                style={{
                  background: line.startsWith('+')
                    ? OP_BG.insert
                    : line.startsWith('-')
                      ? OP_BG.delete
                      : line.startsWith('@@')
                        ? 'color-mix(in oklab, var(--accent) 12%, transparent)'
                        : 'transparent',
                }}
              >
                {line || ' '}
              </div>
            ))}
          </pre>
        ) : effectiveView === 'split' ? (
          <SplitView lines={visibleLines} />
        ) : (
          <InlineView lines={visibleLines} />
        )}
      </Panel>

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}

function Chunks({ chunks, fallback }: { chunks?: DiffChunk[]; fallback: string }): React.ReactElement {
  if (!chunks) return <>{fallback || '\u00A0'}</>;
  return (
    <>
      {chunks.map((chunk, index) =>
        chunk.op === 'equal' ? (
          <span key={index}>{chunk.value}</span>
        ) : (
          <mark
            key={index}
            className="rounded-[3px] px-0.5"
            style={{
              background:
                chunk.op === 'insert'
                  ? 'color-mix(in oklab, var(--ok) 34%, transparent)'
                  : 'color-mix(in oklab, var(--danger) 34%, transparent)',
              color: 'inherit',
            }}
          >
            {chunk.value}
          </mark>
        ),
      )}
    </>
  );
}

function SplitView({ lines }: { lines: DiffLine[] }): React.ReactElement {
  return (
    <div className="code-area max-h-[65vh] overflow-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Side-by-side comparison</caption>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="align-top">
              <td
                className="muted w-10 shrink-0 border-r px-1.5 text-right tabular-nums select-none"
                style={{ background: line.op === 'insert' ? 'transparent' : OP_BG[line.op] }}
              >
                {line.leftNumber ?? ''}
              </td>
              <td
                className="w-1/2 px-2 whitespace-pre-wrap"
                style={{ background: line.op === 'insert' ? 'transparent' : OP_BG[line.op] }}
              >
                {line.op === 'insert' ? (
                  '\u00A0'
                ) : (
                  <Chunks chunks={line.inlineLeft} fallback={line.left} />
                )}
              </td>
              <td
                className="muted w-10 shrink-0 border-r border-l px-1.5 text-right tabular-nums select-none"
                style={{ background: line.op === 'delete' ? 'transparent' : OP_BG[line.op] }}
              >
                {line.rightNumber ?? ''}
              </td>
              <td
                className="w-1/2 px-2 whitespace-pre-wrap"
                style={{ background: line.op === 'delete' ? 'transparent' : OP_BG[line.op] }}
              >
                {line.op === 'delete' ? (
                  '\u00A0'
                ) : (
                  <Chunks chunks={line.inlineRight} fallback={line.right} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InlineView({ lines }: { lines: DiffLine[] }): React.ReactElement {
  const rows: Array<{ marker: string; number: number | null; text: string; op: string; chunks?: DiffChunk[] }> = [];
  for (const line of lines) {
    if (line.op === 'equal') {
      rows.push({ marker: ' ', number: line.leftNumber, text: line.left, op: 'equal' });
    } else if (line.op === 'delete') {
      rows.push({ marker: '−', number: line.leftNumber, text: line.left, op: 'delete' });
    } else if (line.op === 'insert') {
      rows.push({ marker: '+', number: line.rightNumber, text: line.right, op: 'insert' });
    } else {
      rows.push({
        marker: '−',
        number: line.leftNumber,
        text: line.left,
        op: 'delete',
        ...(line.inlineLeft ? { chunks: line.inlineLeft } : {}),
      });
      rows.push({
        marker: '+',
        number: line.rightNumber,
        text: line.right,
        op: 'insert',
        ...(line.inlineRight ? { chunks: line.inlineRight } : {}),
      });
    }
  }

  return (
    <div className="code-area max-h-[65vh] overflow-auto">
      {rows.map((row, index) => (
        <div key={index} className="flex" style={{ background: OP_BG[row.op] }}>
          <span className="muted w-12 shrink-0 border-r px-1.5 text-right tabular-nums select-none">
            {row.number ?? ''}
          </span>
          <span
            className="w-5 shrink-0 text-center select-none"
            style={{
              color:
                row.op === 'insert'
                  ? 'var(--ok)'
                  : row.op === 'delete'
                    ? 'var(--danger)'
                    : 'var(--text-muted)',
            }}
          >
            {row.marker}
          </span>
          <span className="min-w-0 flex-1 px-1 whitespace-pre-wrap">
            <Chunks chunks={row.chunks} fallback={row.text} />
          </span>
        </div>
      ))}
    </div>
  );
}
