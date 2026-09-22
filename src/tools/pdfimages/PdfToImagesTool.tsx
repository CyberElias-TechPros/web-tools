import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, ProgressBar, Segmented, Stat, TextField } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { openPdf, renderPageToBlob } from '@/lib/pdfjs';
import type { RasterFormat } from '@/lib/pdfjs';
import { parsePageRanges } from '@/lib/pdf-ops';
import { blobToBytes } from '@/lib/canvas';
import { createZip } from '@/lib/zip';
import { downloadBlob } from '@/lib/files';
import { formatBytes, extensionForType } from '@/lib/image';

interface Rendered {
  pageNumber: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export default function PdfToImagesTool(): React.ReactElement {
  const [file, setFile] = useState<{ file: File; data: Uint8Array; pages: number } | null>(null);
  const [format, setFormat] = useState<RasterFormat>('image/png');
  const [dpi, setDpi] = useState(144);
  const [quality, setQuality] = useState(90);
  const [range, setRange] = useState('all');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [results, setResults] = useState<Rendered[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => results.forEach((r) => URL.revokeObjectURL(r.url)), [results]);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResults([]);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const opened = await openPdf(data);
      setFile({ file: f, data, pages: opened.pageCount });
      await opened.destroy();
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    }
  };

  const rangeError = ((): string | null => {
    if (!file) return null;
    try {
      parsePageRanges(range || 'all', file.pages);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid range';
    }
  })();

  const render = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResults([]);
    const out: Rendered[] = [];
    try {
      const indices = parsePageRanges(range || 'all', file.pages);
      const opened = await openPdf(file.data);
      try {
        for (let i = 0; i < indices.length; i++) {
          const page = await opened.doc.getPage(indices[i]! + 1);
          const r = await renderPageToBlob(page, { dpi, format, quality: quality / 100 });
          out.push({ pageNumber: r.pageNumber, blob: r.blob, url: URL.createObjectURL(r.blob), width: Math.round(r.width), height: Math.round(r.height) });
          page.cleanup();
          setProgress([i + 1, indices.length]);
        }
      } finally {
        await opened.destroy();
      }
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const base = file?.file.name.replace(/\.pdf$/i, '') ?? 'page';
  const ext = extensionForType(format);
  const nameFor = (n: number): string => `${base}-page-${String(n).padStart(String(file?.pages ?? 1).length, '0')}.${ext}`;

  const downloadZip = async (): Promise<void> => {
    const entries = await Promise.all(results.map(async (r) => ({ name: nameFor(r.pageNumber), data: await blobToBytes(r.blob) })));
    downloadBlob(await createZip(entries), `${base}-images.zip`);
  };

  const totalBytes = results.reduce((s, r) => s + r.blob.size, 0);

  return (
    <ToolShell slug="pdf-to-images">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".pdf,application/pdf" title={file ? file.file.name : 'Drop a PDF'} description={file ? `${file.pages} pages · ${formatBytes(file.file.size)}` : 'Render pages to PNG, JPEG or WebP at any resolution'} compact={Boolean(file)} />
          <Panel title="Render settings">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'image/png', label: 'PNG' }, { value: 'image/jpeg', label: 'JPEG' }, { value: 'image/webp', label: 'WebP' }]} size="sm" />
              <Segmented label="Resolution" value={String(dpi)} onChange={(v) => setDpi(Number(v))} options={[{ value: '72', label: '72 dpi' }, { value: '144', label: '144 dpi' }, { value: '200', label: '200 dpi' }, { value: '300', label: '300 dpi' }]} size="sm" />
              <NumberField label="Custom dpi" value={dpi} onChange={setDpi} min={36} max={600} step={12} hint="300 dpi is print quality; 144 dpi suits screens." />
              {format !== 'image/png' && <NumberField label="Quality" value={quality} onChange={setQuality} min={30} max={100} suffix="%" />}
              <TextField label="Pages" value={range} onChange={setRange} mono placeholder="all" hint="e.g. 1-3, 5 or odd / even" invalid={Boolean(rangeError)} />
              {rangeError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{rangeError}</p>}
              <button type="button" className="btn btn-primary" onClick={() => void render()} disabled={!file || busy || Boolean(rangeError)}>
                {busy ? 'Rendering…' : 'Render pages'}
              </button>
              {progress && <ProgressBar value={progress[0]} max={progress[1]} label="Rendering" showValue />}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {results.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="card flex gap-6 px-4 py-2">
                  <Stat label="Images" value={results.length} />
                  <Stat label="Size" value={formatBytes(totalBytes)} />
                  <Stat label="Pixels" value={`${results[0]!.width}×${results[0]!.height}`} />
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void downloadZip()}>Download all (.zip)</button>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {results.map((r) => (
                  <li key={r.pageNumber} className="card flex flex-col gap-2 p-2">
                    <a href={r.url} target="_blank" rel="noreferrer" className="checker flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg" aria-label={`Open page ${r.pageNumber} image in a new tab`}>
                      <img src={r.url} alt={`Rendered page ${r.pageNumber}`} className="max-h-full max-w-full" loading="lazy" />
                    </a>
                    <div className="flex items-center justify-between text-xs">
                      <span>Page {r.pageNumber}</span>
                      <span className="muted">{formatBytes(r.blob.size)}</span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => downloadBlob(r.blob, nameFor(r.pageNumber))}>Download</button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Panel title="Rendered pages"><p className="muted p-4 text-sm">Each page appears here as an image with its own download button, plus a ZIP of everything.</p></Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
