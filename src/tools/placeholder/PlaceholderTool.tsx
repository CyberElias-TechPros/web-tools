import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { ColorField, NumberField, Panel, Segmented, TextField } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { placeholderSvg, rasterizeSvg, canvasToBlob } from '@/lib/canvas';
import type { PlaceholderOptions } from '@/lib/canvas';
import { svgToDataUri } from '@/lib/svgopt';
import { downloadBlob, downloadText } from '@/lib/files';

const SIZES = [
  ['1200 × 630 · Open Graph', 1200, 630],
  ['1920 × 1080 · Full HD', 1920, 1080],
  ['1080 × 1080 · Square', 1080, 1080],
  ['1080 × 1920 · Story', 1080, 1920],
  ['800 × 600', 800, 600],
  ['640 × 360', 640, 360],
  ['400 × 300', 400, 300],
  ['300 × 250 · Ad', 300, 250],
  ['150 × 150 · Thumb', 150, 150],
] as const;

export default function PlaceholderTool(): React.ReactElement {
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(450);
  const [background, setBackground] = useState('#e4e4e7');
  const [foreground, setForeground] = useState('#52525b');
  const [text, setText] = useState('');
  const [pattern, setPattern] = useState<NonNullable<PlaceholderOptions['pattern']>>('none');
  const [format, setFormat] = useState<'svg' | 'png' | 'jpeg'>('svg');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(1);
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  const options = useMemo<PlaceholderOptions>(() => ({ width: Math.max(1, Math.min(8000, width)), height: Math.max(1, Math.min(8000, height)), background, foreground, text: text || undefined, pattern, format }), [width, height, background, foreground, text, pattern, format]);
  const svg = useMemo(() => placeholderSvg(options), [options]);
  const dataUri = useMemo(() => svgToDataUri(svg), [svg]);

  useEffect(() => {
    if (format === 'svg') return;
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(() => {
      void rasterizeSvg(svg, { width: options.width, height: options.height }, format === 'jpeg' ? background : null)
        .then((canvas) => canvasToBlob(canvas, `image/${format}`, 0.92))
        .then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setPngUrl(url);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [svg, format, options.width, options.height, background]);

  const download = async (): Promise<void> => {
    setBusy(true);
    try {
      for (let i = 0; i < Math.max(1, count); i++) {
        const label = count > 1 ? `${text || `${options.width} × ${options.height}`} ${i + 1}` : text || undefined;
        const s = placeholderSvg({ ...options, text: label });
        const name = `placeholder-${options.width}x${options.height}${count > 1 ? `-${i + 1}` : ''}`;
        if (format === 'svg') downloadText(s, `${name}.svg`, 'image/svg+xml');
        else {
          const canvas = await rasterizeSvg(s, { width: options.width, height: options.height }, format === 'jpeg' ? background : null);
          downloadBlob(await canvasToBlob(canvas, `image/${format}`, 0.92), `${name}.${format === 'jpeg' ? 'jpg' : 'png'}`);
        }
        if (count > 1) await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell slug="placeholder-generator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="Options">
          <div className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Width" value={width} onChange={setWidth} min={1} max={8000} />
              <NumberField label="Height" value={height} onChange={setHeight} min={1} max={8000} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SIZES.map(([label, w, h]) => (
                <button key={label} type="button" className="chip hover:opacity-80" onClick={() => { setWidth(w); setHeight(h); }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ColorField label="Background" value={background} onChange={setBackground} />
              <ColorField label="Text" value={foreground} onChange={setForeground} />
            </div>
            <TextField label="Label (empty = dimensions)" value={text} onChange={setText} placeholder="Hero image" />
            <Segmented label="Pattern" value={pattern} onChange={setPattern} options={[{ value: 'none', label: 'None' }, { value: 'grid', label: 'Grid' }, { value: 'diagonal', label: 'Stripes' }, { value: 'dots', label: 'Dots' }]} size="sm" />
            <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'svg', label: 'SVG' }, { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }]} size="sm" />
            <div className="flex items-end gap-2">
              <NumberField label="How many" value={count} onChange={setCount} min={1} max={50} className="w-24" />
              <button type="button" className="btn btn-primary flex-1" onClick={() => void download()} disabled={busy}>
                {busy ? 'Rendering…' : `Download ${format.toUpperCase()}`}
              </button>
            </div>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <div className="checker flex items-center justify-center rounded-2xl border p-4">
            {format === 'svg' || !pngUrl ? (
              <img src={dataUri} alt={`Placeholder preview ${options.width} by ${options.height}`} className="max-h-[28rem] max-w-full rounded-lg shadow" />
            ) : (
              <img src={pngUrl} alt={`Placeholder preview ${options.width} by ${options.height}`} className="max-h-[28rem] max-w-full rounded-lg shadow" />
            )}
          </div>
          <TextOutput value={`<img src="${dataUri}" width="${options.width}" height="${options.height}" alt="">`} label="Inline <img> with data URI" rows={3} wrap />
          <TextOutput value={svg} label="SVG source" filename={`placeholder-${options.width}x${options.height}.svg`} mime="image/svg+xml" rows={5} wrap />
        </div>
      </div>
    </ToolShell>
  );
}
