import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented } from '@/components/ui';
import { DataTable, KeyValue, OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { buildQueryString, parseUrl, urlDecode, urlEncode } from '@/lib/encoding';
import type { UrlEncodeMode } from '@/lib/encoding';

type Direction = 'encode' | 'decode';

const SAMPLE_URL = 'https://user:pw@example.com:8443/search/results?q=caf%C3%A9%20au%20lait&page=2&tags=a&tags=b#section-3';

export default function UrlTool(): React.ReactElement {
  const [direction, setDirection] = useState<Direction>('encode');
  const [mode, setMode] = useState<UrlEncodeMode>('component');
  const [input, setInput] = useState('');
  const [urlInput, setUrlInput] = useState(SAMPLE_URL);

  const output = useMemo(() => {
    if (!input) return { text: '', error: null as string | null };
    try {
      return { text: direction === 'encode' ? urlEncode(input, mode) : urlDecode(input, mode), error: null };
    } catch (e) {
      return { text: '', error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, direction, mode]);

  const parsed = useMemo(() => (urlInput.trim() ? parseUrl(urlInput.trim()) : null), [urlInput]);

  return (
    <ToolShell slug="url-encoder">
      <OptionsBar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
        <Segmented
          label="Encoding style"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'component', label: 'Component', title: 'encodeURIComponent — for a single query value or path segment' },
            { value: 'uri', label: 'Full URI', title: 'encodeURI — keeps :/?#&= intact' },
            { value: 'form', label: 'Form', title: 'application/x-www-form-urlencoded — spaces become +' },
          ]}
        />
      </OptionsBar>

      <Workspace>
        <TextInput
          value={input}
          onChange={setInput}
          label={direction === 'encode' ? 'Text to encode' : 'Text to decode'}
          placeholder={direction === 'encode' ? 'café au lait & croissants?' : 'caf%C3%A9%20au%20lait'}
          sample={direction === 'encode' ? 'café au lait & croissants? 100% sure' : 'caf%C3%A9%20au%20lait%20%26%20croissants%3F'}
          rows={8}
          autoFocus
        />
        <div className="flex flex-col gap-3">
          {output.error && (
            <Callout tone="error" title="Malformed percent-encoding">
              {output.error}
            </Callout>
          )}
          <TextOutput value={output.text} label={direction === 'encode' ? 'Encoded' : 'Decoded'} rows={8} fill />
        </div>
      </Workspace>

      <p className="muted mt-3 text-xs leading-relaxed">
        <strong>Component</strong> encodes everything except <code className="font-mono">A–Z a–z 0–9 - _ . ! ~ * ' ( )</code> and is what you want for a
        single value. <strong>Full URI</strong> leaves URL structure characters alone. <strong>Form</strong> is what browsers send for
        HTML forms, with spaces as <code className="font-mono">+</code>.
      </p>

      <section className="mt-8" aria-labelledby="url-parser">
        <h2 id="url-parser" className="mb-3 text-base font-semibold">
          URL parser
        </h2>
        <TextInput value={urlInput} onChange={setUrlInput} label="URL to take apart" rows={3} sample={SAMPLE_URL} placeholder="https://…" />
        {urlInput.trim() && !parsed && (
          <Callout tone="warning" className="mt-3">
            That does not parse as an absolute URL. Include the scheme, e.g. <code className="font-mono">https://</code>.
          </Callout>
        )}
        {parsed && (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <Panel title="Parts" bodyClassName="px-4">
              <KeyValue
                dense
                rows={[
                  { key: 'Scheme', value: parsed.protocol.replace(/:$/, ''), copy: parsed.protocol.replace(/:$/, '') },
                  { key: 'Host', value: parsed.hostname, copy: parsed.hostname },
                  { key: 'Port', value: parsed.port || '(default)' },
                  ...(parsed.username ? [{ key: 'Username', value: parsed.username }] : []),
                  ...(parsed.password ? [{ key: 'Password', value: '••••••', tone: 'warn' as const }] : []),
                  { key: 'Origin', value: parsed.origin, copy: parsed.origin },
                  { key: 'Path', value: parsed.pathname, copy: parsed.pathname },
                  { key: 'Path segments', value: parsed.pathSegments.length ? parsed.pathSegments.map((s) => decodeURIComponent(s)).join(' › ') : '(root)' },
                  { key: 'Query', value: parsed.search || '(none)', copy: parsed.search },
                  { key: 'Fragment', value: parsed.hash || '(none)' },
                ]}
              />
            </Panel>
            <Panel
              title={`Query parameters (${parsed.params.length})`}
              description="Decoded values; duplicate keys are kept."
              bodyClassName="p-3"
            >
              {parsed.params.length ? (
                <DataTable headers={['Key', 'Value']} rows={parsed.params.map((p) => [p.key, p.value])} mono />
              ) : (
                <p className="muted p-3 text-xs">No query string.</p>
              )}
              {parsed.params.length > 0 && (
                <TextOutput
                  className="mt-3"
                  label="Normalised query string"
                  value={buildQueryString(parsed.params)}
                  rows={2}
                />
              )}
            </Panel>
          </div>
        )}
      </section>
    </ToolShell>
  );
}
