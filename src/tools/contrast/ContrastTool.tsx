import { useMemo } from 'react';
import { useValidatedText } from '@/hooks';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, Panel, TextField } from '@/components/ui';
import { HeroResult } from '@/components/TextIO';
import { CVD_TYPES, adjust, apcaContrast, contrastRatio, contrastReport, parseColor, rgbToHex, rgbToHsl, simulateCvd } from '@/lib/color';
import type { RGB } from '@/lib/color';

function useColor(initial: string): [string, (v: string) => void, RGB, boolean] {
  const [text, setText, valid, ok] = useValidatedText(initial, isColor);
  const color = useMemo(() => parseColor(text) ?? parseColor(valid) ?? { r: 0, g: 0, b: 0, a: 1 }, [text, valid]);
  return [text, setText, color, ok && parseColor(text) !== null];
}

function Check({ ok, label, need }: { ok: boolean; label: string; need: string }): React.ReactElement {
  return (
    <li className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0">
      <span>
        <span className="font-medium">{label}</span> <span className="muted text-xs">needs {need}</span>
      </span>
      <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: ok ? 'color-mix(in oklab, var(--ok) 20%, transparent)' : 'color-mix(in oklab, var(--danger) 20%, transparent)', color: ok ? 'var(--ok)' : 'var(--danger)' }}>
        {ok ? 'Pass' : 'Fail'}
      </span>
    </li>
  );
}

export default function ContrastTool(): React.ReactElement {
  const [fgText, setFgText, fg, fgOk] = useColor('#1c1917');
  const [bgText, setBgText, bg, bgOk] = useColor('#fef3c7');
  const report = useMemo(() => contrastReport(fg, bg), [fg, bg]);
  const apca = useMemo(() => apcaContrast(fg, bg), [fg, bg]);
  const fgHex = rgbToHex(fg);
  const bgHex = rgbToHex(bg);

  const suggestion = report.aaNormal ? null : suggestFix(fg, bg);

  const swap = (): void => {
    setFgText(bgText);
    setBgText(fgText);
  };

  return (
    <ToolShell slug="contrast-checker">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Colours">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Text colour" value={fgText} onChange={setFgText} mono invalid={!fgOk} />
              <ColorField label="Pick text colour" value={fgHex} onChange={setFgText} />
              <TextField label="Background colour" value={bgText} onChange={setBgText} mono invalid={!bgOk} />
              <ColorField label="Pick background colour" value={bgHex} onChange={setBgText} />
              <button type="button" className="btn btn-sm self-start" onClick={swap}>
                Swap
              </button>
            </div>
          </Panel>
          {suggestion && (
            <Callout tone="info" title="Suggested fix">
              <p>
                Darkening/lightening the text to <code className="font-mono">{rgbToHex(suggestion.color)}</code> reaches {contrastRatio(suggestion.color, bg).toFixed(2)}:1.
              </p>
              <button type="button" className="btn btn-sm mt-2" onClick={() => setFgText(rgbToHex(suggestion.color))}>
                Apply
              </button>
            </Callout>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <HeroResult label="WCAG contrast ratio" value={`${report.ratio.toFixed(2)}:1`} sub={<span>{report.grade === 'Fail' ? 'Fails for all text' : `${report.grade}`} · APCA Lc {apca.toFixed(0)}</span>} />
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Preview">
              <div className="p-5" style={{ background: bgHex, color: fgHex }}>
                <p className="text-3xl font-semibold">Large heading</p>
                <p className="mt-2 text-base">Body copy at 16px. The quick brown fox jumps over the lazy dog while 1234567890 look on.</p>
                <p className="mt-2 text-xs">Small print at 12px — captions, labels and footnotes.</p>
                <div className="mt-3 inline-block rounded-md border-2 px-3 py-1 text-sm" style={{ borderColor: fgHex }}>
                  UI component border
                </div>
              </div>
            </Panel>
            <Panel title="WCAG 2.2 checks">
              <ul className="px-4 py-1">
                <Check ok={report.aaNormal} label="AA · normal text" need="4.5:1" />
                <Check ok={report.aaLarge} label="AA · large text (18pt / 14pt bold)" need="3:1" />
                <Check ok={report.aaaNormal} label="AAA · normal text" need="7:1" />
                <Check ok={report.aaaLarge} label="AAA · large text" need="4.5:1" />
                <Check ok={report.aaUi} label="AA · UI components & graphics" need="3:1" />
              </ul>
            </Panel>
          </div>
          <Panel title="APCA (WCAG 3 draft)" description="Lightness contrast Lc — sign shows polarity; magnitude is what matters.">
            <div className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
              {[
                ['Lc 90', 'Body text, preferred'],
                ['Lc 75', 'Body text, minimum'],
                ['Lc 60', 'Large / bold text'],
                ['Lc 45', 'Headlines, non-text'],
              ].map(([lc, use]) => {
                const need = Number(lc!.slice(3));
                const ok = Math.abs(apca) >= need;
                return (
                  <div key={lc} className="rounded-lg border p-3">
                    <div className="font-mono font-semibold" style={{ color: ok ? 'var(--ok)' : 'var(--danger)' }}>{lc} {ok ? '✓' : '✗'}</div>
                    <div className="muted text-xs">{use}</div>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="As seen with colour-vision deficiencies">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {CVD_TYPES.map((t) => {
                const f = simulateCvd(fg, t.id);
                const b = simulateCvd(bg, t.id);
                return (
                  <div key={t.id} className="rounded-lg border p-3 text-center" style={{ background: rgbToHex(b), color: rgbToHex(f) }}>
                    <div className="font-semibold">Aa</div>
                    <div className="text-xs">{t.label}</div>
                    <div className="font-mono text-xs">{contrastRatio(f, b).toFixed(2)}:1</div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}

const isColor = (text: string): boolean => parseColor(text) !== null;

/** Walk the text colour's lightness away from the background until it passes AA. */
function suggestFix(fg: RGB, bg: RGB): { color: RGB; steps: number } | null {
  const dir = rgbToHsl(bg).l > 0.5 ? -1 : 1;
  for (let i = 1; i <= 40; i++) {
    const candidate = adjust(fg, { l: dir * i * 0.02 });
    if (contrastRatio(candidate, bg) >= 4.5) return { color: candidate, steps: i };
  }
  return null;
}
