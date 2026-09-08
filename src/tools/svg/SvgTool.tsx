import { useMemo, useState } from 'react';
import { Download, Layers, Shuffle } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import { CopyButton, FieldGroup, Panel, Segmented, Slider, Toggle } from '@/components/ui';
import {
  buildSvgDocument,
  defaultBlobOptions,
  defaultFillOptions,
  defaultWaveOptions,
  generateBlobPath,
  generateWavePath,
  svgToCss,
  svgToDataUri,
  svgToJsx,
} from '@/lib/svg';
import type { BlobOptions, FillOptions, WaveOptions } from '@/lib/svg';
import { downloadText } from '@/lib/files';
import { useLocalStorage } from '@/hooks';

type ShapeKind = 'wave' | 'blob';
type ExportFormat = 'svg' | 'css' | 'jsx' | 'datauri';

const PALETTES: Array<{ name: string; from: string; to: string }> = [
  { name: 'Indigo', from: '#6366f1', to: '#ec4899' },
  { name: 'Ocean', from: '#0ea5e9', to: '#06b6d4' },
  { name: 'Sunset', from: '#f97316', to: '#db2777' },
  { name: 'Forest', from: '#10b981', to: '#84cc16' },
  { name: 'Slate', from: '#475569', to: '#0f172a' },
  { name: 'Grape', from: '#8b5cf6', to: '#6366f1' },
];

export default function SvgTool(): React.ReactElement {
  const [kind, setKind] = useLocalStorage<ShapeKind>('wt:svg:kind', 'wave');
  const [wave, setWave] = useLocalStorage<WaveOptions>('wt:svg:wave', defaultWaveOptions);
  const [blob, setBlob] = useLocalStorage<BlobOptions>('wt:svg:blob', defaultBlobOptions);
  const [fill, setFill] = useLocalStorage<FillOptions>('wt:svg:fill', defaultFillOptions);
  const [layered, setLayered] = useLocalStorage<boolean>('wt:svg:layered', false);
  const [format, setFormat] = useState<ExportFormat>('svg');

  const setWaveKey = <K extends keyof WaveOptions>(key: K, value: WaveOptions[K]): void =>
    setWave((prev) => ({ ...prev, [key]: value }));
  const setBlobKey = <K extends keyof BlobOptions>(key: K, value: BlobOptions[K]): void =>
    setBlob((prev) => ({ ...prev, [key]: value }));
  const setFillKey = <K extends keyof FillOptions>(key: K, value: FillOptions[K]): void =>
    setFill((prev) => ({ ...prev, [key]: value }));

  const randomise = (): void => {
    const seed = Math.floor(Math.random() * 1_000_000);
    if (kind === 'wave') setWaveKey('seed', seed);
    else setBlobKey('seed', seed);
  };

  const { svg, width, height } = useMemo(() => {
    if (kind === 'wave') {
      const path = generateWavePath(wave);
      const layers = layered
        ? [1, 2].map((offset) => ({
            path: generateWavePath({
              ...wave,
              seed: wave.seed + offset * 977,
              amplitude: wave.amplitude * (1 - offset * 0.15),
            }),
            opacity: 0.28 / offset,
          }))
        : [];
      return {
        svg: buildSvgDocument({
          width: wave.width,
          height: wave.height,
          path,
          fill,
          layers,
          title: 'Decorative wave divider',
        }),
        width: wave.width,
        height: wave.height,
      };
    }
    const path = generateBlobPath(blob);
    const layers = layered
      ? [1, 2].map((offset) => ({
          path: generateBlobPath({ ...blob, seed: blob.seed + offset * 613 }),
          opacity: 0.24 / offset,
        }))
      : [];
    return {
      svg: buildSvgDocument({
        width: blob.size,
        height: blob.size,
        path,
        fill,
        layers,
        title: 'Decorative organic blob shape',
      }),
      width: blob.size,
      height: blob.size,
    };
  }, [kind, wave, blob, fill, layered]);

  const exported = useMemo(() => {
    switch (format) {
      case 'css':
        return svgToCss(svg);
      case 'jsx':
        return svgToJsx(svg);
      case 'datauri':
        return svgToDataUri(svg);
      case 'svg':
      default:
        return svg;
    }
  }, [svg, format]);

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return (
    <ToolShell
      slug="svg-generator"
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={randomise}>
            <Shuffle size={14} aria-hidden />
            Randomise
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => downloadText(svg, `${kind}-${kind === 'wave' ? wave.seed : blob.seed}.svg`, 'image/svg+xml')}
          >
            <Download size={14} aria-hidden />
            Download SVG
          </button>
        </>
      }
    >
      <div className="mb-4">
        <Segmented
          label="Shape type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'wave', label: 'Wave divider' },
            { value: 'blob', label: 'Organic blob' },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Panel title="Shape" bodyClassName="space-y-4 p-4">
            {kind === 'wave' ? (
              <>
                <Slider
                  label="Crests"
                  min={1}
                  max={12}
                  value={wave.complexity}
                  onChange={(v) => setWaveKey('complexity', v)}
                />
                <Slider
                  label="Amplitude"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={wave.amplitude}
                  onChange={(v) => setWaveKey('amplitude', v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Irregularity"
                  min={0}
                  max={1}
                  step={0.05}
                  value={wave.variance}
                  onChange={(v) => setWaveKey('variance', v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                  hint="0% gives a perfectly regular wave."
                />
                <FieldGroup label="Anchored edge">
                  <Segmented
                    size="sm"
                    value={wave.edge}
                    onChange={(v) => setWaveKey('edge', v)}
                    options={[
                      { value: 'bottom', label: 'Bottom' },
                      { value: 'top', label: 'Top' },
                    ]}
                  />
                </FieldGroup>
                <div className="space-y-2.5">
                  <Toggle
                    checked={wave.smooth}
                    onChange={(v) => setWaveKey('smooth', v)}
                    label="Smooth curves"
                    hint="Off produces angular, faceted crests."
                  />
                  <Toggle checked={wave.flipX} onChange={(v) => setWaveKey('flipX', v)} label="Mirror horizontally" />
                  <Toggle checked={layered} onChange={setLayered} label="Stack translucent layers" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Width" htmlFor="wave-w">
                    <input
                      id="wave-w"
                      type="number"
                      className="field"
                      min={100}
                      max={4000}
                      value={wave.width}
                      onChange={(e) => setWaveKey('width', Math.max(100, Math.min(4000, Number(e.target.value) || 100)))}
                    />
                  </FieldGroup>
                  <FieldGroup label="Height" htmlFor="wave-h">
                    <input
                      id="wave-h"
                      type="number"
                      className="field"
                      min={40}
                      max={1200}
                      value={wave.height}
                      onChange={(e) => setWaveKey('height', Math.max(40, Math.min(1200, Number(e.target.value) || 40)))}
                    />
                  </FieldGroup>
                </div>
              </>
            ) : (
              <>
                <Slider
                  label="Control points"
                  min={3}
                  max={16}
                  value={blob.points}
                  onChange={(v) => setBlobKey('points', v)}
                  hint="Fewer points give a rounder, calmer shape."
                />
                <Slider
                  label="Distortion"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={blob.randomness}
                  onChange={(v) => setBlobKey('randomness', v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Corner smoothing"
                  min={0}
                  max={1.6}
                  step={0.1}
                  value={blob.smoothing}
                  onChange={(v) => setBlobKey('smoothing', v)}
                  format={(v) => v.toFixed(1)}
                />
                <Slider
                  label="Canvas size"
                  min={200}
                  max={1200}
                  step={20}
                  value={blob.size}
                  onChange={(v) => setBlobKey('size', v)}
                  format={(v) => `${v}px`}
                />
                <Toggle checked={layered} onChange={setLayered} label="Stack translucent layers" />
              </>
            )}

            <FieldGroup label="Seed" hint="The same seed always produces the same shape.">
              <div className="flex gap-2">
                <input
                  type="number"
                  className="field code-area"
                  value={kind === 'wave' ? wave.seed : blob.seed}
                  onChange={(e) => {
                    const seed = Math.abs(Number(e.target.value) || 0);
                    if (kind === 'wave') setWaveKey('seed', seed);
                    else setBlobKey('seed', seed);
                  }}
                  aria-label="Random seed"
                />
                <button type="button" className="btn shrink-0" onClick={randomise} aria-label="New random seed">
                  <Shuffle size={15} aria-hidden />
                </button>
              </div>
            </FieldGroup>
          </Panel>

          <Panel title="Colour" bodyClassName="space-y-4 p-4">
            <FieldGroup label="Fill">
              <Segmented
                size="sm"
                value={fill.mode}
                onChange={(v) => setFillKey('mode', v)}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'linear', label: 'Linear' },
                  { value: 'radial', label: 'Radial' },
                ]}
              />
            </FieldGroup>

            <div className="flex flex-wrap gap-3">
              <ColorInput
                label={fill.mode === 'solid' ? 'Colour' : 'From'}
                value={fill.color1}
                onChange={(v) => setFillKey('color1', v)}
              />
              {fill.mode !== 'solid' && (
                <ColorInput label="To" value={fill.color2} onChange={(v) => setFillKey('color2', v)} />
              )}
            </div>

            {fill.mode === 'linear' && (
              <Slider
                label="Gradient angle"
                min={0}
                max={360}
                step={5}
                value={fill.angle}
                onChange={(v) => setFillKey('angle', v)}
                format={(v) => `${v}°`}
              />
            )}

            <Slider
              label="Opacity"
              min={0.1}
              max={1}
              step={0.05}
              value={fill.opacity}
              onChange={(v) => setFillKey('opacity', v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            <FieldGroup label="Palettes">
              <div className="flex flex-wrap gap-1.5">
                {PALETTES.map((palette) => (
                  <button
                    key={palette.name}
                    type="button"
                    className="h-7 w-12 rounded-md border transition-transform hover:scale-105"
                    style={{ background: `linear-gradient(120deg, ${palette.from}, ${palette.to})` }}
                    title={palette.name}
                    aria-label={`Apply the ${palette.name} palette`}
                    onClick={() => {
                      setFillKey('color1', palette.from);
                      setFillKey('color2', palette.to);
                    }}
                  />
                ))}
              </div>
            </FieldGroup>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel
            title="Preview"
            description={`${width} × ${height} — scales to any size without loss`}
            bodyClassName="p-0"
          >
            <div
              className="grid place-items-center overflow-hidden p-4"
              style={{
                background:
                  'repeating-conic-gradient(var(--surface-3) 0% 25%, transparent 0% 50%) 50% / 20px 20px',
              }}
            >
              <img
                src={dataUri}
                alt={kind === 'wave' ? 'Preview of the generated wave divider' : 'Preview of the generated blob shape'}
                className="max-h-[46vh] w-full object-contain"
                style={{ maxWidth: kind === 'blob' ? 420 : '100%' }}
              />
            </div>
          </Panel>

          {kind === 'wave' && (
            <Panel title="In context" description="How it looks as a section divider" bodyClassName="p-0">
              <div className="overflow-hidden rounded-b-[var(--radius-card)]">
                <div
                  className="grid place-items-center px-4 py-10 text-center"
                  style={{ background: 'var(--surface-3)' }}
                >
                  <p className="text-lg font-bold">Your hero section</p>
                  <p className="muted text-sm">The wave sits at the boundary below.</p>
                </div>
                <img src={dataUri} alt="" className="block w-full" style={{ marginTop: -1 }} />
              </div>
            </Panel>
          )}

          <Panel
            title={
              <Segmented
                size="sm"
                label="Export format"
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'svg', label: 'SVG' },
                  { value: 'css', label: 'CSS' },
                  { value: 'jsx', label: 'JSX' },
                  { value: 'datauri', label: 'Data URI' },
                ]}
              />
            }
            actions={
              <>
                <CopyButton value={exported} small />
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Download as ${format.toUpperCase()}`}
                  title={`Download as ${format.toUpperCase()}`}
                  onClick={() =>
                    downloadText(
                      exported,
                      `${kind}.${format === 'jsx' ? 'jsx' : format === 'css' ? 'css' : format === 'svg' ? 'svg' : 'txt'}`,
                      format === 'svg' ? 'image/svg+xml' : 'text/plain',
                    )
                  }
                >
                  <Download size={14} aria-hidden />
                </button>
              </>
            }
            bodyClassName="p-0"
          >
            <pre className="code-area max-h-64 overflow-auto p-3 whitespace-pre-wrap">{exported}</pre>
          </Panel>

          <div className="card flex gap-3 p-4">
            <Layers size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
            <div className="muted text-xs leading-relaxed">
              <p>
                <strong style={{ color: 'var(--text)' }}>Tip:</strong> the SVG has no fixed pixel
                dependency — it uses a <code className="font-mono">viewBox</code>, so setting{' '}
                <code className="font-mono">width: 100%</code> makes it stretch to any container. For
                a divider, place it flush against the section boundary with{' '}
                <code className="font-mono">display: block</code> to avoid the inline-image gap.
              </p>
              <p className="mt-2">
                Data URIs are convenient but bloat your CSS. For anything above a few kilobytes,
                download the file and reference it normally so the browser can cache it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field code-area w-24"
          aria-label={`${label} hex value`}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
