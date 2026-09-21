import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented, Stat, Toggle } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { parseDocx } from '@/lib/docx';
import type { RichDocument } from '@/lib/richdoc';
import { documentToHtml, documentToMarkdown, documentToText } from '@/lib/richdoc-serialize';
import { formatBytes } from '@/lib/image';
import { safeFilename } from '@/lib/files';

type Format = 'markdown' | 'html' | 'text';

export default function DocxConvertTool(): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<RichDocument | null>(null);
  const [format, setFormat] = useState<Format>('markdown');
  const [fullHtml, setFullHtml] = useState(true);
  const [embedImages, setEmbedImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    setDoc(null);
    try {
      setDoc(await parseDocx(await f.arrayBuffer()));
      setFile(f);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not read this document.');
    } finally {
      setBusy(false);
    }
  };

  const output = useMemo(() => {
    if (!doc) return '';
    if (format === 'markdown') return documentToMarkdown(doc);
    if (format === 'html') return documentToHtml(doc, { fullDocument: fullHtml, embedImages, title: doc.meta.title ?? file?.name.replace(/\.docx$/i, '') });
    return documentToText(doc);
  }, [doc, format, fullHtml, embedImages, file]);

  const stats = useMemo(() => {
    if (!doc) return null;
    let paragraphs = 0;
    let headings = 0;
    let tables = 0;
    let images = 0;
    const walk = (blocks: RichDocument['blocks']): void => {
      for (const b of blocks) {
        if (b.kind === 'paragraph') {
          paragraphs++;
          if (b.style.startsWith('h') || b.style === 'title') headings++;
          images += b.runs.filter((r) => r.kind === 'image').length;
        } else if (b.kind === 'table') {
          tables++;
          b.rows.forEach((r) => r.cells.forEach((c) => walk(c.blocks)));
        } else if (b.kind === 'image') images++;
      }
    };
    walk(doc.blocks);
    const words = documentToText(doc).split(/\s+/).filter(Boolean).length;
    return { paragraphs, headings, tables, images, words };
  }, [doc]);

  const base = safeFilename(file?.name.replace(/\.docx$/i, '') ?? 'document');
  const ext = format === 'markdown' ? 'md' : format === 'html' ? 'html' : 'txt';
  const mime = format === 'html' ? 'text/html' : format === 'markdown' ? 'text/markdown' : 'text/plain';

  return (
    <ToolShell slug="docx-converter">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" title={file ? file.name : 'Drop a .docx file'} description={file ? formatBytes(file.size) : 'Headings, lists, tables, links and images are preserved'} compact={Boolean(file)} disabled={busy} />
          <Panel title="Output">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'markdown', label: 'Markdown' }, { value: 'html', label: 'HTML' }, { value: 'text', label: 'Plain text' }]} size="sm" />
              {format === 'html' && (
                <>
                  <Toggle checked={fullHtml} onChange={setFullHtml} label="Full HTML document" hint="Includes <html>, <head> and minimal styling" />
                  <Toggle checked={embedImages} onChange={setEmbedImages} label="Embed images as data URIs" />
                </>
              )}
            </div>
          </Panel>
          {stats && (
            <div className="card grid grid-cols-3 gap-2 p-3">
              <Stat label="Words" value={stats.words.toLocaleString()} />
              <Stat label="Paragraphs" value={stats.paragraphs} />
              <Stat label="Headings" value={stats.headings} />
              <Stat label="Tables" value={stats.tables} />
              <Stat label="Images" value={stats.images} />
              <Stat label="Title" value={doc?.meta.title ? '✓' : '—'} title={doc?.meta.title} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {doc?.warnings.length ? <Callout tone="warning" title="Heads up">{doc.warnings.join(' ')}</Callout> : null}
          {busy && <Callout tone="info">Reading document…</Callout>}
          <TextOutput value={output} label={`${format === 'markdown' ? 'Markdown' : format === 'html' ? 'HTML' : 'Text'} output`} filename={`${base}.${ext}`} mime={mime} rows={26} fill wrap={format !== 'html'} />
        </div>
      </div>
    </ToolShell>
  );
}
