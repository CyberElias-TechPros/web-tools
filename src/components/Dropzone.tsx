import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { FileUp, FolderOpen, X } from 'lucide-react';
import { useDropZone } from '@/hooks';
import { formatBytes } from '@/lib/image';
import { m, AnimatePresence, EASE_OUT_EXPO } from '@/components/motion';

interface DropzoneProps {
  onFiles: (files: File[]) => void | Promise<void>;
  /** `accept` attribute for the hidden file input, e.g. ".pdf,application/pdf". */
  accept?: string;
  multiple?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Compact variant for when files are already loaded. */
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  /** Label for the browse button, also the accessible name of the input. */
  buttonLabel?: string;
}

export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  title,
  description,
  icon,
  compact,
  className = '',
  disabled,
  buttonLabel,
}: DropzoneProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const { dragging, handlers } = useDropZone(onFiles);
  const label = buttonLabel ?? (multiple ? 'Choose files' : 'Choose a file');

  return (
    <div
      {...handlers}
      className={`relative overflow-hidden rounded-[var(--radius-card)] border border-dashed transition-all duration-300 ${
        compact ? 'p-3' : 'p-8 sm:p-10'
      } ${dragging ? 'scale-[1.01]' : ''} ${className}`}
      style={{
        borderColor: dragging ? 'var(--accent)' : 'var(--line-strong)',
        background: dragging
          ? 'color-mix(in oklab, var(--accent) 10%, transparent)'
          : 'color-mix(in oklab, var(--surface-2) 60%, transparent)',
        boxShadow: dragging ? '0 0 0 4px color-mix(in oklab, var(--accent) 18%, transparent), 0 20px 60px -20px var(--glow)' : undefined,
      }}
      data-dragging={dragging || undefined}
    >
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void onFiles(files);
        }}
      />
      <div className={`relative flex ${compact ? 'flex-row items-center gap-3' : 'flex-col items-center gap-3 text-center'}`}>
        <m.div
          className={`grid shrink-0 place-items-center rounded-2xl ${compact ? 'h-9 w-9' : 'h-14 w-14'}`}
          style={{
            background: 'color-mix(in oklab, var(--accent) 16%, transparent)',
            color: 'var(--accent)',
            boxShadow: '0 10px 30px -12px var(--glow)',
          }}
          animate={dragging ? { scale: 1.1, rotate: -6 } : { scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          aria-hidden
        >
          {icon ?? <FileUp size={compact ? 18 : 26} />}
        </m.div>
        <div className={compact ? 'min-w-0 flex-1' : ''}>
          <p className={`font-semibold ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
            {title ?? (dragging ? 'Release to add' : multiple ? 'Drop files here' : 'Drop a file here')}
          </p>
          {description && <p className="muted mt-0.5 text-xs leading-relaxed sm:text-sm">{description}</p>}
        </div>
        <button
          type="button"
          className={`btn ${compact ? 'btn-sm' : 'btn-primary mt-1'}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <FolderOpen size={15} aria-hidden />
          {label}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* File list                                                                  */
/* -------------------------------------------------------------------------- */

export interface FileListItem {
  id: string;
  name: string;
  size: number;
  /** Extra info such as page count or dimensions. */
  meta?: ReactNode;
  /** Optional thumbnail URL. */
  thumb?: string;
  status?: 'ready' | 'busy' | 'error';
  error?: string;
}

interface FileListProps {
  items: FileListItem[];
  onRemove?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
  emptyText?: string;
  dense?: boolean;
}

export function FileList({ items, onRemove, onMove, emptyText, dense }: FileListProps): React.ReactElement {
  if (!items.length) {
    return <p className="muted px-1 py-3 text-center text-xs">{emptyText ?? 'No files yet.'}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Files">
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <m.li
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
            className={`card flex items-center gap-3 ${dense ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
            style={item.status === 'error' ? { borderColor: 'color-mix(in oklab, var(--danger) 50%, transparent)' } : undefined}
          >
            {item.thumb ? (
              <img src={item.thumb} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="muted grid h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-[0.6rem] font-semibold uppercase surface-3">
                {item.name.split('.').pop()?.slice(0, 4) || 'file'}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
              <p className="muted flex flex-wrap items-center gap-x-2 text-xs">
                <span className="font-mono tabular-nums">{formatBytes(item.size)}</span>
                {item.meta && <span>{item.meta}</span>}
                {item.status === 'busy' && <span style={{ color: 'var(--accent)' }}>Working…</span>}
                {item.status === 'error' && <span style={{ color: 'var(--danger)' }}>{item.error ?? 'Failed'}</span>}
              </p>
            </div>
            {onMove && (
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !px-1.5"
                  onClick={() => onMove(item.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.name} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !px-1.5"
                  onClick={() => onMove(item.id, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${item.name} down`}
                >
                  ↓
                </button>
              </div>
            )}
            {onRemove && (
              <button
                type="button"
                className="btn btn-ghost btn-sm !px-1.5"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

let fileCounter = 0;
/** Stable ids for file objects (File has none). */
export function fileId(): string {
  fileCounter += 1;
  return `f${Date.now().toString(36)}${fileCounter}`;
}
