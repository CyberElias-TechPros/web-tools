import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, Panel, ProgressBar, Segmented, Stat } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { canvasToBlob, decodeImage, drawToCanvas, releaseImage, sizeOf, supportsEncoding } from '@/lib/canvas';
import { extensionForType, formatBytes, savingsPercent } from '@/lib/image';
import { downloadBlob } from '@/lib/files';
import { createZip } from '@/lib/zip';

type Target = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

interface Item {
  id: string;
  file: File;
  status: 'pending' | 'done' | 'error';
  result?: { blob: Blob; width: number; height: number; url: string };
  error?: string;
}

let counter = 0;

export default function ImageConvertTool(): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<Target>('image/webp');
  const [quality, setQuality] = useState(0.9);
  const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const avif = supportsEncoding('image/avif');

  useEffect(() => () => items.forEach((i) => i.result && URL.revokeObjectURL(i.result.url)), [items]);

  const convert = async (files: File[]): Promise<void> => {
    const fresh: Item[] = files.map((file) => ({ id: `i${++counter}`, file, status: 'pending' }));
    setItems((prev) => [...fresh, ...prev]);
    setBusy(true);
    for (const item of fresh) {
      try {
        const img = await decodeImage(item.file);
        const size = sizeOf(img);
        const canvas = drawToCanvas(img, size, target === 'image/jpeg' ? background : null);
        releaseImage(img);
        const blob = await canvasToBlob(canvas, target, quality);
        const url = URL.createObjectURL(blob);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'done', result: { blob, width: size.width, height: size.height, url } } : i)));
      } catch (e) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'Could not decode this file.' } : i)));
      }
    }
    setBusy(false);
  };

  const nameFor = (item: Item): string => `${item.file.name.replace(/\.[^.]+$/, '')}.${extensionForType(target)}`;
  const done = items.filter((i) => i.status === 'done');

  const downloadAll = async (): Promise<void> => {
    if (done.length === 1) {
      downloadBlob(done[0]!.result!.blob, nameFor(done[0]!));
      return;
    }
    const entries = await Promise.all(done.map(async (i) => ({ name: nameFor(i), data: new Uint8Array(await i.result!.blob.arrayBuffer()) })));
    downloadBlob(await createZip(entries), 'converted-images.zip');
  };

  return (
    <ToolShell slug="image-converter">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented label="Convert to" value={target} onChange={setTarget} options={[{ value: 'image/webp', label: 'WebP' }, { value: 'image/jpeg', label: 'JPEG' }, { value: 'image/png', label: 'PNG' }, ...(avif ? [{ value: 'image/avif' as const, label: 'AVIF' }] : [])]} />
        {target !== 'image/png' && (
          <div className="w-44">
            <label className="label" htmlFor="quality">Quality — {Math.round(quality * 100)}%</label>
            <input id="quality" type="range" min={0.3} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
          </div>
        )}
        {target === 'image/jpeg' && <ColorField label="Transparency becomes" value={background} onChange={setBackground} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={convert} multiple accept="image/*,.heic,.heif,.avif,.svg" title="Drop images" description="PNG, JPEG, WebP, GIF, BMP, AVIF, SVG — batch supported" disabled={busy} />
          <Callout tone="info">HEIC/HEIF photos convert only in browsers that can decode them (Safari). Animated GIFs keep their first frame.</Callout>
        </div>
        <div className="flex flex-col gap-3">
          {busy && <ProgressBar value={done.length} max={items.length} label="Converting" showValue />}
          {items.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="card flex gap-6 px-4 py-2">
                <Stat label="Files" value={items.length} />
                <Stat label="Before" value={formatBytes(items.reduce((s, i) => s + i.file.size, 0))} />
                <Stat label="After" value={formatBytes(done.reduce((s, i) => s + (i.result?.blob.size ?? 0), 0))} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void downloadAll()} disabled={!done.length || busy}>
                  Download {done.length > 1 ? 'all (.zip)' : ''}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setItems([])}>Clear</button>
              </div>
            </div>
          )}
          {items.length === 0 ? (
            <Panel title="Output"><p className="muted p-4 text-sm">Converted images appear here with before/after sizes.</p></Panel>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((i) => (
                <li key={i.id} className="card overflow-hidden">
                  <div className="checker flex h-36 items-center justify-center">
                    {i.result ? <img src={i.result.url} alt={i.file.name} className="max-h-36 max-w-full" /> : <span className="muted text-xs">{i.status === 'error' ? 'Failed' : 'Converting…'}</span>}
                  </div>
                  <div className="p-3 text-sm">
                    <div className="truncate font-medium" title={i.file.name}>{i.file.name}</div>
                    {i.result ? (
                      <div className="muted mt-0.5 flex flex-wrap gap-x-3 text-xs">
                        <span>{i.result.width} × {i.result.height}</span>
                        <span>{formatBytes(i.file.size)} → {formatBytes(i.result.blob.size)}</span>
                        <span style={{ color: i.result.blob.size < i.file.size ? 'var(--ok)' : undefined }}>{savingsPercent(i.file.size, i.result.blob.size) >= 0 ? '−' : '+'}{Math.abs(savingsPercent(i.file.size, i.result.blob.size))}%</span>
                      </div>
                    ) : (
                      <div className="muted text-xs">{i.error ?? formatBytes(i.file.size)}</div>
                    )}
                    {i.result && (
                      <button type="button" className="btn btn-sm mt-2" onClick={() => downloadBlob(i.result!.blob, nameFor(i))}>
                        Download {nameFor(i)}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
