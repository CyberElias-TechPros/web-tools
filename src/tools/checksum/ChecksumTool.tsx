import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, CopyButton, Panel, ProgressBar, Stat, TextField } from '@/components/ui';
import { Dropzone } from '@/components/Dropzone';
import { HASH_ALGORITHMS, digest, digestsEqual, formatDigest, guessAlgorithmFromDigest } from '@/lib/hash';
import type { HashAlgorithm } from '@/lib/hash';
import { formatBytes } from '@/lib/image';

interface FileResult {
  name: string;
  size: number;
  type: string;
  digests: Partial<Record<HashAlgorithm, string>>;
}

const ALGOS: HashAlgorithm[] = ['md5', 'sha1', 'sha256', 'sha512', 'crc32'];

export default function ChecksumTool(): React.ReactElement {
  const [results, setResults] = useState<FileResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [expected, setExpected] = useState('');

  const onFiles = async (files: File[]): Promise<void> => {
    setProgress({ done: 0, total: files.length * ALGOS.length });
    const out: FileResult[] = [];
    let done = 0;
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const digests: Partial<Record<HashAlgorithm, string>> = {};
      for (const algo of ALGOS) {
        digests[algo] = formatDigest(await digest(algo, buffer));
        done++;
        setProgress({ done, total: files.length * ALGOS.length });
      }
      out.push({ name: file.name, size: file.size, type: file.type || 'unknown', digests });
    }
    setResults((prev) => [...out, ...prev]);
    setProgress(null);
  };

  const expectedClean = expected.trim().toLowerCase().replace(/^(sha\d*|md5|crc32):/i, '');
  const guesses = expectedClean ? guessAlgorithmFromDigest(expectedClean) : [];
  const match = expectedClean ? results.find((r) => Object.values(r.digests).some((d) => d && digestsEqual(d, expectedClean))) : null;

  return (
    <ToolShell slug="file-checksum">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Dropzone onFiles={onFiles} multiple title="Drop files to hash" description="Any size — hashed with streaming Web Crypto, nothing uploaded" />
          {progress && <ProgressBar value={progress.done} max={progress.total} label="Hashing" showValue />}
          <Panel title="Verify against a published checksum">
            <div className="flex flex-col gap-2 p-4">
              <TextField label="Expected digest" value={expected} onChange={setExpected} mono placeholder="e.g. 9f86d081884c7d65…" hint={guesses.length ? `Looks like ${guesses.map((g) => HASH_ALGORITHMS.find((a) => a.id === g)?.label ?? g).join(' or ')}` : undefined} />
              {expectedClean && results.length > 0 && (match ? <Callout tone="success" title="Match">{match.name} matches the expected digest.</Callout> : <Callout tone="error" title="No match">None of the hashed files produce that digest.</Callout>)}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          {results.length === 0 ? (
            <Panel title="Digests"><p className="muted p-4 text-sm">Drop one or more files to see MD5, SHA-1, SHA-256, SHA-512 and CRC-32.</p></Panel>
          ) : (
            results.map((r, i) => (
              <Panel key={`${r.name}-${i}`} title={r.name} description={`${formatBytes(r.size)} · ${r.type}`} actions={<CopyButton value={ALGOS.map((a) => `${a.toUpperCase()}  ${r.digests[a]}  ${r.name}`).join('\n')} small label="Copy all" />}>
                <dl className="divide-y">
                  {ALGOS.map((a) => {
                    const d = r.digests[a] ?? '';
                    const hit = expectedClean && digestsEqual(d, expectedClean);
                    return (
                      <div key={a} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <dt className="w-16 shrink-0 font-semibold uppercase">{HASH_ALGORITHMS.find((h) => h.id === a)?.label}</dt>
                        <dd className="min-w-0 flex-1 truncate font-mono text-xs" style={hit ? { color: 'var(--ok)' } : undefined} title={d}>{d}</dd>
                        <CopyButton value={d} small label="" className="!px-1.5" />
                      </div>
                    );
                  })}
                </dl>
              </Panel>
            ))
          )}
          {results.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="card flex gap-6 px-4 py-2">
                <Stat label="Files" value={results.length} />
                <Stat label="Total size" value={formatBytes(results.reduce((s, r) => s + r.size, 0))} />
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setResults([])}>
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
