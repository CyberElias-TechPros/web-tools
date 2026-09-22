import { useEffect, useRef, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented, Stat, TextField } from '@/components/ui';
import { HeroResult, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { decryptBytes, decryptText, encryptBytes, encryptText, isEncryptedEnvelope, passwordStrength } from '@/lib/textcrypto';
import { downloadBlob } from '@/lib/files';
import { formatBytes } from '@/lib/image';

type Mode = 'encrypt' | 'decrypt';
type Kind = 'text' | 'file';

export default function EncryptTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('encrypt');
  const [kind, setKind] = useState<Kind>('text');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileResult, setFileResult] = useState<{ blob: Blob; name: string } | null>(null);
  const runId = useRef(0);

  const strength = passwordStrength(password);

  // Text path: derive output whenever inputs change (debounced, cancellable).
  useEffect(() => {
    if (kind !== 'text') return;
    const id = ++runId.current;
    if (!input.trim() || !password) {
      const timer = setTimeout(() => {
        if (id === runId.current) {
          setOutput('');
          setError(null);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setBusy(true);
      const job = mode === 'encrypt' ? encryptText(input, password) : decryptText(input.trim(), password);
      job
        .then((text) => {
          if (id !== runId.current) return;
          setOutput(text);
          setError(null);
        })
        .catch((e: unknown) => {
          if (id !== runId.current) return;
          setOutput('');
          setError(mode === 'decrypt' ? (isEncryptedEnvelope(input.trim()) ? 'Wrong password, or the message was altered.' : 'That does not look like an encrypted message from this tool.') : e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (id === runId.current) setBusy(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [input, password, mode, kind]);

  const runFile = async (): Promise<void> => {
    if (!file || !password) return;
    setBusy(true);
    setError(null);
    setFileResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (mode === 'encrypt') {
        const out = await encryptBytes(bytes, password);
        setFileResult({ blob: new Blob([out as BlobPart], { type: 'application/octet-stream' }), name: `${file.name}.enc` });
      } else {
        const out = await decryptBytes(bytes, password);
        setFileResult({ blob: new Blob([out as BlobPart]), name: file.name.replace(/\.enc$/i, '') || 'decrypted.bin' });
      }
    } catch {
      setError(mode === 'decrypt' ? 'Wrong password, or this file was not encrypted by this tool.' : 'Encryption failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell slug="text-encryptor">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented label="Action" value={mode} onChange={(m) => { setMode(m); setOutput(''); setError(null); setFileResult(null); }} options={[{ value: 'encrypt', label: 'Encrypt' }, { value: 'decrypt', label: 'Decrypt' }]} />
        <Segmented label="What" value={kind} onChange={(k) => { setKind(k); setError(null); }} options={[{ value: 'text', label: 'Text' }, { value: 'file', label: 'File' }]} />
        <div className="flex min-w-64 flex-1 items-end gap-2">
          <TextField label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword} mono className="flex-1" autoFocus hint={password && mode === 'encrypt' ? `${strength.label} · ~${Math.round(strength.entropyBits)} bits · ${strength.crackTime} to brute-force` : undefined} />
          <button type="button" className="btn btn-sm mb-[1.375rem]" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {kind === 'text' ? (
        <Workspace>
          <TextInput value={input} onChange={setInput} label={mode === 'encrypt' ? 'Plain text' : 'Encrypted message'} placeholder={mode === 'encrypt' ? 'Anything you want to keep private…' : 'WT1.…'} rows={16} fill accept=".txt,.enc,text/*" />
          <div className="flex flex-col gap-3">
            {error && (
              <Callout tone="error" title={mode === 'encrypt' ? 'Could not encrypt' : 'Could not decrypt'}>
                {error}
              </Callout>
            )}
            <TextOutput value={output} label={busy ? 'Working…' : mode === 'encrypt' ? 'Encrypted message' : 'Decrypted text'} filename={mode === 'encrypt' ? 'message.enc.txt' : 'message.txt'} rows={16} fill placeholder={password ? undefined : 'Enter a password to begin.'} />
          </div>
        </Workspace>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Dropzone
            title={mode === 'encrypt' ? 'Drop a file to encrypt' : 'Drop an .enc file to decrypt'}
            description="Any type, processed entirely in memory"
            onFiles={(files) => {
              setFile(files[0] ?? null);
              setFileResult(null);
              setError(null);
            }}
          />
          <Panel title="Result">
            <div className="flex flex-col gap-3 p-4">
              {file ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="File" value={file.name} />
                    <Stat label="Size" value={formatBytes(file.size)} />
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => void runFile()} disabled={!password || busy}>
                    {busy ? 'Working…' : mode === 'encrypt' ? 'Encrypt file' : 'Decrypt file'}
                  </button>
                  {error && <Callout tone="error">{error}</Callout>}
                  {fileResult && (
                    <HeroResult
                      label={mode === 'encrypt' ? 'Encrypted' : 'Decrypted'}
                      value={<span className="text-lg">{fileResult.name}</span>}
                      sub={
                        <span className="flex items-center gap-3">
                          {formatBytes(fileResult.blob.size)}
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadBlob(fileResult.blob, fileResult.name)}>
                            Download
                          </button>
                        </span>
                      }
                    />
                  )}
                </>
              ) : (
                <p className="muted text-sm">Choose a file and a password, then run.</p>
              )}
            </div>
          </Panel>
        </div>
      )}

      <p className="muted mt-4 text-xs">
        AES-256-GCM with a key derived by PBKDF2-SHA-256 (600 000 iterations, random salt and nonce) via the browser’s Web Crypto API. The envelope format is <code className="font-mono">WT1.iterations.salt.iv.ciphertext</code>. Lose the password and the data is unrecoverable — by design.
      </p>
    </ToolShell>
  );
}
