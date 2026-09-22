import { useMemo, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Segmented, Toggle } from '@/components/ui';
import { TextInput, TextOutput, OptionsBar, Workspace, KeyValue } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { bytesToBase64, decodeBase64, encodeBase64 } from '@/lib/encoding';
import { detectFileType } from '@/lib/filetype';
import { downloadBlob, readFileAsArrayBuffer } from '@/lib/files';
import { formatBytes } from '@/lib/image';
import { useLocalStorage } from '@/hooks';

type Mode = 'encode' | 'decode';

interface FileResult {
  name: string;
  size: number;
  type: string;
  base64: string;
}

export default function Base64Tool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [urlSafe, setUrlSafe] = useLocalStorage('b64:urlsafe', false);
  const [padding, setPadding] = useLocalStorage('b64:padding', true);
  const [wrap, setWrap] = useLocalStorage('b64:wrap', false);
  const [file, setFile] = useState<FileResult | null>(null);

  const result = useMemo(() => {
    if (!input) return { output: '', error: null as string | null, binary: null as Uint8Array | null };
    try {
      if (mode === 'encode') {
        return { output: encodeBase64(input, { urlSafe, padding, lineLength: wrap ? 76 : undefined }), error: null, binary: null };
      }
      const decoded = decodeBase64(input);
      return { output: decoded.isText ? decoded.text : '', error: null, binary: decoded.isText ? null : decoded.bytes };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : String(e), binary: null };
    }
  }, [input, mode, urlSafe, padding, wrap]);

  const binaryType = result.binary ? detectFileType(result.binary) : null;

  const onFile = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    const buffer = await readFileAsArrayBuffer(f);
    const bytes = new Uint8Array(buffer);
    setFile({ name: f.name, size: f.size, type: f.type || 'application/octet-stream', base64: bytesToBase64(bytes, urlSafe, padding) });
  };

  return (
    <ToolShell slug="base64">
      <OptionsBar>
        <Segmented
          label="Direction"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
        <Toggle checked={urlSafe} onChange={setUrlSafe} label="URL-safe alphabet" hint="Uses - and _ instead of + and /" />
        <Toggle checked={padding} onChange={setPadding} label="Padding (=)" />
        {mode === 'encode' && <Toggle checked={wrap} onChange={setWrap} label="Wrap at 76 columns" hint="MIME style" />}
      </OptionsBar>

      <Workspace>
        <TextInput
          value={input}
          onChange={setInput}
          label={mode === 'encode' ? 'Text to encode' : 'Base64 to decode'}
          placeholder={mode === 'encode' ? 'Hello, wörld! 🌍' : 'SGVsbG8sIHfDtnJsZCEg8J+MjQ=='}
          sample={mode === 'encode' ? 'Hello, wörld! 🌍' : 'SGVsbG8sIHfDtnJsZCEg8J+MjQ=='}
          accept=".txt,.b64,text/*"
          invalid={Boolean(result.error)}
          autoFocus
        />
        <div className="flex flex-col gap-3">
          {result.error && (
            <Callout tone="error" title="Cannot decode">
              {result.error}
            </Callout>
          )}
          {result.binary && (
            <Callout tone="info" title="Decoded to binary data">
              <p>
                {formatBytes(result.binary.length)} that is not UTF-8 text
                {binaryType ? ` — looks like ${binaryType.description} (${binaryType.mime})` : ''}.
              </p>
              <button
                type="button"
                className="btn btn-sm mt-2"
                onClick={() => {
                  const bytes = result.binary!;
                  downloadBlob(new Blob([bytes.slice()], { type: binaryType?.mime ?? 'application/octet-stream' }), `decoded.${binaryType?.extension ?? 'bin'}`);
                }}
              >
                <Download size={14} aria-hidden /> Download file
              </button>
            </Callout>
          )}
          <TextOutput value={result.output} label={mode === 'encode' ? 'Base64' : 'Decoded text'} filename={mode === 'encode' ? 'encoded.txt' : 'decoded.txt'} fill />
        </div>
      </Workspace>

      <section className="mt-6" aria-labelledby="b64-file">
        <h2 id="b64-file" className="mb-2 text-sm font-semibold">
          Encode a file
        </h2>
        <Dropzone
          onFiles={onFile}
          multiple={false}
          compact={Boolean(file)}
          icon={<FileUp size={26} />}
          title="Drop any file to Base64-encode it"
          description="Images, PDFs, fonts — the result includes a ready-made data URI."
        />
        {file && (
          <div className="card mt-3 p-4">
            <KeyValue
              dense
              rows={[
                { key: 'File', value: file.name, mono: false },
                { key: 'Size', value: `${formatBytes(file.size)} → ${formatBytes(file.base64.length)} as Base64 (+${Math.round((file.base64.length / Math.max(1, file.size) - 1) * 100)}%)` },
                { key: 'MIME type', value: file.type },
              ]}
            />
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <TextOutput value={file.base64} label="Base64" rows={6} filename={`${file.name}.b64`} />
              <TextOutput value={`data:${file.type};base64,${file.base64}`} label="Data URI" rows={6} />
            </div>
          </div>
        )}
      </section>
    </ToolShell>
  );
}
