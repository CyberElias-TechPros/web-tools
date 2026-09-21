import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, ProgressBar, Stat } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { organisePdf } from '@/lib/pdf-ops';
import { openPdf, renderThumbnail } from '@/lib/pdfjs';
import { formatBytes } from '@/lib/image';

interface Page {
  id: string;
  source: number;
  rotate: number;
  url: string;
  width: number;
  height: number;
}

let counter = 0;

export default function PdfOrganizeTool(): React.ReactElement {
  const [file, setFile] = useState<{ file: File; data: Uint8Array } | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setPages([]);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      setFile({ file: f, data });
      const opened = await openPdf(data);
      const out: Page[] = [];
      for (let i = 1; i <= opened.pageCount; i++) {
        const page = await opened.doc.getPage(i);
        const thumb = await renderThumbnail(page, 200);
        out.push({ id: `pg${++counter}`, source: i - 1, rotate: 0, ...thumb });
        setLoading([i, opened.pageCount]);
        if (i % 4 === 0 || i === opened.pageCount) setPages([...out]);
      }
      await opened.destroy();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    } finally {
      setLoading(null);
    }
  };

  const update = (id: string, fn: (p: Page) => Page): void => setPages((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  const remove = (id: string): void => setPages((prev) => prev.filter((p) => p.id !== id));
  const duplicate = (id: string): void =>
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const p = prev[idx];
      if (!p) return prev;
      return [...prev.slice(0, idx + 1), { ...p, id: `pg${++counter}` }, ...prev.slice(idx + 1)];
    });
  const move = (id: string, dir: -1 | 1): void =>
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
      return copy;
    });
  const dropOn = (targetId: string): void => {
    if (!dragging || dragging === targetId) return;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === dragging);
      const to = prev.findIndex((p) => p.id === targetId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item!);
      return copy;
    });
    setDragging(null);
  };

  const save = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await organisePdf(file.data, pages.map((p) => ({ source: p.source, rotate: p.rotate }))));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changed = file && (pages.length !== (loading ? 0 : pages.length) || pages.some((p, i) => p.source !== i || p.rotate !== 0));

  return (
    <ToolShell slug="pdf-organizer">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <Dropzone onFiles={onFiles} accept=".pdf,application/pdf" title={file ? file.file.name : 'Drop a PDF'} description={file ? `${pages.length} pages · ${formatBytes(file.file.size)}` : 'Reorder, rotate, duplicate and delete pages visually'} compact={Boolean(file)} className="min-w-64 flex-1" />
          {file && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setPages((p) => [...p].reverse())}>Reverse order</button>
              <button type="button" className="btn btn-sm" onClick={() => setPages((p) => p.map((x) => ({ ...x, rotate: (x.rotate + 90) % 360 })))}>Rotate all 90°</button>
              <button type="button" className="btn btn-sm" onClick={() => void onFiles([file.file])}>Reset</button>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !pages.length || Boolean(loading)}>
                {busy ? 'Saving…' : `Save ${pages.length} page${pages.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </div>
        {loading && <ProgressBar value={loading[0]} max={loading[1]} label="Rendering thumbnails" showValue />}
        {error && <Callout tone="error">{error}</Callout>}
        {pages.length > 0 && (
          <Panel title="Pages" description="Drag to reorder, or use the buttons. Click a page to select it and use the keyboard: ← → move, R rotate, Delete remove.">
            <ul
              className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
              onKeyDown={(e) => {
                if (!selected) return;
                if (e.key === 'ArrowLeft') move(selected, -1);
                else if (e.key === 'ArrowRight') move(selected, 1);
                else if (e.key.toLowerCase() === 'r') update(selected, (p) => ({ ...p, rotate: (p.rotate + 90) % 360 }));
                else if (e.key === 'Delete' || e.key === 'Backspace') remove(selected);
                else return;
                e.preventDefault();
              }}
            >
              {pages.map((p, i) => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={() => setDragging(p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(p.id)}
                  onDragEnd={() => setDragging(null)}
                  className={`group relative rounded-xl border p-2 transition ${selected === p.id ? 'ring-2' : ''} ${dragging === p.id ? 'opacity-50' : ''}`}
                  style={selected === p.id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent)' } : undefined}
                >
                  <button type="button" className="block w-full" onClick={() => setSelected(p.id)} aria-pressed={selected === p.id} aria-label={`Page ${i + 1} (source page ${p.source + 1}${p.rotate ? `, rotated ${p.rotate}°` : ''})`}>
                    <span className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-white">
                      <img src={p.url} alt="" className="max-h-full max-w-full transition-transform" style={{ transform: `rotate(${p.rotate}deg)` }} />
                    </span>
                  </button>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-mono">{i + 1}</span>
                    <span className="muted">was {p.source + 1}{p.rotate ? ` · ${p.rotate}°` : ''}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-1">
                    <button type="button" className="btn btn-sm !px-1.5" onClick={() => move(p.id, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} left`}>←</button>
                    <button type="button" className="btn btn-sm !px-1.5" onClick={() => update(p.id, (x) => ({ ...x, rotate: (x.rotate + 90) % 360 }))} aria-label={`Rotate page ${i + 1}`}>⟳</button>
                    <button type="button" className="btn btn-sm !px-1.5" onClick={() => duplicate(p.id)} aria-label={`Duplicate page ${i + 1}`}>⧉</button>
                    <button type="button" className="btn btn-sm !px-1.5" onClick={() => remove(p.id)} aria-label={`Delete page ${i + 1}`}>✕</button>
                    <button type="button" className="btn btn-sm !px-1.5" onClick={() => move(p.id, 1)} disabled={i === pages.length - 1} aria-label={`Move page ${i + 1} right`}>→</button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {file && !loading && pages.length === 0 && <Callout tone="warning">All pages removed — add at least one back with Reset.</Callout>}
        {result && (
          <PdfResult bytes={result} filename={`${file?.file.name.replace(/\.pdf$/i, '') ?? 'document'}-organised.pdf`} pageCount={pages.length} extra={[{ label: 'Changed', value: changed ? 'yes' : 'no' }]}>
            <div className="flex gap-6"><Stat label="Rotated" value={pages.filter((p) => p.rotate).length} /><Stat label="Original pages" value={file ? new Set(pages.map((p) => p.source)).size : 0} /></div>
          </PdfResult>
        )}
      </div>
    </ToolShell>
  );
}
