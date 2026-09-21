import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import { CopyButton, Panel, Segmented, SelectField, TextField } from '@/components/ui';
import { TextInput, Workspace } from '@/components/TextIO';
import { HASH_ALGORITHMS, digest, digestsEqual, formatDigest, guessAlgorithmFromDigest, hmac } from '@/lib/hash';
import type { DigestEncoding, HashAlgorithm } from '@/lib/hash';
import { useDebounced } from '@/hooks';

type HmacAlg = 'sha1' | 'sha256' | 'sha384' | 'sha512';

export default function HashTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [encoding, setEncoding] = useState<DigestEncoding>('hex');
  const [expected, setExpected] = useState('');
  const [hmacKey, setHmacKey] = useState('');
  const [hmacAlg, setHmacAlg] = useState<HmacAlg>('sha256');
  const [digests, setDigests] = useState<Partial<Record<HashAlgorithm, string>>>({});
  const [mac, setMac] = useState('');
  const debounced = useDebounced(input, 100);
  const debouncedKey = useDebounced(hmacKey, 150);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        HASH_ALGORITHMS.map(async (a) => [a.id, formatDigest(await digest(a.id, debounced), encoding)] as const),
      );
      if (!cancelled) setDigests(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, encoding]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!debouncedKey) {
        setMac('');
        return;
      }
      const bytes = await hmac(hmacAlg, debouncedKey, debounced);
      if (!cancelled) setMac(formatDigest(bytes, encoding));
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, debouncedKey, hmacAlg, encoding]);

  const expectedTrim = expected.trim();
  const matches = useMemo(() => {
    if (!expectedTrim) return null;
    const hit = HASH_ALGORITHMS.find((a) => digests[a.id] && digestsEqual(digests[a.id]!, expectedTrim));
    return hit ? hit.id : false;
  }, [expectedTrim, digests]);
  const guesses = useMemo(() => (expectedTrim && /^[0-9a-f]+$/i.test(expectedTrim) ? guessAlgorithmFromDigest(expectedTrim) : []), [expectedTrim]);

  return (
    <ToolShell slug="hash-generator">
      <Workspace>
        <div className="flex flex-col gap-4">
          <TextInput value={input} onChange={setInput} label="Text" placeholder="Type or paste text — hashes update as you type" sample="The quick brown fox jumps over the lazy dog" rows={10} accept="text/*,.txt,.json,.csv" autoFocus />
          <Panel title="Compare with an expected digest">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Expected value" value={expected} onChange={setExpected} placeholder="paste a hash to check" mono />
              {expectedTrim && (
                <p className="flex items-center gap-2 text-sm" role="status" style={{ color: matches ? 'var(--ok)' : 'var(--danger)' }}>
                  {matches ? <Check size={16} aria-hidden /> : <X size={16} aria-hidden />}
                  {matches
                    ? `Matches the ${HASH_ALGORITHMS.find((a) => a.id === matches)?.label} digest of the text.`
                    : `No digest matches.${guesses.length ? ` By length this looks like ${guesses.map((g) => g.toUpperCase()).join(' or ')}.` : ''}`}
                </p>
              )}
            </div>
          </Panel>
          <Panel title="HMAC" description="Keyed hash for signing webhooks and API requests.">
            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
              <TextField label="Secret key" value={hmacKey} onChange={setHmacKey} type="password" placeholder="secret" mono />
              <SelectField
                label="Algorithm"
                value={hmacAlg}
                onChange={setHmacAlg}
                options={[
                  { value: 'sha1', label: 'HMAC-SHA1' },
                  { value: 'sha256', label: 'HMAC-SHA256' },
                  { value: 'sha384', label: 'HMAC-SHA384' },
                  { value: 'sha512', label: 'HMAC-SHA512' },
                ]}
              />
              {mac && (
                <div className="sm:col-span-2">
                  <DigestRow label={`HMAC-${hmacAlg.toUpperCase()}`} value={mac} />
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="Digests"
          actions={
            <Segmented
              size="sm"
              label="Output encoding"
              value={encoding}
              onChange={setEncoding}
              options={[
                { value: 'hex', label: 'hex' },
                { value: 'HEX', label: 'HEX' },
                { value: 'base64', label: 'base64' },
                { value: 'base64url', label: 'b64url' },
              ]}
            />
          }
        >
          <ul className="divide-y">
            {HASH_ALGORITHMS.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <DigestRow label={a.label} value={digests[a.id] ?? ''} note={a.note} bits={a.bits} highlight={matches === a.id} />
              </li>
            ))}
          </ul>
        </Panel>
      </Workspace>
    </ToolShell>
  );
}

function DigestRow({ label, value, note, bits, highlight }: { label: string; value: string; note?: string; bits?: number; highlight?: boolean }): React.ReactElement {
  return (
    <div className={`rounded-lg ${highlight ? 'p-2' : ''}`} style={highlight ? { background: 'color-mix(in oklab, var(--ok) 12%, transparent)' } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {bits && <span className="muted text-[0.65rem]">{bits} bits</span>}
          {note && <span className="muted hidden text-[0.65rem] sm:inline">· {note}</span>}
        </div>
        <CopyButton value={value} small />
      </div>
      <code className="mt-1 block font-mono text-xs break-all" style={{ color: highlight ? 'var(--ok)' : 'var(--accent-2)' }}>
        {value || '…'}
      </code>
    </div>
  );
}
