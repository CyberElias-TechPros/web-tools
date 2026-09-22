import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, CopyButton, Panel, Segmented, Stat } from '@/components/ui';
import { TextInput, TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { blobToDataUrl, dataUrlToBlob } from '@/lib/canvas';
import { downloadBlob, safeFilename } from '@/lib/files';
import { extensionForType, formatBytes } from '@/lib/image';

type Direction = 'encode' | 'decode';
type Decoded = { ok: true; blob: Blob; url: string; type: string } | { ok: false; error: string };
type Snippet = 'dataurl' | 'raw' | 'img' | 'css' | 'json';

function snippetFor(dataUrl: string, kind: Snippet, name: string): string {
  const raw = dataUrl.slice(dataUrl.indexOf(',') + 1);
  switch (kind) {
    case 'raw':
      return raw;
    case 'img':
      return `<img src="${dataUrl}" alt="${name.replace(/"/g, '&quot;')}" />`;
    case 'css':
      return `background-image: url("${dataUrl}");`;
    case 'json':
      return JSON.stringify({ name, dataUrl }, null, 2);
    default:
      return dataUrl;
  }
}

export default function ImageBase64Tool(): React.ReactElement {
  const [direction, setDirection] = useState<Direction>('encode');
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState('');
  const [snippet, setSnippet] = useState<Snippet>('dataurl');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      setDataUrl(await blobToDataUrl(f));
      setFile(f);
    } catch {
      setError('Could not read this file.');
    }
  };

  const output = useMemo(() => (dataUrl ? snippetFor(dataUrl, snippet, file?.name ?? 'image') : ''), [dataUrl, snippet, file]);

  const decoded = useMemo((): Decoded | null => {
    const text = input.trim();
    if (!text) return null;
    try {
      const url = text.startsWith('data:') ? text : `data:image/png;base64,${text.replace(/\s+/g, '')}`;
      const blob = dataUrlToBlob(url);
      return { ok: true, blob, url: URL.createObjectURL(blob), type: blob.type || 'image/png' };
    } catch {
      return { ok: false, error: 'That does not look like valid Base64 image data.' };
    }
  }, [input]);

  useEffect(() => () => { if (decoded?.ok) URL.revokeObjectURL(decoded.url); }, [decoded]);

  const overhead = file ? Math.round(((output.length - file.size) / file.size) * 100) : 0;

  return (
    <ToolShell slug="image-to-base64">
      <div className="flex flex-col gap-4">
        <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: 'encode', label: 'Image → Base64' }, { value: 'decode', label: 'Base64 → Image' }]} />
        {direction === 'encode' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="flex flex-col gap-4">
              <Dropzone onFiles={onFiles} accept="image/*,.svg,.ico" title={file ? file.name : 'Drop an image'} description={file ? `${file.type || 'unknown type'} · ${formatBytes(file.size)}` : 'PNG, JPEG, GIF, WebP, SVG, AVIF, ICO…'} compact={Boolean(file)} />
              {file && (
                <>
                  <div className="checker card flex items-center justify-center overflow-hidden p-2" style={{ minHeight: '10rem' }}>
                    <img src={dataUrl} alt={`Preview of ${file.name}`} className="max-h-64 max-w-full object-contain" />
                  </div>
                  <div className="card grid grid-cols-2 gap-2 p-3">
                    <Stat label="Original" value={formatBytes(file.size)} />
                    <Stat label="Encoded" value={formatBytes(output.length)} />
                    <Stat label="Overhead" value={`${overhead > 0 ? '+' : ''}${overhead}%`} tone={overhead > 40 ? 'bad' : 'default'} />
                    <Stat label="Type" value={file.type || '—'} />
                  </div>
                  {file.size > 100 * 1024 && <Callout tone="warning">Images over ~100 KB are usually better served as files — Base64 adds a third to the size and blocks caching.</Callout>}
                </>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {error && <Callout tone="error">{error}</Callout>}
              <Panel title="Output" actions={<Segmented value={snippet} onChange={setSnippet} options={[{ value: 'dataurl', label: 'Data URL' }, { value: 'raw', label: 'Raw' }, { value: 'img', label: '<img>' }, { value: 'css', label: 'CSS' }, { value: 'json', label: 'JSON' }]} size="sm" label="Snippet" />}>
                <div className="p-4">
                  <TextOutput value={output} label="Base64" filename={`${safeFilename(file?.name.replace(/\.[^.]+$/, '') ?? 'image')}.${snippet === 'json' ? 'json' : 'txt'}`} rows={18} fill />
                </div>
              </Panel>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <TextInput value={input} onChange={setInput} label="Base64 or data URL" rows={18} fill placeholder="data:image/png;base64,iVBORw0KGgo… or just the Base64 payload" accept=".txt" />
            <Panel title="Decoded image">
              <div className="flex flex-col gap-3 p-4">
                {!decoded && <p className="muted text-sm">Paste a data URL (or bare Base64 — PNG is assumed) to preview and download the image.</p>}
                {decoded && !decoded.ok && <Callout tone="error">{decoded.error}</Callout>}
                {decoded?.ok && (
                  <>
                    <div className="checker flex items-center justify-center rounded-xl p-2" style={{ minHeight: '10rem' }}>
                      <img src={decoded.url} alt="Decoded" className="max-h-72 max-w-full object-contain" onError={() => setError('The data decoded, but the browser could not display it as an image.')} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Stat label="Type" value={decoded.type} />
                      <Stat label="Size" value={formatBytes(decoded.blob.size)} />
                      <span className="flex-1" />
                      <CopyButton value={input.trim()} small label="Copy" />
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadBlob(decoded.blob, `decoded.${extensionForType(decoded.type)}`)}>Download</button>
                    </div>
                    {error && <Callout tone="warning">{error}</Callout>}
                  </>
                )}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
