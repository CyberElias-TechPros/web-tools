import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, CopyButton, NumberField, Panel, Segmented, Toggle } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { decodeImage, pixelsOf, releaseImage } from '@/lib/canvas';
import { exportAse, exportPalette, extractPalette } from '@/lib/palette';
import type { PaletteColor, PaletteExportFormat } from '@/lib/palette';
import { formatColor, isDark } from '@/lib/color';
import { downloadBlob } from '@/lib/files';

export default function PaletteExtractTool(): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [pixels, setPixels] = useState<ImageData | null>(null);
  const [count, setCount] = useState(6);
  const [ignoreWhite, setIgnoreWhite] = useState(true);
  const [ignoreBlack, setIgnoreBlack] = useState(false);
  const [format, setFormat] = useState<PaletteExportFormat>('css');
  const [error, setError] = useState<string | null>(null);
  const [colors, setColors] = useState<PaletteColor[]>([]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  useEffect(() => {
    if (!pixels) return;
    const t = setTimeout(() => setColors(extractPalette(pixels.data, Math.max(2, Math.min(16, count)), { ignoreTransparent: true, ignoreNearWhite: ignoreWhite, ignoreNearBlack: ignoreBlack })), 0);
    return () => clearTimeout(t);
  }, [pixels, count, ignoreWhite, ignoreBlack]);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      const img = await decodeImage(f);
      const data = pixelsOf(img, 400);
      releaseImage(img);
      setFile(f);
      setUrl(URL.createObjectURL(f));
      setPixels(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decode that image.');
    }
  };

  const code = colors.length ? exportPalette(colors, format, 'palette') : '';
  const ext: Record<PaletteExportFormat, string> = { css: 'css', scss: 'scss', tailwind: 'js', json: 'json', text: 'txt', svg: 'svg' };

  return (
    <ToolShell slug="palette-extractor">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept="image/*" title="Drop an image" description="Photos, screenshots, logos — analysed at a 400px sample" />
          {error && <Callout tone="error">{error}</Callout>}
          {url && (
            <div className="checker overflow-hidden rounded-2xl border">
              <img src={url} alt={file?.name ?? 'Uploaded image'} className="mx-auto max-h-72" />
            </div>
          )}
          <Panel title="Options">
            <div className="flex flex-col gap-3 p-4">
              <NumberField label="Colours" value={count} onChange={setCount} min={2} max={16} />
              <Toggle checked={ignoreWhite} onChange={setIgnoreWhite} label="Ignore near-white" hint="Backgrounds and paper" />
              <Toggle checked={ignoreBlack} onChange={setIgnoreBlack} label="Ignore near-black" />
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          {colors.length ? (
            <>
              <div className="flex h-40 overflow-hidden rounded-2xl border" role="list" aria-label="Extracted palette">
                {colors.map((c) => (
                  <div key={c.hex} role="listitem" className="flex flex-col items-center justify-end gap-1 p-2 text-center" style={{ background: c.hex, color: isDark(c.color) ? '#fff' : '#111', flex: Math.max(0.6, c.percent / 10) }}>
                    <span className="font-mono text-[0.65rem] font-semibold">{c.hex}</span>
                    <span className="text-[0.6rem] opacity-80">{c.percent.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <Panel title="Colours">
                <ul className="divide-y text-sm">
                  {colors.map((c) => {
                    const f = formatColor(c.color);
                    return (
                      <li key={c.hex} className="flex items-center gap-3 px-4 py-2">
                        <span className="h-8 w-8 shrink-0 rounded-lg border" style={{ background: c.hex }} />
                        <span className="w-20 font-mono text-xs">{c.hex}</span>
                        <span className="muted hidden flex-1 truncate font-mono text-xs sm:block">{f.hsl} · {f.oklch}</span>
                        <span className="muted w-12 text-right font-mono text-xs">{c.percent.toFixed(1)}%</span>
                        <CopyButton value={c.hex} small label="" className="!px-1.5" />
                      </li>
                    );
                  })}
                </ul>
              </Panel>
              <div className="flex flex-wrap items-end gap-2">
                <Segmented label="Export" value={format} onChange={setFormat} options={[{ value: 'css', label: 'CSS' }, { value: 'scss', label: 'SCSS' }, { value: 'tailwind', label: 'Tailwind' }, { value: 'json', label: 'JSON' }, { value: 'svg', label: 'SVG' }, { value: 'text', label: 'Text' }]} size="sm" />
                <button type="button" className="btn btn-sm" onClick={() => downloadBlob(new Blob([exportAse(colors) as BlobPart], { type: 'application/octet-stream' }), 'palette.ase')}>
                  Download .ASE (Adobe)
                </button>
              </div>
              <TextOutput value={code} label="Code" filename={`palette.${ext[format]}`} rows={10} />
            </>
          ) : (
            <Panel title="Dominant colours"><p className="muted p-4 text-sm">Median-cut quantisation finds the colours that actually make up the image, weighted by how much of the picture they cover. Export as CSS variables, Tailwind config, JSON, SVG swatches or an Adobe .ase file.</p></Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
