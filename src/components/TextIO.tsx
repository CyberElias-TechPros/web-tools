import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { ClipboardPaste, Download, Eraser, FileUp, Sparkles } from 'lucide-react';
import { CopyButton } from '@/components/ui';
import { downloadText, readFileAsText, readFromClipboard } from '@/lib/files';

/* -------------------------------------------------------------------------- */
/* Text input panel                                                           */
/* -------------------------------------------------------------------------- */

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Sample text inserted by the "Sample" button. */
  sample?: string;
  /** Accept attribute for the load-file button; omit to hide it. */
  accept?: string;
  rows?: number;
  mono?: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  spellCheck?: boolean;
  /** Fill the available height (for two-column layouts). */
  fill?: boolean;
}

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  sample,
  accept,
  rows = 12,
  mono = true,
  actions,
  footer,
  className = '',
  invalid,
  autoFocus,
  spellCheck = false,
  fill,
}: TextInputProps): React.ReactElement {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className={`card flex min-w-0 flex-col overflow-hidden ${fill ? 'h-full' : ''} ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {actions}
          {sample !== undefined && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(sample)} title="Insert sample text">
              <Sparkles size={14} aria-hidden />
              Sample
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const text = await readFromClipboard();
              if (text !== null) onChange(text);
            }}
            title="Paste from clipboard"
          >
            <ClipboardPaste size={14} aria-hidden />
            Paste
          </button>
          {accept && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                className="sr-only"
                aria-label={`Load ${label.toLowerCase()} from a file`}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onChange(await readFileAsText(file));
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} title="Load from file">
                <FileUp size={14} aria-hidden />
                File
              </button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')} disabled={!value} title="Clear">
            <Eraser size={14} aria-hidden />
            Clear
          </button>
        </div>
      </header>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={spellCheck}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className={`w-full flex-1 resize-y bg-transparent px-3 py-2.5 outline-none ${mono ? 'code-area' : 'text-sm leading-relaxed'} ${fill ? 'min-h-[16rem]' : ''}`}
      />
      <footer className="muted flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-xs">
        <span className="font-mono tabular-nums">
          {value.length.toLocaleString()} chars · {value ? value.split(/\r?\n/).length.toLocaleString() : 0} lines
        </span>
        {footer}
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Text output panel                                                          */
/* -------------------------------------------------------------------------- */

interface TextOutputProps {
  value: string;
  label: string;
  /** File name for the download button; omit to hide it. */
  filename?: string;
  mime?: string;
  rows?: number;
  mono?: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
  placeholder?: string;
  className?: string;
  wrap?: boolean;
  fill?: boolean;
  /** Render as a <pre> instead of a textarea (better for very long text). */
  pre?: boolean;
}

export function TextOutput({
  value,
  label,
  filename,
  mime = 'text/plain',
  rows = 12,
  mono = true,
  actions,
  footer,
  placeholder = 'Output appears here.',
  className = '',
  wrap = true,
  fill,
  pre,
}: TextOutputProps): React.ReactElement {
  const id = useId();
  return (
    <section className={`card flex min-w-0 flex-col overflow-hidden ${fill ? 'h-full' : ''} ${className}`} aria-live="polite">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {actions}
          {filename && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!value}
              onClick={() => downloadText(value, filename, mime)}
              title={`Download ${filename}`}
            >
              <Download size={14} aria-hidden />
              Download
            </button>
          )}
          <CopyButton value={value} small />
        </div>
      </header>
      {pre ? (
        <pre
          id={id}
          tabIndex={0}
          className={`flex-1 overflow-auto px-3 py-2.5 ${mono ? 'code-area' : 'text-sm leading-relaxed'} ${wrap ? 'whitespace-pre-wrap break-words' : ''} ${fill ? 'min-h-[16rem]' : ''}`}
          style={{ maxHeight: fill ? undefined : `${rows * 1.6}em` }}
        >
          {value || <span className="muted">{placeholder}</span>}
        </pre>
      ) : (
        <textarea
          id={id}
          value={value}
          readOnly
          rows={rows}
          placeholder={placeholder}
          spellCheck={false}
          wrap={wrap ? 'soft' : 'off'}
          className={`w-full flex-1 resize-y bg-transparent px-3 py-2.5 outline-none ${mono ? 'code-area' : 'text-sm leading-relaxed'} ${fill ? 'min-h-[16rem]' : ''}`}
        />
      )}
      <footer className="muted flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-xs">
        <span className="font-mono tabular-nums">
          {value.length.toLocaleString()} chars · {new TextEncoder().encode(value).length.toLocaleString()} bytes
        </span>
        {footer}
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small result primitives                                                    */
/* -------------------------------------------------------------------------- */

export interface KeyValueRow {
  key: string;
  value: ReactNode;
  /** Copyable raw string; when set a copy button appears. */
  copy?: string;
  mono?: boolean;
  tone?: 'default' | 'good' | 'bad' | 'warn';
}

const TONE_COLOR: Record<NonNullable<KeyValueRow['tone']>, string | undefined> = {
  default: undefined,
  good: 'var(--ok)',
  bad: 'var(--danger)',
  warn: 'var(--warn)',
};

/** Definition list of label/value rows with per-row copy buttons. */
export function KeyValue({ rows, className = '', dense }: { rows: KeyValueRow[]; className?: string; dense?: boolean }): React.ReactElement {
  return (
    <dl className={`divide-y ${className}`}>
      {rows.map((row) => (
        <div key={row.key} className={`flex items-start gap-3 ${dense ? 'py-1.5' : 'py-2.5'}`}>
          <dt className="muted w-36 shrink-0 pt-0.5 text-xs font-medium sm:w-44">{row.key}</dt>
          <dd
            className={`min-w-0 flex-1 break-words text-sm ${row.mono !== false ? 'font-mono tabular-nums' : ''}`}
            style={row.tone ? { color: TONE_COLOR[row.tone] } : undefined}
          >
            {row.value}
          </dd>
          {row.copy !== undefined && (
            <CopyButton value={row.copy} label="" small className="!min-h-7 shrink-0 !px-1.5" />
          )}
        </div>
      ))}
    </dl>
  );
}

interface DataTableProps {
  headers: string[];
  rows: ReactNode[][];
  caption?: string;
  className?: string;
  maxHeight?: string;
  mono?: boolean;
}

export function DataTable({ headers, rows, caption, className = '', maxHeight = '28rem', mono }: DataTableProps): React.ReactElement {
  return (
    <div className={`overflow-auto rounded-xl border ${className}`} style={{ maxHeight }}>
      <table className={`w-full border-collapse text-left text-xs ${mono ? 'font-mono' : ''}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-3)' }}>
          <tr>
            {headers.map((h, i) => (
              <th key={`${h}-${i}`} scope="col" className="whitespace-nowrap border-b px-2.5 py-1.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="odd:bg-[color-mix(in_oklab,var(--surface-3)_35%,transparent)]">
              {row.map((cell, c) => (
                <td key={c} className="max-w-[24rem] truncate border-b px-2.5 py-1.5 align-top tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two-column responsive workspace used by most text tools. */
export function Workspace({ children, className = '' }: { children: ReactNode; className?: string }): React.ReactElement {
  return <div className={`grid gap-4 lg:grid-cols-2 ${className}`}>{children}</div>;
}

/** Options bar rendered above a workspace. */
export function OptionsBar({ children, className = '' }: { children: ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`card mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-3 ${className}`}>{children}</div>
  );
}

/** Big highlighted primary result. */
export function HeroResult({
  label,
  value,
  copy,
  sub,
  className = '',
}: {
  label: string;
  value: ReactNode;
  copy?: string;
  sub?: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={`card relative overflow-hidden p-5 ${className}`}
      style={{
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--accent) 14%, var(--surface-2)), color-mix(in oklab, var(--accent-2) 10%, var(--surface-2)))',
      }}
    >
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="mt-1.5 break-all font-mono text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
          {sub && <div className="muted mt-1.5 text-xs">{sub}</div>}
        </div>
        {copy !== undefined && <CopyButton value={copy} small className="shrink-0" />}
      </div>
    </div>
  );
}
