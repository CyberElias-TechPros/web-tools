import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented, Stat, Toggle } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { parsePptx, presentationToRichDocument, presentationToText } from '@/lib/pptx';
import type { Presentation } from '@/lib/pptx';
import { documentToMarkdown } from '@/lib/richdoc-serialize';
import { renderPdf } from '@/lib/pdf-doc';
import { formatBytes } from '@/lib/image';
import { safeFilename } from '@/lib/files';

type Format = 'text' | 'markdown' | 'json';

export default function PptxTool(): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [pres, setPres] = useState<Presentation | null>(null);
  const [format, setFormat] = useState<Format>('markdown');
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    setPdf(null);
    try {
      setPres(await parsePptx(await f.arrayBuffer()));
      setFile(f);
    } catch (e) {
      setPres(null);
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not read this presentation.');
    } finally {
      setBusy(false);
    }
  };

  const output = useMemo(() => {
    if (!pres) return '';
    if (format === 'text') return presentationToText(pres, { notes });
    if (format === 'markdown') return documentToMarkdown(presentationToRichDocument(pres, { notes }));
    return JSON.stringify(pres.slides.map((s) => ({ slide: s.number, title: s.title, paragraphs: s.paragraphs.map((p) => p.text), tables: s.tables, ...(notes ? { notes: s.notes } : {}) })), null, 2);
  }, [pres, format, notes]);

  const makePdf = async (): Promise<void> => {
    if (!pres) return;
    setBusy(true);
    setError(null);
    try {
      const out = await renderPdf([{ doc: presentationToRichDocument(pres, { notes }), name: file?.name }], { pageNumbers: 'number-of-total' });
      setPdf({ bytes: out.bytes, pages: out.pageCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const base = safeFilename(file?.name.replace(/\.pptx$/i, '') ?? 'presentation');
  const words = output.split(/\s+/).filter(Boolean).length;
  const withNotes = pres?.slides.filter((s) => s.notes.trim()).length ?? 0;
  const tables = pres?.slides.reduce((s, x) => s + x.tables.length, 0) ?? 0;

  return (
    <ToolShell slug="pptx-extractor">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" title={file ? file.name : 'Drop a .pptx deck'} description={file ? `${formatBytes(file.size)} · ${pres?.slides.length ?? 0} slides` : 'Titles, bullets, tables and speaker notes — slide by slide'} compact={Boolean(file)} disabled={busy} />
          <Panel title="Output">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'markdown', label: 'Markdown' }, { value: 'text', label: 'Plain text' }, { value: 'json', label: 'JSON' }]} size="sm" />
              <Toggle checked={notes} onChange={setNotes} label="Include speaker notes" />
              <button type="button" className="btn" onClick={() => void makePdf()} disabled={!pres || busy}>
                {busy ? 'Working…' : 'Also render as PDF handout'}
              </button>
            </div>
          </Panel>
          {pres && (
            <div className="card grid grid-cols-2 gap-2 p-3">
              <Stat label="Slides" value={pres.slides.length} />
              <Stat label="Words" value={words.toLocaleString()} />
              <Stat label="With notes" value={withNotes} />
              <Stat label="Tables" value={tables} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {pres?.warnings.length ? <Callout tone="warning">{pres.warnings.join(' ')}</Callout> : null}
          {pdf && <PdfResult bytes={pdf.bytes} filename={`${base}-handout.pdf`} pageCount={pdf.pages} noPreview title="PDF handout" />}
          <TextOutput value={output} label={`${format === 'markdown' ? 'Markdown' : format === 'json' ? 'JSON' : 'Text'} output`} filename={`${base}.${format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt'}`} mime={format === 'json' ? 'application/json' : 'text/plain'} rows={26} fill />
        </div>
      </div>
    </ToolShell>
  );
}
