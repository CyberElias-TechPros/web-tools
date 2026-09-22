import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Stat } from '@/components/ui';
import { KeyValue, TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { MIME_TYPES, byteHistogram, detectFileType, hexDump, sniffText } from '@/lib/filetype';
import type { FileSignature, TextSniff } from '@/lib/filetype';
import { formatBytes } from '@/lib/image';
import { isZipData, readZip } from '@/lib/zip-reader';
import { readImageMetadata } from '@/lib/exif';

interface Report {
  name: string;
  size: number;
  declared: string;
  lastModified: number;
  signature: FileSignature | null;
  text: TextSniff;
  histogram: ReturnType<typeof byteHistogram>;
  dump: string;
  zipEntries: number | null;
  image: { width: number; height: number } | null;
  extensionMismatch: string | null;
}

export default function InspectTool(): React.ReactElement {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: File[]): Promise<void> => {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const signature = detectFileType(bytes);
      const text = sniffText(bytes.subarray(0, 64 * 1024));
      const histogram = byteHistogram(bytes.subarray(0, 1024 * 1024));
      const dump = hexDump(bytes, { length: 512 });
      let zipEntries: number | null = null;
      if (isZipData(bytes)) {
        try {
          zipEntries = (await readZip(buffer)).entries.length;
        } catch {
          zipEntries = null;
        }
      }
      let image: Report['image'] = null;
      if (signature?.category === 'image') {
        try {
          const meta = readImageMetadata(buffer);
          if (meta.width && meta.height) image = { width: meta.width, height: meta.height };
        } catch {
          image = null;
        }
      }
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      const known = MIME_TYPES.find((m) => m.extension === ext);
      const extensionMismatch = signature && ext && known && known.mime !== signature.mime && !(known.mime.startsWith('text/') && text.isText) ? `The name says .${ext} (${known.description}) but the content is ${signature.description}.` : null;
      setReport({ name: file.name, size: file.size, declared: file.type || '—', lastModified: file.lastModified, signature, text, histogram, dump, zipEntries, image, extensionMismatch });
    } finally {
      setBusy(false);
    }
  };

  const r = report;
  const kind = r ? (r.signature ? r.signature.description : r.text.isText ? `Plain text${r.text.guess ? ` (${r.text.guess})` : ''}` : 'Unknown binary data') : '';

  return (
    <ToolShell slug="file-inspector">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} title="Drop any file" description="Identified by its bytes, not its name" disabled={busy} />
          {r && (
            <Panel title="Summary" bodyClassName="px-4">
              <KeyValue
                dense
                rows={[
                  { key: 'Name', value: r.name, mono: false },
                  { key: 'Size', value: `${formatBytes(r.size)} (${r.size.toLocaleString()} bytes)` },
                  { key: 'Modified', value: new Date(r.lastModified).toLocaleString(), mono: false },
                  { key: 'Browser says', value: r.declared },
                  { key: 'Detected', value: kind, mono: false },
                  ...(r.signature ? [{ key: 'MIME', value: r.signature.mime, copy: r.signature.mime }, { key: 'Extension', value: `.${r.signature.extension}` }, { key: 'Category', value: r.signature.category, mono: false }] : []),
                  ...(r.image ? [{ key: 'Dimensions', value: `${r.image.width} × ${r.image.height} px` }] : []),
                  ...(r.zipEntries !== null ? [{ key: 'ZIP entries', value: String(r.zipEntries) }] : []),
                ]}
              />
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {!r ? (
            <Panel title="What you’ll see"><p className="muted p-4 text-sm">Magic-number detection for 60+ formats, text encoding and line-ending sniffing, byte entropy (is it compressed or encrypted?), image dimensions, ZIP contents and a hex dump of the first 512 bytes.</p></Panel>
          ) : (
            <>
              {r.extensionMismatch && <Callout tone="warning" title="Extension mismatch">{r.extensionMismatch}</Callout>}
              <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                <Stat label="Entropy" value={`${r.histogram.entropy.toFixed(2)} / 8`} title={r.histogram.entropy > 7.5 ? 'Very high — compressed or encrypted' : r.histogram.entropy < 5 ? 'Low — mostly text or structured data' : 'Medium'} />
                <Stat label="Printable bytes" value={`${(r.histogram.printable * 100).toFixed(0)}%`} />
                <Stat label="Null bytes" value={r.histogram.nulls.toLocaleString()} />
                <Stat label="High-bit bytes" value={r.histogram.highBit.toLocaleString()} />
              </div>
              {r.text.isText && (
                <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                  <Stat label="Encoding" value={r.text.encoding} />
                  <Stat label="Line endings" value={r.text.lineEndings} />
                  <Stat label="Lines (first 64 KB)" value={r.text.lines.toLocaleString()} />
                  <Stat label="Looks like" value={r.text.guess ?? 'plain text'} />
                </div>
              )}
              <TextOutput value={r.dump} label="Hex dump (first 512 bytes)" filename={`${r.name}.hex.txt`} rows={18} />
            </>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
