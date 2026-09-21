import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, ProgressBar, Segmented, Stat, TextField, Toggle } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { extractText, openPdf } from '@/lib/pdfjs';
import type { PageText } from '@/lib/pdfjs';
import { formatBytes } from '@/lib/image';
import { safeFilename } from '@/lib/files';

type Layout = 'plain' | 'markers' | 'markdown' | 'json';

function format(pages: PageText[], layout: Layout, keepBlank: boolean): string {
  const list = keepBlank ? pages : pages.filter((p) => p.text.trim());
  if (layout === 'json') return JSON.stringify(list.map((p) => ({ page: p.pageNumber, text: p.text })), null, 2);
  if (layout === 'markers') return list.map((p) => `===== Page ${p.pageNumber} =====\n${p.text}`).join('\n\n');
  if (layout === 'markdown') return list.map((p) => `## Page ${p.pageNumber}\n\n${p.text}`).join('\n\n---\n\n');
  return list.map((p) => p.text).join('\n\n');
}

export default function PdfTextTool(): React.ReactElement {
  const [file, setFile] = useState<{ file: File; data: Uint8Array; pages: number } | null>(null);
  const [pages, setPages] = useState<PageText[]>([]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [layout, setLayout] = useState<Layout>('markers');
  const [keepBlank, setKeepBlank] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setPages([]);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const opened = await openPdf(data);
      setFile({ file: f, data, pages: opened.pageCount });
      setFrom(1);
      setTo(opened.pageCount);
      await opened.destroy();
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    }
  };

  const run = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await openPdf(file.data);
      try {
        setPages(await extractText(opened.doc, { from, to, onProgress: (d, t) => setProgress([d, t]) }));
      } finally {
        await opened.destroy();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const matches = needle ? pages.reduce((s, p) => s + p.text.toLowerCase().split(needle).length - 1, 0) : 0;
  const shown = needle ? pages.filter((p) => p.text.toLowerCase().includes(needle)) : pages;
  const output = format(shown, layout, keepBlank);
  const words = output.split(/\s+/).filter(Boolean).length;
  const empty = pages.filter((p) => !p.text.trim()).length;
  const base = safeFilename(file?.file.name.replace(/\.pdf$/i, '') ?? 'document');

  return (
    <ToolShell slug="pdf-text-extractor">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".pdf,application/pdf" title={file ? file.file.name : 'Drop a PDF'} description={file ? `${file.pages} pages · ${formatBytes(file.file.size)}` : 'Pull the text layer out of any PDF'} compact={Boolean(file)} />
          <Panel title="Extraction">
            <div className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="From page" value={from} onChange={setFrom} min={1} max={file?.pages ?? 1} />
                <NumberField label="To page" value={to} onChange={setTo} min={from} max={file?.pages ?? 1} />
              </div>
              <Segmented label="Layout" value={layout} onChange={setLayout} options={[{ value: 'markers', label: 'Page markers' }, { value: 'plain', label: 'Plain' }, { value: 'markdown', label: 'Markdown' }, { value: 'json', label: 'JSON' }]} size="sm" />
              <Toggle checked={keepBlank} onChange={setKeepBlank} label="Keep blank pages" hint="Scanned pages without a text layer come out empty — run OCR elsewhere for those." />
              <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={!file || busy || from > to}>
                {busy ? 'Extracting…' : 'Extract text'}
              </button>
              {progress && <ProgressBar value={progress[0]} max={progress[1]} label="Reading pages" showValue />}
            </div>
          </Panel>
          {pages.length > 0 && (
            <TextField label="Search extracted text" value={query} onChange={setQuery} placeholder="Find a word or phrase…" hint={needle ? `${matches} match${matches === 1 ? '' : 'es'} on ${shown.length} page${shown.length === 1 ? '' : 's'} — output shows matching pages only` : 'Filters the output to pages that contain the term'} />
          )}
          {pages.length > 0 && (
            <div className="card grid grid-cols-3 gap-2 p-3">
              <Stat label="Pages" value={pages.length} />
              <Stat label="Words" value={words.toLocaleString()} />
              <Stat label="Empty" value={empty} tone={empty ? 'bad' : 'default'} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {pages.length > 0 && empty === pages.length && <Callout tone="warning" title="No text layer">Every page came back empty. This PDF is probably a scan (images only). Convert it to images and run OCR, or use the original source document.</Callout>}
          <TextOutput value={output} label="Extracted text" filename={`${base}.${layout === 'json' ? 'json' : layout === 'markdown' ? 'md' : 'txt'}`} mime={layout === 'json' ? 'application/json' : 'text/plain'} rows={24} fill />
        </div>
      </div>
    </ToolShell>
  );
}
