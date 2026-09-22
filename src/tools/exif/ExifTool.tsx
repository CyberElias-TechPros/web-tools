import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Stat, Toggle } from '@/components/ui';
import { DataTable, KeyValue } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { readImageMetadata, stripJpegMetadata, stripPngMetadata } from '@/lib/exif';
import type { ExifReport } from '@/lib/exif';
import { downloadBlob } from '@/lib/files';
import { formatBytes } from '@/lib/image';

interface Loaded {
  file: File;
  url: string;
  report: ExifReport;
}

export default function ExifTool(): React.ReactElement {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepOrientation, setKeepOrientation] = useState(true);
  const [keepIcc, setKeepIcc] = useState(true);
  const [stripped, setStripped] = useState<{ size: number; removed: number } | null>(null);

  useEffect(() => () => { if (loaded) URL.revokeObjectURL(loaded.url); }, [loaded]);

  const onFiles = async (files: File[]): Promise<void> => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setStripped(null);
    try {
      const report = readImageMetadata(await file.arrayBuffer());
      setLoaded({ file, url: URL.createObjectURL(file), report });
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const strip = async (): Promise<void> => {
    if (!loaded) return;
    const buffer = await loaded.file.arrayBuffer();
    const isPng = loaded.report.format.toLowerCase().includes('png');
    const out = isPng ? stripPngMetadata(buffer) : stripJpegMetadata(buffer, { keepIcc, keepOrientation });
    const blob = new Blob([out.bytes as BlobPart], { type: loaded.file.type });
    setStripped({ size: blob.size, removed: out.removed });
    const base = loaded.file.name.replace(/\.[^.]+$/, '');
    downloadBlob(blob, `${base}-clean.${isPng ? 'png' : 'jpg'}`);
  };

  const r = loaded?.report;
  const canStrip = r ? /jpeg|jpg|png/i.test(r.format) : false;
  const groups = r ? (['image', 'exif', 'gps', 'interop', 'thumbnail'] as const).map((g) => ({ g, rows: r.entries.filter((e) => e.group === g) })).filter((x) => x.rows.length) : [];

  return (
    <ToolShell slug="exif-viewer">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept="image/*,.heic,.avif" title="Drop a photo" description="JPEG, PNG, WebP, HEIC, AVIF, TIFF, GIF…" />
          {error && <Callout tone="error">{error}</Callout>}
          {loaded && (
            <>
              <div className="checker overflow-hidden rounded-2xl border">
                <img src={loaded.url} alt={loaded.file.name} className="mx-auto max-h-72" />
              </div>
              <Panel title="Remove metadata" description="Share photos without location, device and timestamp data.">
                <div className="flex flex-col gap-3 p-4">
                  {!/png/i.test(r!.format) && (
                    <>
                      <Toggle checked={keepOrientation} onChange={setKeepOrientation} label="Keep orientation tag" hint="Otherwise rotated photos may display sideways" />
                      <Toggle checked={keepIcc} onChange={setKeepIcc} label="Keep colour profile (ICC)" hint="Preserves accurate colours on wide-gamut screens" />
                    </>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => void strip()} disabled={!canStrip}>
                    {canStrip ? 'Download clean copy' : 'Stripping supports JPEG and PNG'}
                  </button>
                  {stripped && <Callout tone="success">Removed {stripped.removed} metadata block{stripped.removed === 1 ? '' : 's'} — {formatBytes(loaded.file.size)} → {formatBytes(stripped.size)}.</Callout>}
                </div>
              </Panel>
            </>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {!r ? (
            <Panel title="What’s inside a photo"><p className="muted p-4 text-sm">Camera make and model, lens, exposure, ISO, GPS coordinates, timestamps, software and thumbnails. Drop an image to read every tag — and strip them before you share.</p></Panel>
          ) : (
            <>
              <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                <Stat label="Format" value={r.format} />
                <Stat label="Dimensions" value={r.width && r.height ? `${r.width} × ${r.height}` : '—'} />
                <Stat label="File size" value={formatBytes(loaded.file.size)} />
                <Stat label="Metadata" value={[r.hasExif && 'EXIF', r.hasIcc && 'ICC', r.hasXmp && 'XMP'].filter(Boolean).join(' · ') || 'none'} />
              </div>
              {(r.camera || r.lens || r.dateTaken || r.gps) && (
                <Panel title="Highlights" bodyClassName="px-4">
                  <KeyValue
                    dense
                    rows={[
                      ...(r.camera ? [{ key: 'Camera', value: r.camera, mono: false }] : []),
                      ...(r.lens ? [{ key: 'Lens', value: r.lens, mono: false }] : []),
                      ...(r.dateTaken ? [{ key: 'Taken', value: r.dateTaken }] : []),
                      ...(r.orientation ? [{ key: 'Orientation', value: String(r.orientation) }] : []),
                      ...(r.gps
                        ? [
                            { key: 'GPS', value: `${r.gps.latitude.toFixed(6)}, ${r.gps.longitude.toFixed(6)}${r.gps.altitude !== undefined ? ` · ${r.gps.altitude.toFixed(0)} m` : ''}`, copy: `${r.gps.latitude}, ${r.gps.longitude}` },
                            {
                              key: 'Map',
                              value: (
                                <a className="link" href={`https://www.openstreetmap.org/?mlat=${r.gps.latitude}&mlon=${r.gps.longitude}#map=15/${r.gps.latitude}/${r.gps.longitude}`} target="_blank" rel="noreferrer noopener">
                                  Open in OpenStreetMap
                                </a>
                              ),
                              mono: false,
                            },
                          ]
                        : []),
                    ]}
                  />
                </Panel>
              )}
              {r.gps && <Callout tone="warning" title="This photo contains a location">Anyone you send the original to can see where it was taken. Use “Download clean copy” to remove it.</Callout>}
              {groups.map(({ g, rows }) => (
                <Panel key={g} title={`${g.toUpperCase()} tags`} description={`${rows.length} entries`}>
                  <DataTable headers={['Tag', 'Value']} rows={rows.map((e) => [e.name, e.value])} maxHeight="20rem" />
                </Panel>
              ))}
              {r.entries.length === 0 && <Callout tone="info">No EXIF tags found — this file carries no camera metadata.</Callout>}
              {r.segments.length > 0 && (
                <Panel title="File structure">
                  <DataTable headers={['Segment', 'Size', 'Meaning']} rows={r.segments.map((s) => [s.marker, formatBytes(s.length), s.description])} maxHeight="14rem" />
                </Panel>
              )}
              {r.warnings.map((w) => (
                <Callout key={w} tone="warning">{w}</Callout>
              ))}
            </>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
