import { useEffect, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, NumberField, Panel, Segmented, TextField, Toggle } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { blobToBytes, canvasToBlob, createCanvas, context2d, decodeImage, rasterizeSvg, releaseImage, sizeOf } from '@/lib/canvas';
import type { DecodedImage } from '@/lib/canvas';
import { DEFAULT_FAVICON_SET, buildIco, faviconHtmlSnippet, faviconManifest } from '@/lib/ico';
import { createZip } from '@/lib/zip';
import { downloadBlob } from '@/lib/files';
import { formatBytes } from '@/lib/image';

type Source = 'image' | 'text';

function textSvg(text: string, bg: string, fg: string, radius: number, font: string): string {
  const size = 512;
  const fontSize = text.length <= 1 ? 320 : text.length === 2 ? 240 : 170;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${(radius / 100) * size * 0.5}" fill="${bg}"/><text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${fontSize}" fill="${fg}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
}

async function renderSquare(source: DecodedImage | HTMLCanvasElement, size: number, padding: number, bg: string | null, radius: number): Promise<HTMLCanvasElement> {
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  if (radius > 0) {
    const r = (radius / 100) * size * 0.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.clip();
  }
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const src = sizeOf(source);
  const inner = size * (1 - padding / 100);
  const scale = Math.min(inner / src.width, inner / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
  return Promise.resolve(canvas);
}

export default function FaviconTool(): React.ReactElement {
  const [source, setSource] = useState<Source>('image');
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('W');
  const [bg, setBg] = useState('#0b0b0f');
  const [fg, setFg] = useState('#ffb454');
  const [font, setFont] = useState('Inter, system-ui, sans-serif');
  const [radius, setRadius] = useState(22);
  const [padding, setPadding] = useState(0);
  const [transparentBg, setTransparentBg] = useState(true);
  const [appName, setAppName] = useState('My App');
  const [themeColor, setThemeColor] = useState('#0b0b0f');
  const [previews, setPreviews] = useState<Array<{ size: number; url: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  useEffect(() => () => { if (image) releaseImage(image); }, [image]);

  const getBase = async (): Promise<DecodedImage | HTMLCanvasElement | null> => {
    if (source === 'text') return rasterizeSvg(textSvg(text.slice(0, 3), bg, fg, radius, font), { width: 512, height: 512 });
    return image;
  };

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const base = source === 'text' ? await rasterizeSvg(textSvg(text.slice(0, 3), bg, fg, radius, font), { width: 512, height: 512 }) : image;
        if (!base || cancelled) return;
        const urls: Array<{ size: number; url: string }> = [];
        for (const size of [16, 32, 64, 180]) {
          const canvas = await renderSquare(base, size, source === 'image' ? padding : 0, source === 'image' && !transparentBg ? bg : null, source === 'image' ? radius : 0);
          urls.push({ size, url: URL.createObjectURL(await canvasToBlob(canvas, 'image/png')) });
        }
        if (cancelled) urls.forEach((u) => URL.revokeObjectURL(u.url));
        else setPreviews(urls);
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [source, image, text, bg, fg, radius, padding, transparentBg, font]);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      const img = await decodeImage(f);
      setImage(img);
      setFileName(f.name);
      setSource('image');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decode that image.');
    }
  };

  const html = faviconHtmlSnippet(DEFAULT_FAVICON_SET, themeColor);
  const manifest = faviconManifest(DEFAULT_FAVICON_SET, appName, themeColor, transparentBg ? '#ffffff' : bg);

  const build = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const base = await getBase();
      if (!base) throw new Error('Add an image or some text first.');
      const pngs: Array<{ name: string; size: number; data: Uint8Array }> = [];
      const sizes = new Set<number>([...DEFAULT_FAVICON_SET.ico, ...DEFAULT_FAVICON_SET.png.map((p) => p.size)]);
      const rendered = new Map<number, Uint8Array>();
      for (const size of sizes) {
        const canvas = await renderSquare(base, size, source === 'image' ? padding : 0, source === 'image' && !transparentBg ? bg : null, source === 'image' ? radius : 0);
        rendered.set(size, await blobToBytes(await canvasToBlob(canvas, 'image/png')));
      }
      for (const p of DEFAULT_FAVICON_SET.png) pngs.push({ name: p.name, size: p.size, data: rendered.get(p.size)! });
      const ico = buildIco(DEFAULT_FAVICON_SET.ico.map((s) => ({ size: s, png: rendered.get(s)! })));
      const svgSource = source === 'text' ? textSvg(text.slice(0, 3), bg, fg, radius, font) : null;
      const enc = new TextEncoder();
      const zip = await createZip([
        { name: 'favicon.ico', data: ico },
        ...pngs.map((p) => ({ name: p.name, data: p.data })),
        ...(svgSource ? [{ name: 'icon.svg', data: enc.encode(svgSource) }] : []),
        { name: 'site.webmanifest', data: enc.encode(manifest) },
        { name: 'README.html', data: enc.encode(`<!doctype html><title>Favicon set</title><p>Copy these files to the root of your site and add to &lt;head&gt;:</p><pre>${html.replace(/</g, '&lt;')}</pre>`) },
      ]);
      downloadBlob(zip, 'favicons.zip');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = source === 'text' ? text.trim().length > 0 : Boolean(image);

  return (
    <ToolShell slug="favicon-generator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Segmented label="Source" value={source} onChange={setSource} options={[{ value: 'image', label: 'From an image' }, { value: 'text', label: 'From a letter' }]} />
          {source === 'image' ? (
            <>
              <Dropzone onFiles={onFiles} accept="image/*,.svg" title={fileName || 'Drop a logo'} description="Square PNG or SVG, ideally 512px+" compact={Boolean(image)} />
              <Panel title="Adjust">
                <div className="flex flex-col gap-3 p-4">
                  <NumberField label="Corner radius (%)" value={radius} onChange={setRadius} min={0} max={100} />
                  <NumberField label="Padding (%)" value={padding} onChange={setPadding} min={0} max={40} />
                  <Toggle checked={transparentBg} onChange={setTransparentBg} label="Transparent background" />
                  {!transparentBg && <ColorField label="Background" value={bg} onChange={setBg} />}
                </div>
              </Panel>
            </>
          ) : (
            <Panel title="Letter mark">
              <div className="flex flex-col gap-3 p-4">
                <TextField label="Text (1–3 characters)" value={text} onChange={(v) => setText(v.slice(0, 3))} maxLength={3} />
                <div className="grid grid-cols-2 gap-2">
                  <ColorField label="Background" value={bg} onChange={setBg} />
                  <ColorField label="Letter" value={fg} onChange={setFg} />
                </div>
                <TextField label="Font family" value={font} onChange={setFont} mono />
                <NumberField label="Corner radius (%)" value={radius} onChange={setRadius} min={0} max={100} />
              </div>
            </Panel>
          )}
          <Panel title="Manifest">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="App name" value={appName} onChange={setAppName} />
              <ColorField label="Theme colour" value={themeColor} onChange={setThemeColor} />
            </div>
          </Panel>
          {error && <Callout tone="error">{error}</Callout>}
          <button type="button" className="btn btn-primary" onClick={() => void build()} disabled={!ready || busy}>
            {busy ? 'Building…' : 'Download favicon pack (.zip)'}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Preview">
            <div className="flex flex-wrap items-end gap-6 p-6">
              {previews.length ? (
                previews.map((p) => (
                  <div key={p.size} className="text-center">
                    <div className="checker inline-block rounded-lg border p-2"><img src={p.url} alt={`${p.size}px favicon preview`} width={p.size > 64 ? 64 : p.size} height={p.size > 64 ? 64 : p.size} style={{ imageRendering: p.size <= 32 ? 'pixelated' : 'auto' }} /></div>
                    <div className="muted mt-1 text-xs">{p.size}px</div>
                  </div>
                ))
              ) : (
                <p className="muted text-sm">Add a logo or type a letter to preview.</p>
              )}
              {previews[1] && (
                <div className="ml-auto flex items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-sm shadow-sm" style={{ background: 'var(--surface-2)' }}>
                  <img src={previews[1].url} alt="" width={16} height={16} />
                  <span>{appName} — Home</span>
                  <span className="muted">×</span>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="What’s in the pack">
            <ul className="divide-y text-sm">
              <li className="flex justify-between px-4 py-1.5"><span className="font-mono">favicon.ico</span><span className="muted">16 + 32 + 48 px, legacy browsers</span></li>
              {DEFAULT_FAVICON_SET.png.map((p) => (
                <li key={p.name} className="flex justify-between px-4 py-1.5"><span className="font-mono">{p.name}</span><span className="muted">{p.purpose}</span></li>
              ))}
              <li className="flex justify-between px-4 py-1.5"><span className="font-mono">site.webmanifest</span><span className="muted">PWA metadata</span></li>
            </ul>
          </Panel>
          <TextOutput value={html} label="Add to <head>" filename="favicon-head.html" rows={8} wrap />
          <TextOutput value={manifest} label="site.webmanifest" filename="site.webmanifest" rows={8} />
          {previews.length > 0 && <p className="muted text-xs">Estimated pack size ≈ {formatBytes(previews.length * 3000)} — tiny.</p>}
        </div>
      </div>
    </ToolShell>
  );
}
