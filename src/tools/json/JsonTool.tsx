import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Braces,
  Download,
  FileUp,
  Minimize2,
  Search,
  Trash2,
  Wand2,
  Wrench,
} from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  EmptyState,
  Panel,
  Segmented,
  Stat,
  Toasts,
  useToasts,
} from '@/components/ui';
import {
  flattenJson,
  formatJson,
  jsonStats,
  parseJson,
  queryJson,
  repairJson,
} from '@/lib/json';
import type { JsonError } from '@/lib/json';
import { downloadText, readFileAsText } from '@/lib/files';
import { useDebounced, useDropZone, useLocalStorage } from '@/hooks';

const SAMPLE = `{
  "service": "checkout-api",
  "version": "2.4.1",
  "replicas": 3,
  "healthy": true,
  "endpoints": [
    { "path": "/orders", "methods": ["GET", "POST"], "authRequired": true },
    { "path": "/health", "methods": ["GET"], "authRequired": false }
  ],
  "limits": { "requestsPerMinute": 600, "burst": 100, "timeoutMs": 2500 },
  "owner": { "team": "payments", "contact": "payments@example.com" },
  "deprecatedAt": null
}`;

const BROKEN_SAMPLE = `{
  // deployment config
  service: 'checkout-api',
  version: "2.4.1",
  replicas: 3,
  healthy: True,
  tags: ["prod", "eu-west",],
  owner: { team: 'payments' },
}`;

type ViewMode = 'formatted' | 'tree' | 'flat';

export default function JsonTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useLocalStorage<string>('wt:json:indent', '2');
  const [sortKeys, setSortKeys] = useLocalStorage<'none' | 'asc' | 'desc'>('wt:json:sort', 'none');
  const [view, setView] = useState<ViewMode>('formatted');
  const [query, setQuery] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const debounced = useDebounced(input, 150);

  const parsed = useMemo(() => parseJson(debounced), [debounced]);

  const formatted = useMemo(() => {
    if (!parsed.ok) return '';
    try {
      return formatJson(parsed.value, {
        indent: indent === 'tab' ? 'tab' : Number(indent),
        sortKeys,
      });
    } catch (e) {
      return `Formatting failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [parsed, indent, sortKeys]);

  const stats = useMemo(
    () => (parsed.ok ? jsonStats(parsed.value, debounced) : null),
    [parsed, debounced],
  );

  const flat = useMemo(() => (parsed.ok ? flattenJson(parsed.value) : []), [parsed]);

  const queryResult = useMemo(() => {
    if (!parsed.ok || !query.trim()) return null;
    try {
      const results = queryJson(parsed.value, query);
      return { results, error: null as string | null };
    } catch (e) {
      return { results: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [parsed, query]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setReadError(null);
      try {
        setInput(await readFileAsText(file));
        push(`Loaded “${file.name}”.`, 'success');
      } catch (e) {
        setReadError(e instanceof Error ? e.message : String(e));
      }
    },
    [push],
  );

  const { dragging, handlers } = useDropZone(handleFiles);

  const jumpToError = (error: JsonError): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(error.offset, Math.min(error.offset + 1, input.length));
    // Scroll the caret roughly into view.
    const lineHeight = 21;
    textarea.scrollTop = Math.max(0, (error.line - 5) * lineHeight);
  };

  const repair = (): void => {
    const repaired = repairJson(input);
    const check = parseJson(repaired);
    if (check.ok) {
      setInput(formatJson(check.value, { indent: indent === 'tab' ? 'tab' : Number(indent), sortKeys: 'none' }));
      push('Repaired and reformatted.', 'success');
    } else {
      setInput(repaired);
      push(`Partially repaired — still invalid at line ${check.error.line}.`, 'warning');
    }
  };

  const applyFormatted = (): void => {
    if (parsed.ok) setInput(formatted);
  };

  const minify = (): void => {
    if (parsed.ok) setInput(JSON.stringify(parsed.value));
  };

  return (
    <ToolShell
      slug="json-formatter"
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={() => setInput(SAMPLE)}>
            <Wand2 size={14} aria-hidden />
            Sample
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setInput(BROKEN_SAMPLE)}
            title="Load an invalid document to try the repair function"
          >
            Broken sample
          </button>
        </>
      }
    >
      {readError && (
        <Callout tone="error" className="mb-3" onDismiss={() => setReadError(null)}>
          {readError}
        </Callout>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Input"
          actions={
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.jsonc,.json5,.txt,application/json,text/plain"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  void handleFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>
                <FileUp size={14} aria-hidden />
                <span className="hidden sm:inline">Open</span>
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={applyFormatted}
                disabled={!parsed.ok}
                title="Replace the input with the formatted output"
              >
                <AlignLeft size={14} aria-hidden />
                <span className="hidden sm:inline">Format</span>
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={minify}
                disabled={!parsed.ok}
                title="Replace the input with a minified version"
              >
                <Minimize2 size={14} aria-hidden />
                <span className="hidden sm:inline">Minify</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setInput('')}
                disabled={!input}
                aria-label="Clear input"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </>
          }
          bodyClassName="flex flex-col"
        >
          <div className="relative flex-1" {...handlers}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Paste JSON here. Broken JSON is fine — you will get the exact line and column, plus a repair button.'
              spellCheck={false}
              aria-label="JSON input"
              aria-invalid={input.trim() !== '' && !parsed.ok}
              className="code-area h-[46vh] min-h-56 w-full resize-y bg-transparent p-3 outline-none"
            />
            {dragging && (
              <div
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed text-sm font-medium"
                style={{
                  borderColor: 'var(--accent)',
                  background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                }}
              >
                Drop a .json file
              </div>
            )}
          </div>

          <div className="border-t p-3">
            {input.trim() === '' ? (
              <p className="muted text-xs">Waiting for input…</p>
            ) : parsed.ok ? (
              <Callout tone="success">
                Valid JSON.{' '}
                {stats && (
                  <>
                    {stats.values.toLocaleString()} values, {stats.keys.toLocaleString()} keys,{' '}
                    {stats.maxDepth} level{stats.maxDepth === 1 ? '' : 's'} deep.
                  </>
                )}
              </Callout>
            ) : (
              <Callout
                tone="error"
                title={`Line ${parsed.error.line}, column ${parsed.error.column}`}
              >
                <p>{parsed.error.message}</p>
                {parsed.error.hint && <p className="mt-1 italic">{parsed.error.hint}</p>}
                <ErrorContext source={input} error={parsed.error} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => jumpToError(parsed.error)}
                  >
                    Jump to the error
                  </button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={repair}>
                    <Wrench size={14} aria-hidden />
                    Try to repair
                  </button>
                </div>
              </Callout>
            )}
          </div>
        </Panel>

        <Panel
          title="Output"
          actions={
            <>
              <Segmented
                size="sm"
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: 'formatted', label: 'Formatted' },
                  { value: 'tree', label: 'Tree' },
                  { value: 'flat', label: 'Paths' },
                ]}
              />
              <CopyButton value={view === 'flat' ? flat.map(([p, v]) => `${p} = ${JSON.stringify(v)}`).join('\n') : formatted} small />
              <button
                type="button"
                className="btn btn-sm"
                disabled={!parsed.ok}
                onClick={() => downloadText(formatted, 'formatted.json', 'application/json')}
                aria-label="Download formatted JSON"
              >
                <Download size={14} aria-hidden />
              </button>
            </>
          }
          bodyClassName="flex flex-col"
        >
          <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="muted text-xs">Indent</span>
              <Segmented
                size="sm"
                label="Indentation"
                value={indent}
                onChange={setIndent}
                options={[
                  { value: '2', label: '2' },
                  { value: '4', label: '4' },
                  { value: 'tab', label: 'Tab' },
                  { value: '0', label: 'Min' },
                ]}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="muted text-xs">Keys</span>
              <Segmented
                size="sm"
                label="Key order"
                value={sortKeys}
                onChange={setSortKeys}
                options={[
                  { value: 'none', label: 'Original' },
                  { value: 'asc', label: 'A→Z' },
                  { value: 'desc', label: 'Z→A' },
                ]}
              />
            </div>
          </div>

          <div className="min-h-56 flex-1 overflow-auto">
            {!parsed.ok ? (
              <EmptyState
                icon={<Braces size={30} />}
                title={input.trim() ? 'Fix the input to see the output' : 'Nothing to show yet'}
                description={
                  input.trim()
                    ? 'The error above points at the exact character that needs attention.'
                    : 'Paste or drop JSON on the left and the formatted result appears here.'
                }
              />
            ) : view === 'formatted' ? (
              <pre className="code-area h-full overflow-auto p-3">{formatted}</pre>
            ) : view === 'tree' ? (
              <div className="p-3">
                <JsonTree value={parsed.value} name="$" depth={0} defaultOpen />
              </div>
            ) : (
              <div className="p-3">
                <table className="w-full text-left text-xs">
                  <thead className="muted">
                    <tr>
                      <th className="pb-1.5 pr-4 font-semibold">Path</th>
                      <th className="pb-1.5 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {flat.slice(0, 2000).map(([path, value], index) => (
                      <tr key={`${path}-${index}`} className="border-t">
                        <td className="py-1 pr-4 align-top break-all" style={{ color: 'var(--accent)' }}>
                          {path}
                        </td>
                        <td className="py-1 align-top break-all">{JSON.stringify(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {flat.length > 2000 && (
                  <p className="muted mt-2 text-xs">
                    Showing the first 2,000 of {flat.length.toLocaleString()} paths.
                  </p>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {parsed.ok && stats && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <Panel title="Query" description="Dot and bracket paths, with [*] to iterate." bodyClassName="p-3 space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                aria-hidden
              />
              <input
                type="text"
                className="field code-area !pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="endpoints[*].path"
                aria-label="JSON path query"
                spellCheck={false}
              />
            </div>
            {queryResult && (
              <>
                {queryResult.error ? (
                  <Callout tone="error">{queryResult.error}</Callout>
                ) : queryResult.results.length === 0 ? (
                  <p className="muted text-xs">No value matches that path.</p>
                ) : (
                  <>
                    <p className="muted text-xs">
                      {queryResult.results.length} result
                      {queryResult.results.length === 1 ? '' : 's'}
                    </p>
                    <pre className="surface-3 code-area max-h-56 overflow-auto rounded-lg border p-3">
                      {JSON.stringify(
                        queryResult.results.length === 1 ? queryResult.results[0] : queryResult.results,
                        null,
                        2,
                      )}
                    </pre>
                  </>
                )}
              </>
            )}
            {!query && (
              <p className="muted text-xs">
                Examples: <code className="font-mono">limits.burst</code> ·{' '}
                <code className="font-mono">endpoints[0]</code> ·{' '}
                <code className="font-mono">endpoints[*].methods</code>
              </p>
            )}
          </Panel>

          <Panel title="Document statistics" bodyClassName="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            <Stat label="Size" value={`${(stats.bytes / 1024).toFixed(1)} KB`} />
            <Stat label="Minified" value={`${(stats.minifiedBytes / 1024).toFixed(1)} KB`} tone="good" />
            <Stat label="Max depth" value={stats.maxDepth} />
            <Stat label="Objects" value={stats.objects.toLocaleString()} />
            <Stat label="Arrays" value={stats.arrays.toLocaleString()} />
            <Stat label="Keys" value={stats.keys.toLocaleString()} />
            <Stat label="Unique keys" value={stats.uniqueKeys.toLocaleString()} />
            <Stat label="Strings" value={stats.strings.toLocaleString()} />
            <Stat label="Numbers" value={stats.numbers.toLocaleString()} />
            <Stat label="Booleans" value={stats.booleans.toLocaleString()} />
            <Stat label="Nulls" value={stats.nulls.toLocaleString()} />
            <Stat label="Total values" value={stats.values.toLocaleString()} />
          </Panel>
        </div>
      )}

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}

/** Shows the offending line with a caret under the exact column. */
function ErrorContext({ source, error }: { source: string; error: JsonError }): React.ReactElement | null {
  const lines = source.split('\n');
  const line = lines[error.line - 1];
  if (line === undefined) return null;
  const start = Math.max(0, error.column - 40);
  const excerpt = line.slice(start, start + 80);
  const caretOffset = error.column - 1 - start;
  return (
    <pre className="surface-3 code-area mt-2 overflow-x-auto rounded border p-2 text-[0.7rem] leading-tight">
      {excerpt || '(empty line)'}
      {'\n'}
      {' '.repeat(Math.max(0, caretOffset))}
      <span style={{ color: 'var(--danger)' }}>▲</span>
    </pre>
  );
}

/* -------------------------------------------------------------------------- */

interface TreeProps {
  value: unknown;
  name: string;
  depth: number;
  defaultOpen?: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  string: 'var(--ok)',
  number: 'var(--warn)',
  boolean: 'var(--accent)',
  null: 'var(--text-muted)',
};

function JsonTree({ value, name, depth, defaultOpen }: TreeProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);

  if (value === null || typeof value !== 'object') {
    const type = value === null ? 'null' : typeof value;
    return (
      <div className="code-area flex gap-2 py-0.5" style={{ paddingLeft: depth * 14 }}>
        <span className="shrink-0" style={{ color: 'var(--accent)' }}>
          {name}:
        </span>
        <span className="break-all" style={{ color: TYPE_COLOR[type] ?? 'var(--text)' }}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="code-area flex w-full items-center gap-1.5 py-0.5 text-left hover:opacity-75"
        style={{ paddingLeft: depth * 14 }}
        aria-expanded={open}
      >
        <span className="muted w-3 shrink-0 text-center">{open ? '▾' : '▸'}</span>
        <span style={{ color: 'var(--accent)' }}>{name}</span>
        <span className="muted">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open &&
        entries.map(([key, child]) => (
          <JsonTree key={key} value={child} name={key} depth={depth + 1} />
        ))}
    </div>
  );
}
