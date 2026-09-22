import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, Segmented, Stat, TextField, Toggle } from '@/components/ui';
import { TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { defaultSvgOptions, optimizeSvg, svgDimensions, svgToBase64DataUri, svgToDataUri, svgToReactComponent } from '@/lib/svgopt';
import type { SvgOptimizeOptions } from '@/lib/svgopt';
import { formatBytes, savingsPercent } from '@/lib/image';
import { useDebounced, useLocalStorage } from '@/hooks';

type View = 'svg' | 'datauri' | 'base64' | 'react' | 'css';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="24px" height="24px" viewBox="0 0 24 24" version="1.1" id="svg1" inkscape:version="1.3">
  <metadata id="metadata1"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><cc:Work xmlns:cc="http://creativecommons.org/ns#"><dc:format xmlns:dc="http://purl.org/dc/elements/1.1/">image/svg+xml</dc:format></cc:Work></rdf:RDF></metadata>
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff" />
  <title>Star</title>
  <g id="layer1" inkscape:label="Layer 1" inkscape:groupmode="layer">
    <g id="g1">
      <path id="path1" style="fill:#f59e0b;fill-opacity:1;stroke:none" d="M 12.000000,2.0000000 L 14.938926,8.5278640 L 22.000000,9.2705100 L 16.755283,14.070460 L 18.180340,21.000000 L 12.000000,17.500000 L 5.8196600,21.000000 L 7.2447170,14.070460 L 2.0000000,9.2705100 L 9.0610740,8.5278640 Z" />
    </g>
    <g id="empty-group"></g>
  </g>
</svg>`;

export default function SvgOptimizeTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [opts, setOpts] = useLocalStorage<SvgOptimizeOptions>('svgo:opts', defaultSvgOptions);
  const [view, setView] = useState<View>('svg');
  const [componentName, setComponentName] = useState('Icon');
  const [ts, setTs] = useState(true);
  const debounced = useDebounced(input, 120);
  const set = <K extends keyof SvgOptimizeOptions>(k: K, v: SvgOptimizeOptions[K]): void => setOpts((o) => ({ ...o, [k]: v }));

  const result = useMemo(() => {
    if (!debounced.trim()) return null;
    try {
      return { ...optimizeSvg(debounced, opts), error: null as string | null };
    } catch (e) {
      return { svg: '', before: 0, after: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [debounced, opts]);

  const output = useMemo(() => {
    if (!result?.svg) return '';
    switch (view) {
      case 'datauri':
        return svgToDataUri(result.svg);
      case 'base64':
        return svgToBase64DataUri(result.svg);
      case 'react':
        return svgToReactComponent(result.svg, componentName || 'Icon', ts);
      case 'css':
        return `.icon {\n  background-image: url("${svgToDataUri(result.svg)}");\n  background-repeat: no-repeat;\n  background-size: contain;\n}`;
      default:
        return result.svg;
    }
  }, [result, view, componentName, ts]);

  const dims = result?.svg ? svgDimensions(result.svg) : null;
  const filenames: Record<View, string> = { svg: 'optimized.svg', datauri: 'data-uri.txt', base64: 'data-uri-base64.txt', react: `${componentName || 'Icon'}.${ts ? 'tsx' : 'jsx'}`, css: 'icon.css' };
  const looksLikeSvg = !debounced.trim() || /<svg[\s>]/i.test(debounced);

  return (
    <ToolShell slug="svg-optimizer">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <Panel title="Optimisations">
          <div className="flex flex-col gap-2.5 p-4">
            <Toggle checked={opts.removeComments} onChange={(v) => set('removeComments', v)} label="Remove comments" />
            <Toggle checked={opts.removeMetadata} onChange={(v) => set('removeMetadata', v)} label="Remove <metadata>" />
            <Toggle checked={opts.removeEditorData} onChange={(v) => set('removeEditorData', v)} label="Strip Inkscape / Illustrator / Sketch data" />
            <Toggle checked={opts.removeXmlDeclaration} onChange={(v) => set('removeXmlDeclaration', v)} label="Remove XML declaration & DOCTYPE" />
            <Toggle checked={opts.removeTitle} onChange={(v) => set('removeTitle', v)} label="Remove <title> / <desc>" hint="Keep these for accessible standalone graphics" />
            <Toggle checked={opts.removeDimensions} onChange={(v) => set('removeDimensions', v)} label="Remove width/height (keep viewBox)" />
            <Toggle checked={opts.removeEmptyGroups} onChange={(v) => set('removeEmptyGroups', v)} label="Remove empty groups & defs" />
            <Toggle checked={opts.removeDefaults} onChange={(v) => set('removeDefaults', v)} label="Drop default attribute values" />
            <Toggle checked={opts.removeIds} onChange={(v) => set('removeIds', v)} label="Remove unused ids" />
            <Toggle checked={opts.collapseWhitespace} onChange={(v) => set('collapseWhitespace', v)} label="Collapse whitespace" />
            <Toggle checked={opts.currentColor} onChange={(v) => set('currentColor', v)} label="Replace fills with currentColor" hint="Great for icons that should inherit text colour" />
            <NumberField label="Coordinate precision (decimals)" value={opts.precision} onChange={(v) => set('precision', Math.max(0, Math.min(8, Math.round(v))))} min={0} max={8} />
            <button type="button" className="btn btn-sm self-start" onClick={() => setOpts(defaultSvgOptions)}>
              Reset
            </button>
          </div>
        </Panel>
        <div className="flex flex-col gap-3">
          {!looksLikeSvg && <Callout tone="warning">That does not look like SVG markup.</Callout>}
          {result?.error && <Callout tone="error">{result.error}</Callout>}
          {result && !result.error && (
            <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
              <Stat label="Before" value={formatBytes(result.before)} />
              <Stat label="After" value={formatBytes(result.after)} tone="good" />
              <Stat label="Saved" value={`${savingsPercent(result.before, result.after)}%`} tone={result.after < result.before ? 'good' : 'default'} />
              <Stat label="Size" value={dims ? `${dims.width} × ${dims.height}` : '—'} />
            </div>
          )}
          <Workspace>
            <TextInput value={input} onChange={setInput} label="SVG source" sample={SAMPLE} accept=".svg,image/svg+xml" rows={16} fill autoFocus />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <Segmented label="Output" value={view} onChange={setView} options={[{ value: 'svg', label: 'SVG' }, { value: 'react', label: 'React' }, { value: 'datauri', label: 'Data URI' }, { value: 'base64', label: 'Base64' }, { value: 'css', label: 'CSS' }]} size="sm" />
                {view === 'react' && (
                  <>
                    <TextField label="Component" value={componentName} onChange={setComponentName} mono className="w-32" />
                    <Toggle checked={ts} onChange={setTs} label="TypeScript" />
                  </>
                )}
              </div>
              <TextOutput value={output} label="" filename={filenames[view]} mime={view === 'svg' ? 'image/svg+xml' : 'text/plain'} rows={16} fill wrap={view !== 'svg'} />
            </div>
          </Workspace>
          {result?.svg && (
            <div className="grid grid-cols-2 gap-3">
              <div className="checker flex items-center justify-center rounded-xl border p-4">
                <img src={svgToDataUri(debounced)} alt="Original SVG" className="max-h-40" />
              </div>
              <div className="checker flex items-center justify-center rounded-xl border p-4">
                <img src={svgToDataUri(result.svg)} alt="Optimised SVG" className="max-h-40" />
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
