import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, NumberField, Panel, Segmented, SelectField, TextField, Toggle } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { PdfResult } from '@/components/PdfResult';
import { defaultPageNumberOptions, defaultWatermarkOptions, numberPdfPages, pageCountOf, parsePageRanges, watermarkPdf } from '@/lib/pdf-ops';
import type { PageNumberOptions, WatermarkOptions } from '@/lib/pdf-ops';
import { formatBytes } from '@/lib/image';

type Mode = 'watermark' | 'numbers';

export default function PdfWatermarkTool(): React.ReactElement {
  const [file, setFile] = useState<{ file: File; data: Uint8Array; pages: number } | null>(null);
  const [mode, setMode] = useState<Mode>('watermark');
  const [wm, setWm] = useState<WatermarkOptions>(defaultWatermarkOptions);
  const [wmPages, setWmPages] = useState('all');
  const [pn, setPn] = useState<PageNumberOptions>(defaultPageNumberOptions);
  const [both, setBoth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      setFile({ file: f, data, pages: await pageCountOf(data) });
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not open this PDF.');
    }
  };

  const setW = <K extends keyof WatermarkOptions>(k: K, v: WatermarkOptions[K]): void => setWm((o) => ({ ...o, [k]: v }));
  const setP = <K extends keyof PageNumberOptions>(k: K, v: PageNumberOptions[K]): void => setPn((o) => ({ ...o, [k]: v }));

  const pagesError = ((): string | null => {
    if (!file || mode !== 'watermark') return null;
    try {
      parsePageRanges(wmPages || 'all', file.pages);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid range';
    }
  })();

  const apply = async (): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      let bytes = file.data;
      const doWm = mode === 'watermark' || both;
      const doPn = mode === 'numbers' || both;
      if (doWm) bytes = await watermarkPdf(bytes, { ...wm, color: wm.color.replace('#', ''), pages: parsePageRanges(wmPages || 'all', file.pages) });
      if (doPn) bytes = await numberPdfPages(bytes, { ...pn, color: pn.color.replace('#', '') });
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell slug="pdf-watermark">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} accept=".pdf,application/pdf" title={file ? file.file.name : 'Drop a PDF'} description={file ? `${file.pages} pages · ${formatBytes(file.file.size)}` : 'Stamp text across pages or add page numbers'} compact={Boolean(file)} />
          <Segmented label="Stamp" value={mode} onChange={setMode} options={[{ value: 'watermark', label: 'Watermark' }, { value: 'numbers', label: 'Page numbers' }]} />
          {mode === 'watermark' ? (
            <Panel title="Watermark">
              <div className="flex flex-col gap-3 p-4">
                <TextField label="Text" value={wm.text} onChange={(v) => setW('text', v)} placeholder="CONFIDENTIAL" />
                <Segmented label="Placement" value={wm.position} onChange={(v) => setW('position', v)} options={[{ value: 'center', label: 'Centre' }, { value: 'tile', label: 'Tiled' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} size="sm" />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Font size" value={wm.fontSize} onChange={(v) => setW('fontSize', v)} min={8} max={200} suffix="pt" />
                  <NumberField label="Rotation" value={wm.rotation} onChange={(v) => setW('rotation', v)} min={-90} max={90} suffix="°" />
                  <NumberField label="Opacity" value={Math.round(wm.opacity * 100)} onChange={(v) => setW('opacity', v / 100)} min={2} max={100} suffix="%" />
                  <SelectField label="Font" value={wm.font} onChange={(v) => setW('font', v)} options={[{ value: 'sans', label: 'Helvetica' }, { value: 'serif', label: 'Times' }, { value: 'mono', label: 'Courier' }]} />
                </div>
                <ColorField label="Colour" value={`#${wm.color.replace('#', '')}`} onChange={(v) => setW('color', v.replace('#', ''))} />
                <Toggle checked={wm.bold} onChange={(v) => setW('bold', v)} label="Bold" />
                <TextField label="Pages" value={wmPages} onChange={setWmPages} mono placeholder="all" hint="e.g. 2-, odd, 1-3" invalid={Boolean(pagesError)} />
                {pagesError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{pagesError}</p>}
              </div>
            </Panel>
          ) : (
            <Panel title="Page numbers">
              <div className="flex flex-col gap-3 p-4">
                <TextField label="Format" value={pn.format} onChange={(v) => setP('format', v)} mono hint="{n} = page number, {total} = page count" />
                <SelectField label="Position" value={pn.position} onChange={(v) => setP('position', v)} options={[
                  { value: 'bottom-center', label: 'Bottom centre' }, { value: 'bottom-right', label: 'Bottom right' }, { value: 'bottom-left', label: 'Bottom left' },
                  { value: 'top-center', label: 'Top centre' }, { value: 'top-right', label: 'Top right' }, { value: 'top-left', label: 'Top left' },
                ]} />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Font size" value={pn.fontSize} onChange={(v) => setP('fontSize', v)} min={6} max={36} suffix="pt" />
                  <NumberField label="Margin" value={pn.margin} onChange={(v) => setP('margin', v)} min={6} max={120} suffix="pt" />
                  <NumberField label="Start at" value={pn.start} onChange={(v) => setP('start', v)} min={0} max={9999} />
                  <NumberField label="Skip first pages" value={pn.skipFirst} onChange={(v) => setP('skipFirst', v)} min={0} max={file?.pages ?? 99} hint="Leave cover pages unnumbered" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Font" value={pn.font} onChange={(v) => setP('font', v)} options={[{ value: 'sans', label: 'Helvetica' }, { value: 'serif', label: 'Times' }, { value: 'mono', label: 'Courier' }]} />
                  <ColorField label="Colour" value={`#${pn.color.replace('#', '')}`} onChange={(v) => setP('color', v.replace('#', ''))} />
                </div>
              </div>
            </Panel>
          )}
          <Toggle checked={both} onChange={setBoth} label="Apply both watermark and page numbers" />
          <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={!file || busy || Boolean(pagesError) || (mode === 'watermark' && !wm.text.trim())}>
            {busy ? 'Stamping…' : 'Apply to PDF'}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {result && file ? (
            <PdfResult bytes={result} filename={`${file.file.name.replace(/\.pdf$/i, '')}-stamped.pdf`} pageCount={file.pages} />
          ) : (
            <Panel title="Preview">
              <div className="p-4">
                <div className="relative mx-auto aspect-[1/1.414] w-full max-w-sm overflow-hidden rounded-lg bg-white text-black shadow-inner" aria-hidden="true">
                  <div className="absolute inset-6 space-y-2">
                    {Array.from({ length: 14 }, (_, i) => (
                      <div key={i} className="h-2 rounded bg-neutral-200" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
                    ))}
                  </div>
                  {(mode === 'watermark' || both) && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ opacity: wm.opacity }}>
                      <span className="font-bold whitespace-nowrap" style={{ color: `#${wm.color.replace('#', '')}`, fontSize: `${Math.max(10, wm.fontSize / 3)}px`, transform: `rotate(${-wm.rotation}deg)`, fontFamily: wm.font === 'mono' ? 'monospace' : wm.font === 'serif' ? 'serif' : 'sans-serif', fontWeight: wm.bold ? 700 : 400 }}>
                        {wm.text || 'WATERMARK'}
                      </span>
                    </div>
                  )}
                  {(mode === 'numbers' || both) && (
                    <span className={`absolute text-[9px] ${pn.position.startsWith('top') ? 'top-3' : 'bottom-3'} ${pn.position.endsWith('left') ? 'left-4' : pn.position.endsWith('right') ? 'right-4' : 'left-1/2 -translate-x-1/2'}`} style={{ color: `#${pn.color.replace('#', '')}` }}>
                      {pn.format.replace('{n}', String(pn.start)).replace('{total}', String(file?.pages ?? 12))}
                    </span>
                  )}
                </div>
                <p className="muted mt-3 text-center text-xs">Approximate preview — the real output uses the PDF's own page size.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
