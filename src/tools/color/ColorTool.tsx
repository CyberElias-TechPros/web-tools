import { useMemo } from 'react';
import { useValidatedText } from '@/hooks';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, Panel, TextField } from '@/components/ui';
import { KeyValue } from '@/components/TextIO';
import { CVD_TYPES, contrastRatio, formatColor, harmonies, isDark, nearestNamedColor, parseColor, randomColor, rgbToHex, simulateCvd, tonalScale } from '@/lib/color';
import type { HarmonyName, RGB } from '@/lib/color';

const HARMONY_LABELS: Record<HarmonyName, string> = { complementary: 'Complementary', analogous: 'Analogous', triadic: 'Triadic', 'split-complementary': 'Split complementary', tetradic: 'Tetradic', monochromatic: 'Monochromatic' };

function Swatch({ color, label, onPick, size = 'md' }: { color: RGB; label?: string; onPick?: (hex: string) => void; size?: 'sm' | 'md' }): React.ReactElement {
  const hex = rgbToHex(color);
  const body = (
    <>
      <span className={`block rounded-lg border ${size === 'sm' ? 'h-8' : 'h-12'}`} style={{ background: hex }} />
      <span className="mt-1 block truncate font-mono text-[0.65rem]">{label ?? hex}</span>
    </>
  );
  return onPick ? (
    <button type="button" className="min-w-0 text-left" onClick={() => onPick(hex)} aria-label={`Use ${hex}`}>
      {body}
    </button>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}

export default function ColorTool(): React.ReactElement {
  const [input, setInput, validText] = useValidatedText('#ff6a00', isColor);
  const parsed = useMemo(() => parseColor(input), [input]);
  const color = useMemo<RGB>(() => parsed ?? parseColor(validText) ?? { r: 255, g: 106, b: 0, a: 1 }, [parsed, validText]);
  const formats = useMemo(() => formatColor(color), [color]);
  const hex = rgbToHex(color);
  const nearest = nearestNamedColor(color);
  const harm = useMemo(() => harmonies(color), [color]);
  const scale = useMemo(() => tonalScale(color), [color]);
  const onWhite = contrastRatio(color, { r: 255, g: 255, b: 255, a: 1 });
  const onBlack = contrastRatio(color, { r: 0, g: 0, b: 0, a: 1 });

  return (
    <ToolShell slug="color-converter">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Colour">
            <div className="flex flex-col gap-3 p-4">
              <div className="h-28 rounded-xl border" style={{ background: hex }} aria-hidden />
              <TextField label="Any CSS colour" value={input} onChange={setInput} mono autoFocus invalid={!parsed} hint={parsed ? (formats.name ? `Named colour: ${formats.name}` : `Closest name: ${nearest.name}`) : 'Try #ff6a00, rgb(255 106 0), hsl(25 100% 50%), oklch(70% 0.2 50) or “tomato”.'} />
              <ColorField label="Pick" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'} onChange={setInput} />
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="chip hover:opacity-80" onClick={() => setInput(rgbToHex(randomColor()))}>Random</button>
                {['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#0b0b0f', '#f8fafc'].map((h) => (
                  <button key={h} type="button" className="h-6 w-6 rounded-full border" style={{ background: h }} onClick={() => setInput(h)} aria-label={`Use ${h}`} />
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Contrast">
            <div className="grid grid-cols-2 gap-3 p-4 text-sm">
              <div className="rounded-lg border bg-white p-3 text-center" style={{ color: hex }}>
                <div className="font-semibold">On white</div>
                <div className="font-mono">{onWhite.toFixed(2)}:1</div>
              </div>
              <div className="rounded-lg border bg-black p-3 text-center" style={{ color: hex }}>
                <div className="font-semibold">On black</div>
                <div className="font-mono">{onBlack.toFixed(2)}:1</div>
              </div>
              <p className="muted col-span-2 text-xs">Use {isDark(color) ? 'white' : 'black'} text on this colour. Full checker in the Contrast Checker tool.</p>
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Formats" bodyClassName="px-4">
            <KeyValue
              dense
              rows={[
                { key: 'HEX', value: formats.hex, copy: formats.hex },
                ...(color.a < 1 ? [{ key: 'HEX + alpha', value: formats.hexAlpha, copy: formats.hexAlpha }] : []),
                { key: 'RGB', value: formats.rgb, copy: formats.rgb },
                { key: 'RGB (legacy)', value: formats.rgbLegacy, copy: formats.rgbLegacy },
                { key: 'HSL', value: formats.hsl, copy: formats.hsl },
                { key: 'HWB', value: formats.hwb, copy: formats.hwb },
                { key: 'OKLCH', value: formats.oklch, copy: formats.oklch },
                { key: 'OKLab', value: formats.oklab, copy: formats.oklab },
                { key: 'CIE Lab', value: formats.lab, copy: formats.lab },
                { key: 'CMYK', value: formats.cmyk, copy: formats.cmyk },
                { key: 'SwiftUI', value: formats.swiftUI, copy: formats.swiftUI },
                { key: 'Android', value: formats.android, copy: formats.android },
                { key: 'Tailwind', value: formats.tailwind, copy: formats.tailwind },
              ]}
            />
          </Panel>
          <Panel title="Tonal scale" description="50–950, like a design-system palette. Click to use.">
            <div className="grid grid-cols-11 gap-1 p-4">
              {scale.map((s) => (
                <Swatch key={s.step} color={s.color} label={String(s.step)} onPick={setInput} size="sm" />
              ))}
            </div>
          </Panel>
          <Panel title="Harmonies">
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {(Object.keys(harm) as HarmonyName[]).map((name) => (
                <div key={name}>
                  <div className="muted mb-1 text-xs font-semibold uppercase tracking-wide">{HARMONY_LABELS[name]}</div>
                  <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${harm[name].length}, minmax(0, 1fr))` }}>
                    {harm[name].map((c, i) => (
                      <Swatch key={i} color={c} onPick={setInput} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Colour-vision simulation">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {CVD_TYPES.map((t) => (
                <div key={t.id}>
                  <Swatch color={simulateCvd(color, t.id)} label={t.label} />
                  <div className="muted text-[0.65rem]">{t.prevalence}</div>
                </div>
              ))}
            </div>
          </Panel>
          {!parsed && <Callout tone="warning">Showing the last valid colour while you type.</Callout>}
        </div>
      </div>
    </ToolShell>
  );
}

const isColor = (text: string): boolean => parseColor(text) !== null;
