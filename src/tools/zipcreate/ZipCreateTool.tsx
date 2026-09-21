import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Stat, TextField } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { createZip } from '@/lib/zip';
import { downloadBlob, safeFilename } from '@/lib/files';
import { formatBytes } from '@/lib/image';

interface Item {
  id: string;
  file: File;
  path: string;
}

let counter = 0;

export default function ZipCreateTool(): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('archive');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = (files: File[]): void => {
    setResult(null);
    setItems((prev) => [...prev, ...files.map((file) => ({ id: `f${++counter}`, file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }))]);
  };

  const build = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const entries = await Promise.all(items.map(async (i) => ({ name: i.path, data: new Uint8Array(await i.file.arrayBuffer()), date: new Date(i.file.lastModified) })));
      const blob = await createZip(entries);
      setResult({ size: blob.size });
      downloadBlob(blob, `${safeFilename(name, 'archive')}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const total = items.reduce((s, i) => s + i.file.size, 0);

  return (
    <ToolShell slug="zip-creator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} multiple title="Drop files to zip" description="Add as many as you like; rename paths to create folders" />
          <Panel title="Archive">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="File name" value={name} onChange={setName} suffix=".zip" />
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Files" value={items.length} />
                <Stat label="Total" value={formatBytes(total)} />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void build()} disabled={!items.length || busy}>
                {busy ? 'Compressing…' : 'Create ZIP'}
              </button>
              {result && <Callout tone="success">Done — {formatBytes(result.size)} ({total ? `${Math.max(0, (1 - result.size / total) * 100).toFixed(0)}% smaller` : '0%'}). Your download has started.</Callout>}
              {error && <Callout tone="error">{error}</Callout>}
            </div>
          </Panel>
        </div>
        <Panel title="Files" actions={items.length ? <button type="button" className="btn btn-sm" onClick={() => setItems([])}>Clear</button> : undefined}>
          {items.length ? (
            <ul className="max-h-[30rem] divide-y overflow-auto">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2">
                  <TextField label={`Path for ${i.file.name}`} value={i.path} onChange={(p) => setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, path: p } : x)))} mono className="min-w-0 flex-1 [&_span.label]:sr-only" />
                  <span className="muted shrink-0 text-xs">{formatBytes(i.file.size)}</span>
                  <button type="button" className="btn btn-sm" onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.file.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted p-4 text-sm">Nothing added yet. Paths like <code className="font-mono">docs/readme.txt</code> create folders inside the archive.</p>
          )}
        </Panel>
      </div>
    </ToolShell>
  );
}
