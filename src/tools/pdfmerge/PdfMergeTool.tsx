import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, ProgressBar, Stat, TextField } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { mergePdfs, pageCountOf, parsePageRanges, imagesToPdf } from '@/lib/pdf-ops';
import { formatBytes } from '@/lib/image';
import { blobToBytes, canvasToBlob, decodeImage, drawToCanvas, releaseImage, sizeOf } from '@/lib/canvas';
import { openPdf, renderThumbnail } from '@/lib/pdfjs';

interface Item {
  id: string;
  file: File;
  data?: Uint8Array;
  pages?: number;
  thumb?: string;
  range: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

let counter = 0;

export default function PdfMergeTool(): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    setResult(null);
    const fresh: Item[] = files.map((file) => ({ id: `p${++counter}`, file, range: '', status: 'loading' }));
    setItems((prev) => [...prev, ...fresh]);
    for (const item of fresh) {
      try {
        let data: Uint8Array;
        if (item.file.type.startsWith('image/')) {
          // Images are wrapped into a one-page PDF so they can be merged too.
          const img = await decodeImage(item.file);
          const canvas = drawToCanvas(img, sizeOf(img), '#ffffff');
          releaseImage(img);
          const jpeg = await blobToBytes(await canvasToBlob(canvas, 'image/jpeg', 0.92));
          data = await imagesToPdf([{ data: jpeg, type: 'image/jpeg', name: item.file.name }]);
        } else {
          data = new Uint8Array(await item.file.arrayBuffer());
        }
        const pages = await pageCountOf(data);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, data, pages, status: 'ready' } : i)));
        // First-page thumbnail, best effort — merging works even if rendering fails.
        try {
          const opened = await openPdf(data);
          const thumb = await renderThumbnail(await opened.doc.getPage(1), 96);
          await opened.destroy();
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, thumb: thumb.url } : i)));
        } catch {
          /* thumbnail is optional */
        }
      } catch (e) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'Could not open this file.' } : i)));
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

  const ready = items.filter((i) => i.status === 'ready' && i.data);
  const rangeError = (i: Item): string | null => {
    if (!i.range.trim() || !i.pages) return null;
    try {
      parsePageRanges(i.range, i.pages);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid range';
    }
  };
  const totalPages = ready.reduce((s, i) => {
    try {
      return s + (i.range.trim() && i.pages ? parsePageRanges(i.range, i.pages).length : (i.pages ?? 0));
    } catch {
      return s;
    }
  }, 0);

  const merge = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = await mergePdfs(
        ready.map((i) => ({ data: i.data!, name: i.file.name, pages: i.range.trim() && i.pages ? parsePageRanges(i.range, i.pages) : undefined })),
        { title: title.trim() || undefined, onProgress: (d, t) => setProgress([d, t]) },
      );
      setResult({ bytes, pages: await pageCountOf(bytes) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <ToolShell slug="pdf-merge">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} multiple accept=".pdf,application/pdf,image/png,image/jpeg,image/webp" title="Drop PDFs" description="Images (PNG, JPEG, WebP) are welcome too — each becomes a page" />
          <Panel title="Output">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Document title (optional)" value={title} onChange={setTitle} placeholder="Merged document" />
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Files" value={ready.length} />
                <Stat label="Pages" value={totalPages} />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void merge()} disabled={ready.length < 1 || busy || items.some((i) => i.status === 'loading' || rangeError(i))}>
                {busy ? 'Merging…' : `Merge ${ready.length || ''} file${ready.length === 1 ? '' : 's'}`}
              </button>
              {progress && <ProgressBar value={progress[0]} max={progress[1]} label="Merging" showValue />}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title={items.length ? `${items.length} file${items.length === 1 ? '' : 's'} in order` : 'Files'} actions={items.length ? <button type="button" className="btn btn-sm" onClick={() => { setItems([]); setResult(null); }}>Clear</button> : undefined}>
            {items.length ? (
              <ol className="divide-y">
                {items.map((i, idx) => {
                  const err = rangeError(i);
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="muted w-5 font-mono text-xs">{idx + 1}</span>
                      <span className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                        {i.thumb ? <img src={i.thumb} alt="" className="max-h-full max-w-full" /> : <span className="muted text-[10px]">PDF</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.file.name}</span>
                        <span className="muted block text-xs">
                          {formatBytes(i.file.size)}
                          {i.status === 'loading' && ' · opening…'}
                          {i.status === 'ready' && ` · ${i.pages} page${i.pages === 1 ? '' : 's'}`}
                          {i.status === 'error' && <span style={{ color: 'var(--danger)' }}> · {i.error}</span>}
                        </span>
                      </span>
                      {i.status === 'ready' && (
                        <TextField label={`Pages from ${i.file.name}`} value={i.range} onChange={(v) => setItems((p) => p.map((x) => (x.id === i.id ? { ...x, range: v } : x)))} placeholder={`all (1-${i.pages})`} mono className="w-36 [&_.label]:sr-only" invalid={Boolean(err)} />
                      )}
                      <span className="flex gap-1">
                        <button type="button" className="btn btn-sm" onClick={() => move(i.id, -1)} disabled={idx === 0} aria-label={`Move ${i.file.name} up`}>↑</button>
                        <button type="button" className="btn btn-sm" onClick={() => move(i.id, 1)} disabled={idx === items.length - 1} aria-label={`Move ${i.file.name} down`}>↓</button>
                        <button type="button" className="btn btn-sm" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.file.name}`}>✕</button>
                      </span>
                      {err && <span className="w-full text-xs" style={{ color: 'var(--danger)' }}>{err}</span>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted p-4 text-sm">Add two or more PDFs, arrange them, optionally pick page ranges like <code className="font-mono">1-3, 7</code> per file, then merge. Bookmarks and form fields from the sources are flattened into plain pages.</p>
            )}
          </Panel>
          {error && <Callout tone="error" title="Merge failed">{error}</Callout>}
          {result && <PdfResult bytes={result.bytes} filename={`${title.trim() || 'merged'}.pdf`} pageCount={result.pages} />}
        </div>
      </div>
    </ToolShell>
  );
}
