import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, ProgressBar, Segmented, Stat, TextField } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { describeIndices, pageCountOf, parsePageRanges, splitPdf } from '@/lib/pdf-ops';
import type { SplitMode, SplitPart } from '@/lib/pdf-ops';
import { createZip } from '@/lib/zip';
import { downloadBlob } from '@/lib/files';
import { formatBytes } from '@/lib/image';

export default function PdfSplitTool(): React.ReactElement {
  const [file, setFile] = useState<{ file: File; data: Uint8Array; pages: number } | null>(null);
  const [mode, setMode] = useState<SplitMode>('extract');
  const [ranges, setRanges] = useState('1-2');
  const [n, setN] = useState(2);
  const [parts, setParts] = useState<SplitPart[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setParts([]);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const pages = await pageCountOf(data);
      setFile({ file: f, data, pages });
      setRanges(`1-${Math.min(2, pages)}`);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    }
  };

  const preview = ((): string | null => {
    if (!file) return null;
    try {
      if (mode === 'every-page') return `${file.pages} single-page files`;
      if (mode === 'every-n') return `${Math.ceil(file.pages / Math.max(1, n))} files of up to ${Math.max(1, n)} pages`;
      if (mode === 'ranges') {
        const groups = ranges.split(/[,;]+/).filter((s) => s.trim()).map((part) => parsePageRanges(part, file.pages));
        return `${groups.length} file${groups.length === 1 ? '' : 's'}: ${groups.map((g) => describeIndices(g)).join(' · ')}`;
      }
      const idx = parsePageRanges(ranges || 'all', file.pages);
      return `1 file with ${idx.length} page${idx.length === 1 ? '' : 's'} (${describeIndices(idx)})`;
    } catch (e) {
      return `⚠ ${e instanceof Error ? e.message : String(e)}`;
    }
  })();

  const run = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setParts(await splitPdf(file.data, { mode, n, ranges, baseName: file.file.name, onProgress: (d, t) => setProgress([d, t]) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadAll = async (): Promise<void> => {
    if (parts.length === 1) {
      downloadBlob(new Blob([parts[0]!.bytes as BlobPart], { type: 'application/pdf' }), parts[0]!.name);
      return;
    }
    downloadBlob(await createZip(parts.map((p) => ({ name: p.name, data: p.bytes }))), `${file?.file.name.replace(/\.pdf$/i, '') ?? 'split'}-parts.zip`);
  };

  return (
    <ToolShell slug="pdf-split">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".pdf,application/pdf" title={file ? file.file.name : 'Drop a PDF'} description={file ? `${file.pages} pages · ${formatBytes(file.file.size)}` : 'Split by ranges, extract pages, or burst into single pages'} compact={Boolean(file)} />
          <Panel title="How to split">
            <div className="flex flex-col gap-3 p-4">
              <Segmented
                label="Mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'extract', label: 'Extract pages' },
                  { value: 'ranges', label: 'Custom ranges' },
                  { value: 'every-n', label: 'Every N pages' },
                  { value: 'every-page', label: 'Every page' },
                ]}
                size="sm"
              />
              {(mode === 'extract' || mode === 'ranges') && (
                <TextField label={mode === 'extract' ? 'Pages to keep' : 'Ranges (one file per group, separated by commas)'} value={ranges} onChange={setRanges} mono placeholder={mode === 'extract' ? '1-3, 5, 8-10' : '1-3, 4-6, 7-'} hint={mode === 'extract' ? 'Use “odd”, “even”, “last” or “all”; “5-” means to the end.' : 'Example: 1-3, 4-6, 7- creates three files.'} />
              )}
              {mode === 'every-n' && <NumberField label="Pages per file" value={n} onChange={setN} min={1} max={500} />}
              {preview && <p className={`text-sm ${preview.startsWith('⚠') ? '' : 'muted'}`} style={preview.startsWith('⚠') ? { color: 'var(--danger)' } : undefined}>{preview}</p>}
              <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={!file || busy || preview?.startsWith('⚠')}>
                {busy ? 'Splitting…' : 'Split PDF'}
              </button>
              {progress && <ProgressBar value={progress[0]} max={progress[1]} label="Splitting" showValue />}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {parts.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <div className="card flex gap-6 px-4 py-2">
                  <Stat label="Files" value={parts.length} />
                  <Stat label="Total" value={formatBytes(parts.reduce((s, p) => s + p.bytes.length, 0))} />
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void downloadAll()}>
                  Download {parts.length > 1 ? 'all (.zip)' : ''}
                </button>
              </div>
              {parts.length === 1 ? (
                <PdfResult bytes={parts[0]!.bytes} filename={parts[0]!.name} pageCount={parts[0]!.indices.length} />
              ) : (
                <Panel title="Parts">
                  <ul className="max-h-[28rem] divide-y overflow-auto">
                    {parts.map((p) => (
                      <li key={p.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-xs">{p.name}</span>
                          <span className="muted text-xs">pages {describeIndices(p.indices)} · {formatBytes(p.bytes.length)}</span>
                        </span>
                        <button type="button" className="btn btn-sm" onClick={() => downloadBlob(new Blob([p.bytes as BlobPart], { type: 'application/pdf' }), p.name)}>
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          ) : (
            <Panel title="Result"><p className="muted p-4 text-sm">Your split files will appear here, individually and as a ZIP.</p></Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
