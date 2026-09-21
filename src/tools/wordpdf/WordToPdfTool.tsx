import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, ProgressBar, Segmented, SelectField, Stat, Toggle } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { parseDocx, looksLikeDocx } from '@/lib/docx';
import { parsePptx, presentationToRichDocument, looksLikePptx } from '@/lib/pptx';
import { parseMarkdown } from '@/lib/md-parse';
import { renderPdf, textToRichDocument, defaultPdfDocOptions } from '@/lib/pdf-doc';
import type { PdfDocOptions } from '@/lib/pdf-doc';
import { countImages, countWords } from '@/lib/richdoc';
import type { RichDocument } from '@/lib/richdoc';
import { rasterizeToPng } from '@/lib/canvas';
import { formatBytes } from '@/lib/image';
import { useLocalStorage } from '@/hooks';

interface Item {
  id: string;
  file: File;
  status: 'parsing' | 'ready' | 'error';
  doc?: RichDocument;
  words?: number;
  images?: number;
  error?: string;
}

let counter = 0;

async function parseAny(file: File): Promise<RichDocument> {
  const name = file.name.toLowerCase();
  if (looksLikeDocx(file)) return parseDocx(await file.arrayBuffer());
  if (looksLikePptx(file)) return presentationToRichDocument(await parsePptx(await file.arrayBuffer()), { notes: false });
  const text = await file.text();
  if (name.endsWith('.md') || name.endsWith('.markdown')) return parseMarkdown(text);
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    const { parseHtmlDocument } = await import('@/lib/html-import');
    return parseHtmlDocument(text);
  }
  return textToRichDocument(text, file.name.replace(/\.[^.]+$/, ''));
}

export default function WordToPdfTool(): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [opts, setOpts] = useLocalStorage<PdfDocOptions>('w2p:opts', defaultPdfDocOptions);
  const set = <K extends keyof PdfDocOptions>(k: K, v: PdfDocOptions[K]): void => setOpts((o) => ({ ...o, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; pages: number; warnings: string[]; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    setResult(null);
    const fresh: Item[] = files.map((file) => ({ id: `d${++counter}`, file, status: 'parsing' }));
    setItems((prev) => [...prev, ...fresh]);
    for (const item of fresh) {
      try {
        const doc = await parseAny(item.file);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'ready', doc, words: countWords(doc), images: countImages(doc) } : i)));
      } catch (e) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: e instanceof Error ? e.message : 'Could not read this file.' } : i)));
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

  const ready = items.filter((i) => i.status === 'ready' && i.doc);

  const build = async (): Promise<void> => {
    if (!ready.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await renderPdf(
        ready.map((i) => ({ doc: i.doc!, name: i.file.name })),
        opts,
        { convertImage: (img) => rasterizeToPng(img.data, img.type), onProgress: (d, t) => setProgress([d, t]) },
      );
      const base = ready.length === 1 ? ready[0]!.file.name.replace(/\.[^.]+$/, '') : 'combined';
      setResult({ bytes: out.bytes, pages: out.pageCount, warnings: out.warnings, name: `${base}.pdf` });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const allWarnings = [...new Set([...(result?.warnings ?? []), ...ready.flatMap((i) => i.doc?.warnings ?? [])])];

  return (
    <ToolShell slug="word-to-pdf">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} multiple accept=".docx,.md,.markdown,.txt,.html,.htm,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,text/html" title="Drop Word documents" description="DOCX, Markdown, HTML, plain text and PowerPoint — several files become one PDF, in the order listed" />
          <Panel title="Page">
            <div className="grid grid-cols-2 gap-3 p-4">
              <SelectField label="Size" value={opts.pageSize} onChange={(v) => set('pageSize', v)} options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'US Letter' }, { value: 'Legal', label: 'US Legal' }, { value: 'A5', label: 'A5' }]} />
              <SelectField label="Orientation" value={opts.orientation} onChange={(v) => set('orientation', v)} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
              <NumberField label="Margin (pt)" value={opts.margin} onChange={(v) => set('margin', Math.max(18, Math.min(144, v)))} min={18} max={144} step={4} />
              <SelectField label="Page numbers" value={opts.pageNumbers} onChange={(v) => set('pageNumbers', v)} options={[{ value: 'none', label: 'None' }, { value: 'number', label: '1, 2, 3' }, { value: 'number-of-total', label: '1 of 12' }]} />
            </div>
          </Panel>
          <Panel title="Type">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Font" value={opts.fontFamily} onChange={(v) => set('fontFamily', v)} options={[{ value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} size="sm" />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Base size (pt)" value={opts.baseFontSize} onChange={(v) => set('baseFontSize', Math.max(7, Math.min(18, v)))} min={7} max={18} step={0.5} />
                <NumberField label="Line height" value={opts.lineHeight} onChange={(v) => set('lineHeight', Math.max(1, Math.min(2.2, v)))} min={1} max={2.2} step={0.05} />
              </div>
              <Toggle checked={opts.useDocumentSizes} onChange={(v) => set('useDocumentSizes', v)} label="Honour font sizes from the document" hint="Off = uniform typography for all files" />
            </div>
          </Panel>
          {items.length > 1 && (
            <Panel title="Combining">
              <div className="flex flex-col gap-3 p-4">
                <Toggle checked={opts.breakBetweenDocuments} onChange={(v) => set('breakBetweenDocuments', v)} label="Start each document on a new page" />
                <Toggle checked={opts.titleEachDocument} onChange={(v) => set('titleEachDocument', v)} label="Add the file name as a heading" />
              </div>
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Panel
            title={items.length ? `${items.length} document${items.length === 1 ? '' : 's'}` : 'Documents'}
            description={items.length > 1 ? 'Use the arrows to set the order' : undefined}
            actions={items.length ? <button type="button" className="btn btn-sm" onClick={() => { setItems([]); setResult(null); }}>Clear</button> : undefined}
          >
            {items.length ? (
              <ol className="divide-y">
                {items.map((i, idx) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="muted w-5 font-mono text-xs">{idx + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.file.name}</span>
                      <span className="muted block text-xs">
                        {formatBytes(i.file.size)}
                        {i.status === 'parsing' && ' · reading…'}
                        {i.status === 'ready' && ` · ${i.words?.toLocaleString()} words${i.images ? ` · ${i.images} image${i.images === 1 ? '' : 's'}` : ''}${i.doc?.warnings.length ? ` · ${i.doc.warnings.length} note${i.doc.warnings.length === 1 ? '' : 's'}` : ''}`}
                        {i.status === 'error' && <span style={{ color: 'var(--danger)' }}> · {i.error}</span>}
                      </span>
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => move(i.id, -1)} disabled={idx === 0} aria-label={`Move ${i.file.name} up`}>↑</button>
                    <button type="button" className="btn btn-sm" onClick={() => move(i.id, 1)} disabled={idx === items.length - 1} aria-label={`Move ${i.file.name} down`}>↓</button>
                    <button type="button" className="btn btn-sm" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.file.name}`}>✕</button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="p-4 text-sm">
                <p className="muted">Everything is converted locally: paragraphs, headings, bold/italic/underline, lists, tables, images, links and page breaks are laid out into a fresh PDF. Fonts are embedded, so the file looks the same everywhere.</p>
                <ul className="muted mt-3 grid gap-1 text-xs sm:grid-cols-2">
                  <li>• Combine several .docx into one PDF</li>
                  <li>• Mix Word, Markdown, HTML and text files</li>
                  <li>• Consistent page size and margins</li>
                  <li>• Optional page numbers and per-file headings</li>
                </ul>
              </div>
            )}
          </Panel>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => void build()} disabled={!ready.length || busy || items.some((i) => i.status === 'parsing')}>
              {busy ? 'Rendering…' : ready.length > 1 ? `Combine ${ready.length} files into PDF` : 'Convert to PDF'}
            </button>
            {ready.length > 0 && (
              <div className="card flex gap-6 px-4 py-2">
                <Stat label="Words" value={ready.reduce((s, i) => s + (i.words ?? 0), 0).toLocaleString()} />
                <Stat label="Images" value={ready.reduce((s, i) => s + (i.images ?? 0), 0)} />
              </div>
            )}
          </div>
          {progress && <ProgressBar value={progress[0]} max={progress[1]} label="Laying out pages" showValue />}
          {error && <Callout tone="error" title="Conversion failed">{error}</Callout>}
          {result && <PdfResult bytes={result.bytes} filename={result.name} pageCount={result.pages} warnings={allWarnings} />}
        </div>
      </div>
    </ToolShell>
  );
}
