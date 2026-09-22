import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, Segmented, SelectField, TextField, Toggle } from '@/components/ui';
import { KeyValue, TextOutput } from '@/components/TextIO';
import { UUID_NAMESPACES, formatUuid, inspectUuid, nanoid, objectId, randomHex, ulid, ulidTimestamp, uuidV1, uuidV4, uuidV5, uuidV7 } from '@/lib/ids';
import type { IdFormat } from '@/lib/ids';
import { useLocalStorage } from '@/hooks';

type Kind = 'v4' | 'v7' | 'v1' | 'v5' | 'ulid' | 'nanoid' | 'objectid' | 'hex';

const KIND_INFO: Record<Kind, { label: string; note: string }> = {
  v4: { label: 'UUID v4', note: 'Random. The default choice for most things.' },
  v7: { label: 'UUID v7', note: 'Time-ordered random — sorts by creation time, great for database keys.' },
  v1: { label: 'UUID v1', note: 'Timestamp plus a random node id (the MAC address is never used here).' },
  v5: { label: 'UUID v5', note: 'Deterministic: the same name in the same namespace always gives the same id.' },
  ulid: { label: 'ULID', note: '26 characters, Crockford base32, sortable by time.' },
  nanoid: { label: 'nanoid', note: 'Compact URL-safe ids with adjustable length.' },
  objectid: { label: 'ObjectId', note: 'MongoDB-style 24-hex id with a leading timestamp.' },
  hex: { label: 'Random hex', note: 'Plain random bytes as hex — tokens, salts, secrets.' },
};

async function buildIds(
  kind: Kind,
  n: number,
  opts: { size: number; hexBytes: number; v5Name: string; v5Namespace: string },
): Promise<string[]> {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    switch (kind) {
      case 'v4':
        out.push(uuidV4());
        break;
      case 'v7':
        out.push(uuidV7(now + i));
        break;
      case 'v1':
        out.push(uuidV1(now + i));
        break;
      case 'v5':
        out.push(await uuidV5(i === 0 ? opts.v5Name : `${opts.v5Name}-${i}`, opts.v5Namespace));
        break;
      case 'ulid':
        out.push(ulid(now + i));
        break;
      case 'nanoid':
        out.push(nanoid(Math.min(128, Math.max(2, opts.size))));
        break;
      case 'objectid':
        out.push(objectId(now));
        break;
      case 'hex':
        out.push(randomHex(Math.min(256, Math.max(1, opts.hexBytes))));
        break;
    }
  }
  return out;
}

export default function UuidTool(): React.ReactElement {
  const [kind, setKind] = useLocalStorage<Kind>('uuid:kind', 'v4');
  const [count, setCount] = useLocalStorage('uuid:count', 5);
  const [format, setFormat] = useLocalStorage<IdFormat>('uuid:format', 'lower');
  const [size, setSize] = useLocalStorage('uuid:size', 21);
  const [hexBytes, setHexBytes] = useLocalStorage('uuid:hex', 32);
  const [v5Name, setV5Name] = useState('example.com');
  const [v5Namespace, setV5Namespace] = useState<string>(UUID_NAMESPACES.DNS);
  const [inspect, setInspect] = useState('');
  const [quoted, setQuoted] = useLocalStorage('uuid:quoted', false);

  const [nonce, setNonce] = useState(0);
  const [ids, setIds] = useState<string[]>([]);
  const n = Math.min(1000, Math.max(1, Math.floor(count)));

  useEffect(() => {
    let cancelled = false;
    void buildIds(kind, n, { size, hexBytes, v5Name, v5Namespace }).then((out) => {
      if (!cancelled) setIds(out);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, n, size, hexBytes, v5Name, v5Namespace, nonce]);

  const generate = (): void => setNonce((x) => x + 1);

  const isUuid = kind === 'v4' || kind === 'v7' || kind === 'v1' || kind === 'v5';
  const output = useMemo(() => {
    const formatted = ids.map((id) => (isUuid ? formatUuid(id, format) : id));
    return formatted.map((id) => (quoted ? `"${id}",` : id)).join('\n');
  }, [ids, isUuid, format, quoted]);

  const info = useMemo(() => {
    const value = inspect.trim();
    if (!value) return null;
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value)) {
      const ts = ulidTimestamp(value);
      return { rows: [{ key: 'Type', value: 'ULID', mono: false }, { key: 'Timestamp', value: ts ? ts.toISOString() : 'unknown' }, { key: 'Local time', value: ts ? ts.toLocaleString() : '—' }] };
    }
    const u = inspectUuid(value);
    if (!u.valid) return { rows: [{ key: 'Result', value: 'Not a valid UUID or ULID', tone: 'bad' as const, mono: false }] };
    return {
      rows: [
        { key: 'Version', value: u.version === null ? 'special' : `v${u.version}` },
        { key: 'Variant', value: u.variant, mono: false },
        { key: 'Description', value: u.description, mono: false },
        ...(u.timestamp ? [{ key: 'Embedded time', value: `${u.timestamp.toISOString()} (${u.timestamp.toLocaleString()})` }] : []),
        { key: 'Braces', value: formatUuid(value, 'braces'), copy: formatUuid(value, 'braces') },
        { key: 'URN', value: formatUuid(value, 'urn'), copy: formatUuid(value, 'urn') },
        { key: 'Compact', value: formatUuid(value, 'compact'), copy: formatUuid(value, 'compact') },
        { key: 'Base64', value: formatUuid(value, 'base64'), copy: formatUuid(value, 'base64') },
      ],
    };
  }, [inspect]);

  return (
    <ToolShell
      slug="uuid-generator"
      actions={
        <button type="button" className="btn btn-primary" onClick={generate}>
          <RefreshCw size={15} aria-hidden /> Regenerate
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Identifier">
            <div className="flex flex-col gap-3 p-4">
              <SelectField label="Type" value={kind} onChange={setKind} options={(Object.keys(KIND_INFO) as Kind[]).map((k) => ({ value: k, label: KIND_INFO[k].label }))} hint={KIND_INFO[kind].note} />
              <NumberField label="How many" value={count} onChange={setCount} min={1} max={1000} />
              {kind === 'nanoid' && <NumberField label="Length" value={size} onChange={setSize} min={2} max={128} />}
              {kind === 'hex' && <NumberField label="Bytes" value={hexBytes} onChange={setHexBytes} min={1} max={256} hint={`${hexBytes * 2} hex characters`} />}
              {kind === 'v5' && (
                <>
                  <TextField label="Name" value={v5Name} onChange={setV5Name} mono />
                  <SelectField
                    label="Namespace"
                    value={v5Namespace}
                    onChange={setV5Namespace}
                    options={[
                      { value: UUID_NAMESPACES.DNS, label: 'DNS' },
                      { value: UUID_NAMESPACES.URL, label: 'URL' },
                      { value: UUID_NAMESPACES.OID, label: 'OID' },
                      { value: UUID_NAMESPACES.X500, label: 'X.500' },
                    ]}
                  />
                </>
              )}
              {isUuid && (
                <div>
                  <span className="label">Format</span>
                  <Segmented
                    size="sm"
                    label="UUID format"
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'lower', label: 'lower' },
                      { value: 'upper', label: 'UPPER' },
                      { value: 'braces', label: '{ }' },
                      { value: 'urn', label: 'urn:' },
                      { value: 'compact', label: 'compact' },
                      { value: 'base64', label: 'b64' },
                    ]}
                  />
                </div>
              )}
              <Toggle checked={quoted} onChange={setQuoted} label="Quote and comma-separate" hint="Ready to paste into an array literal" />
            </div>
          </Panel>
          <Panel title="Inspect an id" description="Detects version, variant and any embedded timestamp.">
            <div className="p-4">
              <TextField label="UUID or ULID" value={inspect} onChange={setInspect} placeholder={ids[0] ?? ''} mono />
              {info && <KeyValue dense className="mt-2" rows={info.rows} />}
            </div>
          </Panel>
        </div>
        <TextOutput label={`${KIND_INFO[kind].label} × ${ids.length}`} value={output} rows={22} filename="ids.txt" fill />
      </div>
    </ToolShell>
  );
}
