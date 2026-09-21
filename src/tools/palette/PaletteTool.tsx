import { useMemo, useState } from 'react';
import { useValidatedText } from '@/hooks';
import { ToolShell } from '@/components/ToolShell';
import { ColorField, CopyButton, Panel, Segmented, SelectField, TextField } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { adjust, contrastRatio, harmonies, isDark, parseColor, randomColor, rgbToHex, rgbToHsl, tonalScale } from '@/lib/color';
import type { HarmonyName, RGB } from '@/lib/color';
import { exportPalette } from '@/lib/palette';
import type { PaletteExportFormat } from '@/lib/palette';

type Scheme = HarmonyName | 'scale' | 'pastel' | 'vivid';

const SCHEMES: Array<{ value: Scheme; label: string }> = [
  { value: 'analogous', label: 'Analogous' },
  { value: 'complementary', label: 'Complementary' },
  { value: 'split-complementary', label: 'Split complementary' },
  { value: 'triadic', label: 'Triadic' },
  { value: 'tetradic', label: 'Tetradic' },
  { value: 'monochromatic', label: 'Monochromatic' },
  { value: 'scale', label: 'Tonal scale (50–950)' },
  { value: 'pastel', label: 'Pastel set' },
  { value: 'vivid', label: 'Vivid set' },
];

function build(base: RGB, scheme: Scheme): Array<{ color: RGB; name: string }> {
  if (scheme === 'scale') return tonalScale(base).map((s) => ({ color: s.color, name: String(s.step) }));
  if (scheme === 'pastel' || scheme === 'vivid') {
    const h = rgbToHsl(base).h;
    return [0, 30, 60, 120, 180, 240, 300].map((d, i) => ({ color: adjust({ ...base }, { h: d, s: scheme === 'pastel' ? -0.35 : 0.25, l: scheme === 'pastel' ? 0.25 : 0 }), name: `${scheme}-${i + 1}${d === 0 ? '' : ''} (${Math.round((h + d) % 360)}°)` }));
  }
  return harmonies(base)[scheme].map((c, i) => ({ color: c, name: `${scheme}-${i + 1}` }));
}

export default function PaletteTool(): React.ReactElement {
  const [baseText, setBaseText, validBase] = useValidatedText('#0ea5e9', isColor);
  const [scheme, setScheme] = useState<Scheme>('analogous');
  const [format, setFormat] = useState<PaletteExportFormat>('css');
  const [prefix, setPrefix] = useState('brand');
  const [locked, setLocked] = useState<Record<number, string>>({});
  const parsed = parseColor(baseText);
  const base = useMemo<RGB>(() => parseColor(baseText) ?? parseColor(validBase) ?? { r: 14, g: 165, b: 233, a: 1 }, [baseText, validBase]);

  const colors = useMemo(() => build(base, scheme).map((c, i) => (locked[i] ? { color: parseColor(locked[i]) ?? c.color, name: c.name } : c)), [base, scheme, locked]);
  const code = useMemo(() => exportPalette(colors.map((c) => ({ color: c.color, hex: rgbToHex(c.color), population: 0, percent: 0 })), format, prefix || 'color'), [colors, format, prefix]);
  const ext: Record<PaletteExportFormat, string> = { css: 'css', scss: 'scss', tailwind: 'js', json: 'json', text: 'txt', svg: 'svg' };

  return (
    <ToolShell slug="palette-generator">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <TextField label="Base colour" value={baseText} onChange={setBaseText} mono className="w-40" invalid={!parsed} />
        <ColorField label="Pick base" value={rgbToHex(base)} onChange={setBaseText} />
        <SelectField label="Scheme" value={scheme} onChange={(v) => setScheme(v)} options={SCHEMES} className="w-56" />
        <button type="button" className="btn btn-sm" onClick={() => { setBaseText(rgbToHex(randomColor())); setLocked({}); }}>
          Surprise me
        </button>
        {Object.keys(locked).length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => setLocked({})}>
            Unlock all
          </button>
        )}
      </div>
      <div className="mb-4 flex h-56 overflow-hidden rounded-2xl border" role="list" aria-label="Palette">
        {colors.map((c, i) => {
          const hex = rgbToHex(c.color);
          const dark = isDark(c.color);
          return (
            <div key={i} role="listitem" className="group relative flex flex-1 flex-col items-center justify-end gap-1 p-3 transition-[flex] hover:flex-[1.6]" style={{ background: hex, color: dark ? '#fff' : '#111' }}>
              <span className="font-mono text-xs font-semibold">{hex}</span>
              <span className="text-[0.6rem] opacity-80">{c.name}</span>
              <div className="flex gap-1">
                <CopyButton value={hex} small label="" className="!bg-transparent !px-1.5 !text-inherit" />
                <button type="button" className="btn btn-sm !bg-transparent !px-1.5 !text-inherit" onClick={() => setLocked((l) => (l[i] ? Object.fromEntries(Object.entries(l).filter(([k]) => Number(k) !== i)) : { ...l, [i]: hex }))} aria-pressed={Boolean(locked[i])} aria-label={locked[i] ? `Unlock ${hex}` : `Lock ${hex}`}>
                  {locked[i] ? '🔒' : '🔓'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Segmented label="Export as" value={format} onChange={setFormat} options={[{ value: 'css', label: 'CSS' }, { value: 'scss', label: 'SCSS' }, { value: 'tailwind', label: 'Tailwind' }, { value: 'json', label: 'JSON' }, { value: 'svg', label: 'SVG' }, { value: 'text', label: 'Text' }]} size="sm" />
            <TextField label="Variable prefix" value={prefix} onChange={setPrefix} mono className="w-36" />
          </div>
          <TextOutput value={code} label="Code" filename={`palette.${ext[format]}`} rows={14} />
        </div>
        <Panel title="Text on each colour">
          <ul className="divide-y text-sm">
            {colors.map((c, i) => {
              const hex = rgbToHex(c.color);
              const white = contrastRatio(c.color, { r: 255, g: 255, b: 255, a: 1 });
              const black = contrastRatio(c.color, { r: 0, g: 0, b: 0, a: 1 });
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-2">
                  <span className="h-6 w-6 shrink-0 rounded-md border" style={{ background: hex }} />
                  <span className="flex-1 font-mono text-xs">{hex}</span>
                  <span className="rounded px-2 py-0.5 font-mono text-xs" style={{ background: hex, color: '#fff' }}>{white.toFixed(1)}</span>
                  <span className="rounded px-2 py-0.5 font-mono text-xs" style={{ background: hex, color: '#000' }}>{black.toFixed(1)}</span>
                </li>
              );
            })}
          </ul>
          <p className="muted px-4 pb-3 text-xs">Contrast of white and black text; 4.5+ passes AA.</p>
        </Panel>
      </div>
    </ToolShell>
  );
}

const isColor = (text: string): boolean => parseColor(text) !== null;
