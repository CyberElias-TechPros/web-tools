import { useEffect, useMemo, useState } from 'react';
import { Callout, Panel, Stat } from '@/components/ui';
import { downloadBlob } from '@/lib/files';
import { formatBytes } from '@/lib/image';

interface PdfResultProps {
  bytes: Uint8Array | null;
  filename: string;
  pageCount?: number;
  warnings?: string[];
  /** Extra stats shown beside size/pages. */
  extra?: Array<{ label: string; value: string }>;
  title?: string;
  /** Hide the inline viewer (useful for huge documents). */
  noPreview?: boolean;
  children?: React.ReactNode;
}

/** Shared "here is your PDF" block: stats, download button, inline viewer. */
export function PdfResult({ bytes, filename, pageCount, warnings = [], extra = [], title = 'Your PDF', noPreview, children }: PdfResultProps): React.ReactElement {
  const blob = useMemo(() => (bytes ? new Blob([bytes as BlobPart], { type: 'application/pdf' }) : null), [bytes]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    const t = setTimeout(() => setUrl(next), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(next);
    };
  }, [blob]);

  if (!blob) return <></>;
  return (
    <Panel
      title={title}
      description={filename}
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadBlob(blob, filename)}>
          Download PDF
        </button>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-6">
          <Stat label="Size" value={formatBytes(blob.size)} />
          {pageCount !== undefined && <Stat label="Pages" value={pageCount} />}
          {extra.map((e) => (
            <Stat key={e.label} label={e.label} value={e.value} />
          ))}
        </div>
        {warnings.length > 0 && (
          <Callout tone="warning" title={`${warnings.length} note${warnings.length === 1 ? '' : 's'}`}>
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Callout>
        )}
        {children}
        {!noPreview && url && (
          <iframe src={url} title={`Preview of ${filename}`} className="h-[32rem] w-full rounded-xl border" style={{ background: '#525659' }} />
        )}
      </div>
    </Panel>
  );
}
