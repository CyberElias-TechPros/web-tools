import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, NumberField, Panel, Segmented, Stat, Toggle } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { canvasToBlob, coverSize, cropCanvas, decodeImage, drawToCanvas, releaseImage, sizeOf, transformCanvas } from '@/lib/canvas';
import type { DecodedImage } from '@/lib/canvas';
import { extensionForType, formatBytes } from '@/lib/image';
import { downloadBlob } from '@/lib/files';

type Fit = 'fit' | 'cover' | 'stretch';
type Out = 'image/png' | 'image/jpeg' | 'image/webp';

const PRESETS = [
  ['Instagram post', 1080, 1080],
  ['Instagram story', 1080, 1920],
  ['Twitter / X header', 1500, 500],
  ['LinkedIn banner', 1584, 396],
  ['YouTube thumbnail', 1280, 720],
  ['Open Graph', 1200, 630],
  ['Full HD', 1920, 1080],
  ['4K', 3840, 2160],
  ['Passport photo 35×45 mm @300dpi', 413, 531],
  ['Avatar 512', 512, 512],
] as const;

export default function ResizeTool(): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [lock, setLock] = useState(true);
  const [fit, setFit] = useState<Fit>('fit');
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [out, setOut] = useState<Out>('image/jpeg');
  const [quality, setQuality] = useState(0.9);
  const [background, setBackground] = useState('#ffffff');
  const [preview, setPreview] = useState<{ url: string; size: number; width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (image) releaseImage(image); }, [image]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const ratio = natural.width && natural.height ? natural.width / natural.height : 16 / 9;
  const setW = (w: number): void => {
    setWidth(w);
    if (lock) setHeight(Math.max(1, Math.round(w / ratio)));
  };
  const setH = (h: number): void => {
    setHeight(h);
    if (lock) setWidth(Math.max(1, Math.round(h * ratio)));
  };

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      const img = await decodeImage(f);
      const size = sizeOf(img);
      setFile(f);
      setImage(img);
      setNatural(size);
      setWidth(size.width);
      setHeight(size.height);
      setRotate(0);
      setFlipX(false);
      setFlipY(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decode that image.');
    }
  };

  const render = useMemo(
    () =>
      async (): Promise<Blob> => {
        if (!image) throw new Error('No image');
        const oriented = rotate || flipX || flipY ? transformCanvas(image, { rotate, flipX, flipY }) : image;
        const src = sizeOf(oriented);
        const target = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
        let canvas: HTMLCanvasElement;
        if (fit === 'stretch') canvas = drawToCanvas(oriented, target, out === 'image/jpeg' ? background : null);
        else if (fit === 'cover') canvas = cropCanvas(oriented, coverSize(src, target), target);
        else {
          const scale = Math.min(target.width / src.width, target.height / src.height);
          const inner = { width: Math.max(1, Math.round(src.width * scale)), height: Math.max(1, Math.round(src.height * scale)) };
          canvas = drawToCanvas(oriented, inner, out === 'image/jpeg' ? background : null);
        }
        return canvasToBlob(canvas, out, quality);
      },
    [image, rotate, flipX, flipY, width, height, fit, out, background, quality],
  );

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const t = setTimeout(() => {
      render()
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          void decodeImage(blob).then((img) => {
            const s = sizeOf(img);
            releaseImage(img);
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }
            setPreview({ url, size: blob.size, width: s.width, height: s.height });
          });
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [image, render]);

  const download = async (): Promise<void> => {
    if (!file) return;
    const blob = await render();
    downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}-${width}x${height}.${extensionForType(out)}`);
  };

  return (
    <ToolShell slug="image-resizer">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept="image/*" title={file ? file.name : 'Drop an image'} description={file ? `${natural.width} × ${natural.height} · ${formatBytes(file.size)}` : 'PNG, JPEG, WebP, GIF, BMP, AVIF, SVG'} compact={Boolean(file)} />
          {error && <Callout tone="error">{error}</Callout>}
          <Panel title="Size">
            <div className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Width (px)" value={width} onChange={setW} min={1} max={10000} />
                <NumberField label="Height (px)" value={height} onChange={setH} min={1} max={10000} />
              </div>
              <Toggle checked={lock} onChange={setLock} label="Lock aspect ratio" />
              <div className="flex flex-wrap gap-1.5">
                {[25, 50, 75, 200].map((p) => (
                  <button key={p} type="button" className="chip hover:opacity-80" disabled={!natural.width} onClick={() => { setWidth(Math.round((natural.width * p) / 100)); setHeight(Math.round((natural.height * p) / 100)); }}>
                    {p}%
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(([label, w, h]) => (
                  <button key={label} type="button" className="chip hover:opacity-80" onClick={() => { setWidth(w); setHeight(h); setLock(false); setFit('cover'); }}>
                    {label}
                  </button>
                ))}
              </div>
              <Segmented label="When the ratio differs" value={fit} onChange={setFit} options={[{ value: 'fit', label: 'Fit inside' }, { value: 'cover', label: 'Crop to fill' }, { value: 'stretch', label: 'Stretch' }]} size="sm" />
            </div>
          </Panel>
          <Panel title="Rotate & flip">
            <div className="flex flex-wrap gap-2 p-4">
              <button type="button" className="btn btn-sm" onClick={() => setRotate(((rotate + 270) % 360) as typeof rotate)}>↺ 90°</button>
              <button type="button" className="btn btn-sm" onClick={() => setRotate(((rotate + 90) % 360) as typeof rotate)}>↻ 90°</button>
              <button type="button" className="btn btn-sm" onClick={() => setFlipX((v) => !v)} aria-pressed={flipX}>Flip horizontal</button>
              <button type="button" className="btn btn-sm" onClick={() => setFlipY((v) => !v)} aria-pressed={flipY}>Flip vertical</button>
            </div>
          </Panel>
          <Panel title="Output">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Format" value={out} onChange={setOut} options={[{ value: 'image/jpeg', label: 'JPEG' }, { value: 'image/png', label: 'PNG' }, { value: 'image/webp', label: 'WebP' }]} size="sm" />
              {out !== 'image/png' && (
                <div>
                  <label className="label" htmlFor="rq">Quality — {Math.round(quality * 100)}%</label>
                  <input id="rq" type="range" min={0.3} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
                </div>
              )}
              {out === 'image/jpeg' && <ColorField label="Background for transparency" value={background} onChange={setBackground} />}
              <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={!image}>
                Download
              </button>
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          {preview && (
            <div className="card grid grid-cols-3 gap-3 px-4 py-3">
              <Stat label="Output size" value={`${preview.width} × ${preview.height}`} />
              <Stat label="File size" value={formatBytes(preview.size)} />
              <Stat label="Scale" value={natural.width ? `${Math.round((preview.width / natural.width) * 100)}%` : '—'} />
            </div>
          )}
          <div className="checker flex min-h-96 flex-1 items-center justify-center rounded-2xl border p-4">
            {preview ? <img src={preview.url} alt="Resized preview" className="max-h-[36rem] max-w-full shadow" /> : <p className="muted text-sm">Drop an image to start. The preview updates live.</p>}
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
