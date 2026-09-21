import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { ColorField, NumberField, Panel, Segmented, SelectField } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { mix, parseColor, randomColor, rgbToHex } from '@/lib/color';
import { downloadText } from '@/lib/files';

type Kind = 'linear' | 'radial' | 'conic';
interface Stop {
  id: number;
  color: string;
  at: number;
}

const PRESETS: Array<{ name: string; stops: string[]; angle: number }> = [
  { name: 'Sunset', stops: ['#ff512f', '#f09819'], angle: 45 },
  { name: 'Ocean', stops: ['#2193b0', '#6dd5ed'], angle: 135 },
  { name: 'Aurora', stops: ['#0f766e', '#7c3aed', '#f59e0b'], angle: 120 },
  { name: 'Peach', stops: ['#ffecd2', '#fcb69f'], angle: 90 },
  { name: 'Midnight', stops: ['#0f0c29', '#302b63', '#24243e'], angle: 180 },
  { name: 'Mint', stops: ['#a8ff78', '#78ffd6'], angle: 60 },
  { name: 'Candy', stops: ['#ff9a9e', '#fecfef', '#fecfef'], angle: 20 },
  { name: 'Slate', stops: ['#1e293b', '#475569'], angle: 160 },
];

let nextId = 10;

export default function GradientTool(): React.ReactElement {
  const [kind, setKind] = useState<Kind>('linear');
  const [angle, setAngle] = useState(135);
  const [shape, setShape] = useState<'circle' | 'ellipse'>('circle');
  const [stops, setStops] = useState<Stop[]>([
    { id: 1, color: '#ff6a00', at: 0 },
    { id: 2, color: '#7c3aed', at: 100 },
  ]);
  const [space, setSpace] = useState<'srgb' | 'oklch' | 'oklab'>('srgb');
  const [smooth, setSmooth] = useState(false);

  const sorted = useMemo(() => [...stops].sort((a, b) => a.at - b.at), [stops]);

  const stopList = useMemo(() => {
    if (!smooth || sorted.length < 2) return sorted.map((s) => `${s.color} ${s.at}%`);
    // Ease between each pair with intermediate stops to avoid the grey "dead zone".
    const out: string[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = parseColor(sorted[i]!.color)!;
      const b = parseColor(sorted[i + 1]!.color)!;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const eased = t * t * (3 - 2 * t);
        const at = sorted[i]!.at + (sorted[i + 1]!.at - sorted[i]!.at) * t;
        out.push(`${rgbToHex(mix(a, b, eased))} ${at.toFixed(1)}%`);
      }
    }
    return out;
  }, [sorted, smooth]);

  const interp = space === 'srgb' ? '' : ` in ${space}`;
  const css = useMemo(() => {
    const list = stopList.join(', ');
    if (kind === 'linear') return `linear-gradient(${angle}deg${interp}, ${list})`;
    if (kind === 'radial') return `radial-gradient(${shape} at center${interp}, ${list})`;
    return `conic-gradient(from ${angle}deg at 50% 50%${interp}, ${list})`;
  }, [kind, angle, shape, stopList, interp]);

  const svg = useMemo(() => {
    const id = 'g';
    const rad = (angle * Math.PI) / 180;
    const x2 = 50 + Math.sin(rad) * 50;
    const y2 = 50 - Math.cos(rad) * 50;
    const x1 = 100 - x2;
    const y1 = 100 - y2;
    const stopsSvg = sorted.map((s) => `<stop offset="${s.at}%" stop-color="${s.color}"/>`).join('');
    const def = kind === 'radial' ? `<radialGradient id="${id}">${stopsSvg}</radialGradient>` : `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopsSvg}</linearGradient>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs>${def}</defs><rect width="1200" height="630" fill="url(#${id})"/></svg>`;
  }, [kind, angle, sorted]);

  const update = (id: number, patch: Partial<Stop>): void => setStops((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: number): void => setStops((s) => (s.length > 2 ? s.filter((x) => x.id !== id) : s));
  const add = (): void => {
    const a = sorted[sorted.length - 2]!;
    const b = sorted[sorted.length - 1]!;
    setStops((s) => [...s, { id: nextId++, color: rgbToHex(mix(parseColor(a.color)!, parseColor(b.color)!, 0.5)), at: Math.round((a.at + b.at) / 2) }]);
  };
  const applyPreset = (p: (typeof PRESETS)[number]): void => {
    setAngle(p.angle);
    setStops(p.stops.map((c, i) => ({ id: nextId++, color: c, at: Math.round((i / (p.stops.length - 1)) * 100) })));
  };
  const randomise = (): void => setStops((s) => s.map((x) => ({ ...x, color: rgbToHex(randomColor()) })));

  const code = `background: ${css};`;
  const tailwind = kind === 'linear' ? `bg-[${css.replace(/\s+/g, '_')}]` : `bg-[${css.replace(/\s+/g, '_')}]`;

  return (
    <ToolShell slug="gradient-generator">
      <div className="mb-4 h-64 rounded-2xl border shadow-inner sm:h-80" style={{ background: css }} role="img" aria-label="Gradient preview" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Shape">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'conic', label: 'Conic' }]} size="sm" />
              {kind !== 'radial' && (
                <div>
                  <label className="label" htmlFor="grad-angle">Angle — {angle}°</label>
                  <input id="grad-angle" type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full" />
                </div>
              )}
              {kind === 'radial' && <Segmented label="Shape" value={shape} onChange={setShape} options={[{ value: 'circle', label: 'Circle' }, { value: 'ellipse', label: 'Ellipse' }]} size="sm" />}
              <SelectField label="Interpolation" value={space} onChange={(v) => setSpace(v)} options={[{ value: 'srgb', label: 'sRGB (classic)' }, { value: 'oklch', label: 'OKLCH (vivid, modern browsers)' }, { value: 'oklab', label: 'OKLab (smooth, modern browsers)' }]} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> Eased stops (avoids muddy midpoints)
              </label>
            </div>
          </Panel>
          <Panel title="Presets">
            <div className="grid grid-cols-4 gap-2 p-4">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" className="h-12 rounded-lg border text-[0.6rem] font-semibold text-white shadow-inner" style={{ background: `linear-gradient(${p.angle}deg, ${p.stops.join(', ')})`, textShadow: '0 1px 2px rgba(0,0,0,.6)' }} onClick={() => applyPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel
            title="Colour stops"
            actions={
              <div className="flex gap-1">
                <button type="button" className="btn btn-sm" onClick={randomise}>Randomise</button>
                <button type="button" className="btn btn-sm" onClick={add}>Add stop</button>
              </div>
            }
          >
            <ul className="divide-y">
              {sorted.map((s) => (
                <li key={s.id} className="flex flex-wrap items-end gap-3 px-4 py-3">
                  <ColorField label="Colour" value={s.color} onChange={(c) => update(s.id, { color: c })} />
                  <NumberField label="Position %" value={s.at} onChange={(v) => update(s.id, { at: Math.max(0, Math.min(100, v)) })} min={0} max={100} className="w-28" />
                  <span className="flex-1 font-mono text-xs">{s.color}</span>
                  <button type="button" className="btn btn-sm" onClick={() => remove(s.id)} disabled={stops.length <= 2} aria-label={`Remove stop ${s.color}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <TextOutput value={code} label="CSS" filename="gradient.css" rows={3} wrap />
          <TextOutput value={tailwind} label="Tailwind arbitrary value" rows={2} wrap />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => downloadText(svg, 'gradient.svg', 'image/svg+xml')}>
              Download SVG (1200×630)
            </button>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
