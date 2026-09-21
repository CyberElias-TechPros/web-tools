import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, Segmented, SelectField, Toggle } from '@/components/ui';
import { TextInput } from '@/components/TextIO';
import { PdfResult } from '@/components/PdfResult';
import { parseMarkdown } from '@/lib/md-parse';
import { documentToHtml } from '@/lib/richdoc-serialize';
import { defaultPdfDocOptions, renderPdf } from '@/lib/pdf-doc';
import type { PdfDocOptions } from '@/lib/pdf-doc';
import { rasterizeToPng } from '@/lib/canvas';
import { useDebounced, useLocalStorage } from '@/hooks';
import { downloadText, safeFilename } from '@/lib/files';

const SAMPLE = `# Quarterly notes

A short **Markdown** document rendered to a real, selectable-text PDF — entirely in your browser.

## Highlights

- Revenue grew *18%* quarter over quarter
- Three new regions launched: Lagos, Nairobi, Accra
- [Docs](https://example.com) were rewritten

## Numbers

| Region | Q1 | Q2 |
| --- | ---: | ---: |
| Lagos | 120 | 148 |
| Nairobi | 80 | 96 |

> "Ship small, ship often." — every good team

\`\`\`ts
export const done = true;
\`\`\`

1. First
2. Second
   - nested bullet
`;

export default function MarkdownToPdfTool(): React.ReactElement {
  const [source, setSource] = useLocalStorage('md-pdf:source', SAMPLE);
  const [opts, setOpts] = useState<PdfDocOptions>({ ...defaultPdfDocOptions, pageNumbers: 'number-of-total' });
  const [view, setView] = useState<'preview' | 'html'>('preview');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; pages: number; warnings: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(source, 200);

  const doc = useMemo(() => parseMarkdown(debounced), [debounced]);
  const html = useMemo(() => documentToHtml(doc, { fullDocument: false }), [doc]);
  // The page already has its own <h1>; demote document headings one level in the live preview.
  const previewHtml = useMemo(() => html.replace(/<(\/?)h([1-5])\b/g, (_m, slash: string, n: string) => `<${slash}h${Number(n) + 1}`), [html]);
  const set = <K extends keyof PdfDocOptions>(k: K, v: PdfDocOptions[K]): void => setOpts((o) => ({ ...o, [k]: v }));

  const build = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const out = await renderPdf([{ doc: parseMarkdown(source), name: 'document.md' }], opts, { convertImage: (img) => rasterizeToPng(img.data, img.type) });
      setResult({ bytes: out.bytes, pages: out.pageCount, warnings: out.warnings });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = doc.meta.title ?? 'document';
  const downloadHtml = (): void => {
    const full = parseMarkdown(source);
    downloadText(documentToHtml(full, { fullDocument: true, title: full.meta.title ?? 'Document' }), `${safeFilename(full.meta.title ?? 'document')}.html`, 'text/html');
  };

  return (
    <ToolShell slug="markdown-to-pdf">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <TextInput value={source} onChange={setSource} label="Markdown" sample={SAMPLE} rows={22} fill accept=".md,.markdown,.txt,text/markdown,text/plain" placeholder="# Title — write Markdown here…" />
          <Panel title="Page & type">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              <SelectField label="Size" value={opts.pageSize} onChange={(v) => set('pageSize', v)} options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'US Letter' }, { value: 'Legal', label: 'US Legal' }, { value: 'A5', label: 'A5' }]} />
              <SelectField label="Orientation" value={opts.orientation} onChange={(v) => set('orientation', v)} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
              <SelectField label="Font" value={opts.fontFamily} onChange={(v) => set('fontFamily', v)} options={[{ value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} />
              <NumberField label="Base size" value={opts.baseFontSize} onChange={(v) => set('baseFontSize', Math.max(7, Math.min(18, v)))} min={7} max={18} step={0.5} suffix="pt" />
              <NumberField label="Margin" value={opts.margin} onChange={(v) => set('margin', Math.max(18, Math.min(144, v)))} min={18} max={144} step={4} suffix="pt" />
              <SelectField label="Page numbers" value={opts.pageNumbers} onChange={(v) => set('pageNumbers', v)} options={[{ value: 'none', label: 'None' }, { value: 'number', label: '1, 2, 3' }, { value: 'number-of-total', label: '1 of 12' }]} />
              <div className="col-span-2 sm:col-span-3">
                <Toggle checked={opts.lineHeight > 1.4} onChange={(v) => set('lineHeight', v ? 1.55 : 1.35)} label="Relaxed line height" />
              </div>
              <div className="col-span-2 flex gap-2 sm:col-span-3">
                <button type="button" className="btn btn-primary flex-1" onClick={() => void build()} disabled={busy || !source.trim()}>
                  {busy ? 'Rendering…' : 'Render PDF'}
                </button>
                <button type="button" className="btn" onClick={downloadHtml} disabled={!source.trim()}>
                  Download HTML
                </button>
              </div>
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          {error && <Callout tone="error">{error}</Callout>}
          {result ? (
            <>
              <PdfResult bytes={result.bytes} filename={`${title}.pdf`} pageCount={result.pages} warnings={result.warnings} />
              <button type="button" className="btn self-start" onClick={() => setResult(null)}>Back to live preview</button>
            </>
          ) : (
            <Panel title="Live preview" actions={<Segmented value={view} onChange={setView} options={[{ value: 'preview', label: 'Rendered' }, { value: 'html', label: 'HTML' }]} size="sm" label="Preview mode" />}>
              {view === 'preview' ? (
                <div className="prose-doc max-h-[40rem] overflow-auto rounded-b-xl bg-white p-6 text-black" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <pre className="code-area max-h-[40rem] overflow-auto p-4 text-xs whitespace-pre-wrap">{html}</pre>
              )}
            </Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
