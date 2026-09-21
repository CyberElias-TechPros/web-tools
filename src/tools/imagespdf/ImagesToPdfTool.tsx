import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, NumberField, Panel, ProgressBar, Segmented, Stat, TextField, Toggle } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { defaultImagesToPdfOptions, imagesToPdf } from '@/lib/pdf-ops';
import type { ImagesToPdfOptions } from '@/lib/pdf-ops';
import { rasterizeToPng } from '@/lib/canvas';
import { formatBytes } from '@/lib/image';

interface Item {
  id: string;
  file: File;
  url: string;
  data?: Uint8Array;
  type?: 'image/png' | 'image/jpeg';
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

let counter = 0;

export default function ImagesToPdfTool(): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<ImagesToPdfOptions>(defaultImagesToPdfOptions);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items]);

  const onFiles = async (files: File[]): Promise<void> => {
    setResult(null);
    const fresh: Item[] = files.map((file) => ({ id: `img${++counter}`, file, url: URL.createObjectURL(file), status: 'loading' }));
    setItems((prev) => [...prev, ...fresh]);
    for (const item of fresh) {
      try {
        const raw = new Uint8Array(await item.file.arrayBuffer());
        let data: Uint8Array = raw;
        let type: 'image/png' | 'image/jpeg';
        if (item.file.type === 'image/jpeg') type = 'image/jpeg';
        else if (item.file.type === 'image/png') type = 'image/png';
        else {
          const png = await rasterizeToPng(raw, item.file.type || 'image/*');
          if (!png) throw new Error('Unsupported image format');
          data = png.data;
          type = 'image/png';
        }
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, data, type, status: 'ready' } : i)));
      } catch (e) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'Could not read image' } : i)));
      }
    }
  };

  const move = (id: string, dir: -1 | 1): void =>
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
      return copy;
    });

  const ready = items.filter((i) => i.status === 'ready' && i.data && i.type);
  const set = <K extends keyof ImagesToPdfOptions>(key: K, value: ImagesToPdfOptions[K]): void => setOptions((o) => ({ ...o, [key]: value }));

  const build = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setResult(await imagesToPdf(ready.map((i) => ({ data: i.data!, type: i.type!, name: i.file.name })), { ...options, background: options.background.replace('#', '') }, (d, t) => setProgress([d, t])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <ToolShell slug="images-to-pdf">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} multiple accept="image/*" title="Drop images" description="PNG, JPEG, WebP, GIF, BMP, AVIF, SVG — one page per image" />
          <Panel title="Page layout">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Page size" value={options.pageMode} onChange={(v) => set('pageMode', v)} options={[{ value: 'fit-a4', label: 'A4' }, { value: 'fit-letter', label: 'Letter' }, { value: 'image-size', label: 'Image size' }]} size="sm" />
              {options.pageMode !== 'image-size' && (
                <>
                  <Segmented label="Orientation" value={options.orientation} onChange={(v) => set('orientation', v)} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} size="sm" />
                  <NumberField label="Margin" value={options.margin} onChange={(v) => set('margin', v)} min={0} max={144} suffix="pt" />
                  <Toggle checked={options.upscale} onChange={(v) => set('upscale', v)} label="Enlarge small images to fill the page" />
                </>
              )}
              <ColorField label="Page background" value={`#${options.background.replace('#', '')}`} onChange={(v) => set('background', v.replace('#', ''))} />
              <TextField label="Document title (optional)" value={options.title ?? ''} onChange={(v) => set('title', v)} placeholder="Photos" />
              <button type="button" className="btn btn-primary" onClick={() => void build()} disabled={!ready.length || busy || items.some((i) => i.status === 'loading')}>
                {busy ? 'Building…' : `Create PDF (${ready.length} page${ready.length === 1 ? '' : 's'})`}
              </button>
              {progress && <ProgressBar value={progress[0]} max={progress[1]} label="Embedding" showValue />}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title={items.length ? `${items.length} image${items.length === 1 ? '' : 's'}` : 'Images'} actions={items.length ? <button type="button" className="btn btn-sm" onClick={() => { setItems([]); setResult(null); }}>Clear</button> : undefined}>
            {items.length ? (
              <ol className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((i, idx) => (
                  <li key={i.id} className="card flex flex-col gap-2 p-2">
                    <span className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg">
                      <img src={i.url} alt="" className="max-h-full max-w-full object-contain" />
                    </span>
                    <span className="truncate text-xs" title={i.file.name}>{idx + 1}. {i.file.name}</span>
                    <span className="muted text-xs">{formatBytes(i.file.size)}{i.status === 'loading' ? ' · reading…' : ''}{i.status === 'error' ? ` · ${i.error}` : ''}</span>
                    <span className="flex justify-between gap-1">
                      <button type="button" className="btn btn-sm !px-2" onClick={() => move(i.id, -1)} disabled={idx === 0} aria-label={`Move ${i.file.name} earlier`}>←</button>
                      <button type="button" className="btn btn-sm !px-2" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.file.name}`}>✕</button>
                      <button type="button" className="btn btn-sm !px-2" onClick={() => move(i.id, 1)} disabled={idx === items.length - 1} aria-label={`Move ${i.file.name} later`}>→</button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted p-4 text-sm">Drop a batch of photos or scans. Reorder them, choose a page size, and download a single PDF. JPEGs are embedded as-is (no re-encoding), everything else is converted to lossless PNG.</p>
            )}
          </Panel>
          {error && <Callout tone="error">{error}</Callout>}
          {result && (
            <PdfResult bytes={result} filename={`${options.title?.trim() || 'images'}.pdf`} pageCount={ready.length}>
              <div className="flex gap-6"><Stat label="Source size" value={formatBytes(ready.reduce((s, i) => s + i.file.size, 0))} /></div>
            </PdfResult>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
