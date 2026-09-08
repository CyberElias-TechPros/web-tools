import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileImage,
  ImageDown,
  Package,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  EmptyState,
  FieldGroup,
  Panel,
  Segmented,
  Slider,
  Stat,
  Toasts,
  Toggle,
  useToasts,
} from '@/components/ui';
import {
  MAX_FILE_BYTES,
  SUPPORTED_INPUT_TYPES,
  compressImage,
  defaultCompressOptions,
  extensionForType,
  formatBytes,
  resolveOutputType,
  savingsPercent,
} from '@/lib/image';
import type { CompressOptions } from '@/lib/image';
import { createZip } from '@/lib/zip';
import { downloadBlob, safeFilename, timestampSuffix } from '@/lib/files';
import { useDropZone, useLocalStorage } from '@/hooks';

type ItemStatus = 'queued' | 'processing' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  result?: { blob: Blob; width: number; height: number; type: string };
  previewUrl?: string;
  outputName?: string;
}

let idCounter = 0;
const nextId = (): string => `img-${++idCounter}-${Date.now().toString(36)}`;

export default function ImageTool(): React.ReactElement {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [options, setOptions] = useLocalStorage<CompressOptions>(
    'wt:image:options',
    defaultCompressOptions,
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const { toasts, push, dismiss } = useToasts();

  // Revoke object URLs when items disappear, so long sessions do not leak memory.
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      setGlobalError(null);
      const accepted: QueueItem[] = [];
      const rejected: string[] = [];

      for (const file of files) {
        const isImage = file.type.startsWith('image/') || SUPPORTED_INPUT_TYPES.includes(file.type);
        if (!isImage) {
          rejected.push(`${file.name} is not an image (${file.type || 'unknown type'})`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(MAX_FILE_BYTES)} limit`);
          continue;
        }
        accepted.push({ id: nextId(), file, status: 'queued' });
      }

      if (accepted.length) {
        setItems((prev) => [...prev, ...accepted].slice(0, 300));
        push(`Added ${accepted.length} image${accepted.length === 1 ? '' : 's'}.`, 'success');
      }
      if (rejected.length) {
        setGlobalError(
          `${rejected.length} file${rejected.length === 1 ? ' was' : 's were'} skipped: ${rejected.slice(0, 3).join('; ')}${rejected.length > 3 ? `; and ${rejected.length - 3} more` : ''}.`,
        );
      }
    },
    [push],
  );

  const { dragging, handlers } = useDropZone(addFiles);

  const processAll = useCallback(async () => {
    const queue = items.filter((item) => item.status === 'queued' || item.status === 'error');
    if (queue.length === 0) return;

    cancelRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: queue.length });

    let completed = 0;
    // Sequential on purpose: parallel canvas encodes of large images reliably
    // exhaust memory on mobile Safari and produce blank output.
    for (const item of queue) {
      if (cancelRef.current) break;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'processing' } : i)));
      try {
        const result = await compressImage(item.file, options);
        const outputType = resolveOutputType(item.file.type, options.format);
        const baseName = item.file.name.replace(/\.[^.]+$/, '');
        const outputName = `${baseName}.${extensionForType(outputType)}`;
        const previewUrl = URL.createObjectURL(result.blob);
        urlsRef.current.add(previewUrl);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'done',
                  result: { blob: result.blob, width: result.width, height: result.height, type: result.type },
                  previewUrl,
                  outputName,
                }
              : i,
          ),
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', error: e instanceof Error ? e.message : String(e) }
              : i,
          ),
        );
      }
      completed++;
      setProgress({ done: completed, total: queue.length });
      // Yield so the progress bar actually paints between images.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    setRunning(false);
    if (cancelRef.current) push('Processing cancelled.', 'warning');
  }, [items, options, push]);

  const removeItem = (id: string): void => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        urlsRef.current.delete(item.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = (): void => {
    items.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        urlsRef.current.delete(item.previewUrl);
      }
    });
    setItems([]);
    setProgress({ done: 0, total: 0 });
  };

  const downloadOne = (item: QueueItem): void => {
    if (!item.result) return;
    downloadBlob(item.result.blob, item.outputName ?? item.file.name);
  };

  const downloadZip = async (): Promise<void> => {
    const done = items.filter((item) => item.status === 'done' && item.result);
    if (done.length === 0) return;
    try {
      push('Building the archive…', 'info');
      const used = new Set<string>();
      const entries = await Promise.all(
        done.map(async (item) => {
          let name = item.outputName ?? item.file.name;
          let counter = 2;
          while (used.has(name.toLowerCase())) {
            const dot = name.lastIndexOf('.');
            name = dot > 0 ? `${name.slice(0, dot)}-${counter}${name.slice(dot)}` : `${name}-${counter}`;
            counter++;
          }
          used.add(name.toLowerCase());
          return {
            name,
            data: new Uint8Array(await item.result!.blob.arrayBuffer()),
            date: new Date(item.file.lastModified),
          };
        }),
      );
      const zip = await createZip(entries);
      downloadBlob(zip, `${safeFilename('compressed-images')}-${timestampSuffix()}.zip`);
      push(`Downloaded ${entries.length} image${entries.length === 1 ? '' : 's'} as a ZIP.`, 'success');
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e));
    }
  };

  const set = <K extends keyof CompressOptions>(key: K, value: CompressOptions[K]): void =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const totals = useMemo(() => {
    const done = items.filter((item) => item.status === 'done' && item.result);
    const before = done.reduce((sum, item) => sum + item.file.size, 0);
    const after = done.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);
    return { count: done.length, before, after, saved: before - after };
  }, [items]);

  const queuedCount = items.filter((item) => item.status === 'queued' || item.status === 'error').length;
  const isLossless = options.format === 'image/png';

  return (
    <ToolShell
      slug="image-compressor"
      wide
      actions={
        <>
          {items.length > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll} disabled={running}>
              <Trash2 size={14} aria-hidden />
              Clear
            </button>
          )}
          {running ? (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              <X size={14} aria-hidden />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void processAll()}
              disabled={queuedCount === 0}
            >
              <Play size={14} aria-hidden />
              Compress {queuedCount > 0 && `(${queuedCount})`}
            </button>
          )}
        </>
      }
    >
      {globalError && (
        <Callout tone="warning" className="mb-3" onDismiss={() => setGlobalError(null)}>
          {globalError}
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="Output settings" bodyClassName="space-y-4 p-4">
          <FieldGroup
            label="Format"
            hint={
              options.format === 'image/webp'
                ? 'WebP is 25–35% smaller than JPEG at the same quality and is supported everywhere that matters.'
                : options.format === 'image/png'
                  ? 'PNG is lossless — the quality slider does not apply.'
                  : undefined
            }
          >
            <Segmented
              size="sm"
              value={options.format}
              onChange={(v) => set('format', v)}
              options={[
                { value: 'image/webp', label: 'WebP' },
                { value: 'image/jpeg', label: 'JPEG' },
                { value: 'image/png', label: 'PNG' },
                { value: 'original', label: 'Keep' },
              ]}
            />
          </FieldGroup>

          {!isLossless && (
            <Slider
              label="Quality"
              min={0.1}
              max={1}
              step={0.01}
              value={options.quality}
              onChange={(v) => set('quality', v)}
              format={(v) => `${Math.round(v * 100)}%`}
              hint={
                options.quality > 0.92
                  ? 'Above 92% the file grows quickly for almost no visible gain.'
                  : options.quality < 0.5
                    ? 'Below 50% compression artefacts become clearly visible.'
                    : undefined
              }
            />
          )}

          <FieldGroup label="Resize">
            <Segmented
              size="sm"
              value={options.resizeMode}
              onChange={(v) => set('resizeMode', v)}
              options={[
                { value: 'none', label: 'None' },
                { value: 'max-dimension', label: 'Max side' },
                { value: 'fit', label: 'Fit box' },
                { value: 'exact-width', label: 'Width' },
                { value: 'percentage', label: 'Scale' },
              ]}
            />
          </FieldGroup>

          {(options.resizeMode === 'max-dimension' || options.resizeMode === 'exact-width') && (
            <FieldGroup
              label={options.resizeMode === 'max-dimension' ? 'Longest side (px)' : 'Width (px)'}
              htmlFor="max-w"
            >
              <input
                id="max-w"
                type="number"
                className="field"
                min={16}
                max={10000}
                value={options.maxWidth}
                onChange={(e) => set('maxWidth', Math.max(16, Math.min(10000, Number(e.target.value) || 16)))}
              />
            </FieldGroup>
          )}

          {options.resizeMode === 'fit' && (
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Max width" htmlFor="fit-w">
                <input
                  id="fit-w"
                  type="number"
                  className="field"
                  min={16}
                  value={options.maxWidth}
                  onChange={(e) => set('maxWidth', Math.max(16, Number(e.target.value) || 16))}
                />
              </FieldGroup>
              <FieldGroup label="Max height" htmlFor="fit-h">
                <input
                  id="fit-h"
                  type="number"
                  className="field"
                  min={16}
                  value={options.maxHeight}
                  onChange={(e) => set('maxHeight', Math.max(16, Number(e.target.value) || 16))}
                />
              </FieldGroup>
            </div>
          )}

          {options.resizeMode === 'percentage' && (
            <Slider
              label="Scale"
              min={5}
              max={200}
              value={options.percentage}
              onChange={(v) => set('percentage', v)}
              format={(v) => `${v}%`}
            />
          )}

          {options.resizeMode !== 'none' && (
            <Toggle
              checked={options.preventUpscale}
              onChange={(v) => set('preventUpscale', v)}
              label="Never enlarge"
              hint="Upscaling adds bytes without adding detail."
            />
          )}

          <FieldGroup
            label="Target file size"
            hint="Repeatedly re-encodes at lower quality until the file fits. 0 disables it."
            htmlFor="target-kb"
          >
            <div className="flex items-center gap-2">
              <input
                id="target-kb"
                type="number"
                className="field"
                min={0}
                max={20000}
                step={10}
                value={options.targetSizeKb}
                disabled={isLossless}
                onChange={(e) => set('targetSizeKb', Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="muted shrink-0 text-sm">KB</span>
            </div>
          </FieldGroup>

          {(options.format === 'image/jpeg' ||
            (options.format === 'original' && items.some((i) => i.file.type === 'image/png'))) && (
            <FieldGroup label="Transparency background" hint="JPEG has no alpha channel.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={options.backgroundColor}
                  onChange={(e) => set('backgroundColor', e.target.value)}
                  className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
                  aria-label="Background colour for transparent areas"
                />
                <code className="muted font-mono text-xs">{options.backgroundColor}</code>
              </div>
            </FieldGroup>
          )}

          <button
            type="button"
            className="btn btn-sm w-full"
            onClick={() => setOptions(defaultCompressOptions)}
          >
            <RotateCcw size={14} aria-hidden />
            Reset to defaults
          </button>
        </Panel>

        <div className="min-w-0 space-y-4">
          <div
            {...handlers}
            className="card grid place-items-center border-2 border-dashed p-8 text-center transition-colors"
            style={
              dragging
                ? {
                    borderColor: 'var(--accent)',
                    background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
                  }
                : undefined
            }
          >
            <ImageDown size={30} className="muted mb-2 opacity-50" aria-hidden />
            <p className="text-sm font-medium">Drop images here, or</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button type="button" className="btn btn-primary mt-2" onClick={() => fileInput.current?.click()}>
              Choose files
            </button>
            <p className="muted mt-2 text-xs">
              JPEG, PNG, WebP, GIF, AVIF and BMP · up to {formatBytes(MAX_FILE_BYTES)} each · up to
              300 files · never uploaded
            </p>
          </div>

          {running && (
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">
                  Compressing {progress.done + 1} of {progress.total}…
                </span>
                <span className="muted font-mono text-xs">
                  {Math.round((progress.done / Math.max(1, progress.total)) * 100)}%
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: 'var(--surface-3)' }}
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(progress.done / Math.max(1, progress.total)) * 100}%`,
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>
          )}

          {totals.count > 0 && (
            <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Stat label="Compressed" value={totals.count} />
              <Stat label="Before" value={formatBytes(totals.before)} />
              <Stat label="After" value={formatBytes(totals.after)} tone="good" />
              <Stat
                label="Saved"
                value={`${formatBytes(totals.saved)} (${savingsPercent(totals.before, totals.after)}%)`}
                tone={totals.saved > 0 ? 'good' : 'bad'}
              />
            </div>
          )}

          <Panel
            title={`Queue${items.length ? ` (${items.length})` : ''}`}
            actions={
              totals.count > 0 ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void downloadZip()}>
                  <Package size={14} aria-hidden />
                  Download all as ZIP
                </button>
              ) : null
            }
            bodyClassName="p-0"
          >
            {items.length === 0 ? (
              <EmptyState
                icon={<FileImage size={30} />}
                title="No images queued"
                description="Add images above. They are decoded, resized and re-encoded entirely on your device — no upload, no queue, no server."
              />
            ) : (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border"
                      style={{ background: 'var(--surface-3)' }}
                    >
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <FileImage size={18} className="muted" aria-hidden />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <p className="muted text-xs">
                        {formatBytes(item.file.size)}
                        {item.result && (
                          <>
                            {' → '}
                            <span style={{ color: 'var(--ok)' }}>{formatBytes(item.result.blob.size)}</span>
                            {' · '}
                            {item.result.width}×{item.result.height}
                            {' · '}
                            <span
                              style={{
                                color:
                                  savingsPercent(item.file.size, item.result.blob.size) > 0
                                    ? 'var(--ok)'
                                    : 'var(--warn)',
                              }}
                            >
                              {savingsPercent(item.file.size, item.result.blob.size) > 0
                                ? `${savingsPercent(item.file.size, item.result.blob.size)}% smaller`
                                : `${-savingsPercent(item.file.size, item.result.blob.size)}% larger`}
                            </span>
                          </>
                        )}
                      </p>
                      {item.status === 'error' && (
                        <p className="text-xs" style={{ color: 'var(--danger)' }}>
                          {item.error}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.status === 'processing' && (
                        <span className="muted text-xs">Working…</span>
                      )}
                      {item.status === 'queued' && <span className="chip">Queued</span>}
                      {item.status === 'done' && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => downloadOne(item)}
                          aria-label={`Download ${item.outputName}`}
                        >
                          <Download size={13} aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => removeItem(item.id)}
                        disabled={running}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {totals.count > 0 && savingsPercent(totals.before, totals.after) < 0 && (
            <Callout tone="warning" title="The output is larger than the input">
              This usually means the source was already well optimised, or you converted a photo to
              PNG. Try WebP at 80% quality, or lower the quality slider.
            </Callout>
          )}
        </div>
      </div>

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}
