import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Stat, TextField } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { readZip } from '@/lib/zip-reader';
import type { ZipArchive, ZipEntryInfo } from '@/lib/zip-reader';
import { detectFileType, sniffText } from '@/lib/filetype';
import { downloadBlob } from '@/lib/files';
import { formatBytes } from '@/lib/image';

interface Loaded {
  name: string;
  size: number;
  archive: ZipArchive;
}

export default function UnzipTool(): React.ReactElement {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<{ name: string; text: string | null; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: File[]): Promise<void> => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    try {
      const archive = await readZip(await file.arrayBuffer());
      setLoaded({ name: file.name, size: file.size, archive });
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : 'Could not read this archive. Is it a ZIP file?');
    }
  };

  const files = useMemo(() => {
    const entries = loaded?.archive.entries.filter((e) => !e.isDirectory) ?? [];
    const q = filter.trim().toLowerCase();
    return q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  }, [loaded, filter]);

  const totals = useMemo(() => {
    const all = loaded?.archive.entries.filter((e) => !e.isDirectory) ?? [];
    return { count: all.length, uncompressed: all.reduce((s, e) => s + e.uncompressedSize, 0), compressed: all.reduce((s, e) => s + e.compressedSize, 0), dirs: (loaded?.archive.entries.length ?? 0) - all.length };
  }, [loaded]);

  const extractOne = async (entry: ZipEntryInfo): Promise<void> => {
    if (!loaded) return;
    setBusy(true);
    try {
      const bytes = await loaded.archive.extract(entry);
      downloadBlob(new Blob([bytes as BlobPart]), entry.name.split('/').pop() || 'file');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const previewOne = async (entry: ZipEntryInfo): Promise<void> => {
    if (!loaded) return;
    setBusy(true);
    try {
      const bytes = await loaded.archive.extract(entry);
      const sig = detectFileType(bytes);
      if (preview?.url) URL.revokeObjectURL(preview.url);
      if (sig?.category === 'image') {
        setPreview({ name: entry.name, text: null, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: sig.mime })) });
      } else if (sniffText(bytes.subarray(0, 8192)).isText) {
        setPreview({ name: entry.name, text: new TextDecoder().decode(bytes.subarray(0, 200_000)) + (bytes.length > 200_000 ? '\n… (truncated)' : ''), url: null });
      } else {
        setPreview({ name: entry.name, text: `Binary file (${sig?.description ?? 'unknown type'}, ${formatBytes(bytes.length)}) — download to open.`, url: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const extractAll = async (): Promise<void> => {
    if (!loaded) return;
    setBusy(true);
    try {
      for (const entry of files) {
        const bytes = await loaded.archive.extract(entry);
        downloadBlob(new Blob([bytes as BlobPart]), entry.name.split('/').pop() || 'file');
        await new Promise((r) => setTimeout(r, 150));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell slug="zip-extractor">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".zip,.jar,.docx,.xlsx,.pptx,.epub,.apk,.xpi,.crx,application/zip" title="Drop a ZIP file" description="Also opens .docx, .xlsx, .pptx, .jar, .epub and other ZIP-based formats" />
          {error && <Callout tone="error">{error}</Callout>}
          {loaded && (
            <Panel title={loaded.name} description={formatBytes(loaded.size)}>
              <div className="grid grid-cols-2 gap-3 p-4">
                <Stat label="Files" value={totals.count} />
                <Stat label="Folders" value={totals.dirs} />
                <Stat label="Unpacked" value={formatBytes(totals.uncompressed)} />
                <Stat label="Ratio" value={totals.uncompressed ? `${((1 - totals.compressed / totals.uncompressed) * 100).toFixed(0)}% saved` : '—'} />
              </div>
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {loaded ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <TextField label="Filter files" value={filter} onChange={setFilter} placeholder="Type to filter…" className="flex-1" />
                <button type="button" className="btn btn-primary btn-sm mb-0.5" onClick={() => void extractAll()} disabled={busy || !files.length}>
                  Download {filter ? `${files.length} shown` : 'all'}
                </button>
              </div>
              <Panel title="Contents">
                <ul className="max-h-[28rem] divide-y overflow-auto">
                  {files.map((e) => (
                    <li key={e.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-xs">{e.name}</span>
                        <span className="muted text-[0.7rem]">{formatBytes(e.uncompressedSize)} · {e.method === 0 ? 'stored' : 'deflate'} · {e.date.toLocaleDateString()}</span>
                      </span>
                      <button type="button" className="btn btn-sm" onClick={() => void previewOne(e)} disabled={busy}>
                        Preview
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void extractOne(e)} disabled={busy}>
                        Download
                      </button>
                    </li>
                  ))}
                  {files.length === 0 && <li className="muted px-4 py-3 text-sm">No files match.</li>}
                </ul>
              </Panel>
              {preview && (
                <Panel title={`Preview: ${preview.name}`}>
                  {preview.url ? (
                    <div className="checker p-4"><img src={preview.url} alt={`Preview of ${preview.name}`} className="mx-auto max-h-96" /></div>
                  ) : (
                    <TextOutput value={preview.text ?? ''} label="" rows={14} />
                  )}
                </Panel>
              )}
            </>
          ) : (
            <Panel title="Browse before you extract"><p className="muted p-4 text-sm">Inspect the file list, preview text and images, and download individual files without unpacking the whole archive. Supports stored and deflate-compressed entries.</p></Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
