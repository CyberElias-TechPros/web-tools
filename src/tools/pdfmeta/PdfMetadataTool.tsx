import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, TextField, Toggle } from '@/components/ui';
import { KeyValue } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { readPdfMetadata, resavePdf, writePdfMetadata } from '@/lib/pdf-ops';
import { getPdfInfo, openPdf } from '@/lib/pdfjs';
import { formatBytes } from '@/lib/image';

interface Loaded {
  file: File;
  data: Uint8Array;
  pageCount: number;
  info: Awaited<ReturnType<typeof getPdfInfo>>;
  original: { title: string; author: string; subject: string; keywords: string; creator: string; producer: string; creationDate?: Date; modificationDate?: Date };
}

const FIELDS = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'] as const;
type Field = (typeof FIELDS)[number];

export default function PdfMetadataTool(): React.ReactElement {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Record<Field, string>>({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' });
  const [strip, setStrip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const meta = await readPdfMetadata(data);
      const opened = await openPdf(data);
      const info = await getPdfInfo(opened.doc);
      await opened.destroy();
      setLoaded({ file: f, data, pageCount: meta.pageCount, info, original: meta });
      setForm({ title: meta.title, author: meta.author, subject: meta.subject, keywords: meta.keywords, creator: meta.creator, producer: meta.producer });
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    }
  };

  const save = async (): Promise<void> => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      if (strip) setResult(await resavePdf(loaded.data, { stripMetadata: true }));
      else setResult(await writePdfMetadata(loaded.data, form));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changed = loaded ? FIELDS.some((k) => form[k] !== loaded.original[k]) : false;
  const dateStr = (d?: Date): string => (d ? d.toLocaleString() : '—');

  return (
    <ToolShell slug="pdf-metadata">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".pdf,application/pdf" title={loaded ? loaded.file.name : 'Drop a PDF'} description={loaded ? `${loaded.pageCount} pages · ${formatBytes(loaded.file.size)}` : 'View, edit or wipe the document properties'} compact={Boolean(loaded)} />
          {loaded && (
            <Panel title="Document info">
              <KeyValue
                dense
                rows={[
                  { key: 'PDF version', value: loaded.info.pdfVersion ?? '—' },
                  { key: 'Pages', value: String(loaded.pageCount) },
                  { key: 'First page', value: `${Math.round(loaded.info.firstPageSize.width)} × ${Math.round(loaded.info.firstPageSize.height)} pt (${(loaded.info.firstPageSize.width / 72).toFixed(2)} × ${(loaded.info.firstPageSize.height / 72).toFixed(2)} in)` },
                  { key: 'Encrypted', value: loaded.info.encrypted ? 'yes' : 'no' },
                  { key: 'Created', value: dateStr(loaded.original.creationDate) },
                  { key: 'Modified', value: dateStr(loaded.original.modificationDate) },
                ]}
              />
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          <Panel title="Properties" description={loaded ? 'Edit any field and save a new copy. The original file is never modified.' : 'Load a PDF to see its properties.'}>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {FIELDS.map((k) => (
                <TextField key={k} label={k[0]!.toUpperCase() + k.slice(1)} value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} disabled={!loaded || strip} className={k === 'title' || k === 'subject' ? 'sm:col-span-2' : ''} hint={k === 'keywords' ? 'Comma separated' : undefined} />
              ))}
              <div className="sm:col-span-2">
                <Toggle checked={strip} onChange={setStrip} label="Strip all metadata instead" hint="Removes title, author, dates, producer and XMP — useful before sharing a document publicly." disabled={!loaded} />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!loaded || busy || (!strip && !changed)}>
                  {busy ? 'Saving…' : strip ? 'Save clean copy' : 'Save with new properties'}
                </button>
                {loaded && changed && !strip && <button type="button" className="btn" onClick={() => setForm({ title: loaded.original.title, author: loaded.original.author, subject: loaded.original.subject, keywords: loaded.original.keywords, creator: loaded.original.creator, producer: loaded.original.producer })}>Reset</button>}
              </div>
            </div>
          </Panel>
          {result && loaded && <PdfResult bytes={result} filename={`${loaded.file.name.replace(/\.pdf$/i, '')}-${strip ? 'clean' : 'edited'}.pdf`} pageCount={loaded.pageCount} noPreview extra={[{ label: 'Original', value: formatBytes(loaded.file.size) }]} />}
        </div>
      </div>
    </ToolShell>
  );
}
