import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldOff, ShieldQuestion } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, TextField, Toggle } from '@/components/ui';
import { KeyValue, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { decodeJwt, signJwtHmac, supportsVerification, verifyJwtHmac } from '@/lib/jwt';
import type { DecodedJwt } from '@/lib/jwt';
import { useDebounced } from '@/hooks';

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImFkbWluIjp0cnVlLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6NDEwMjQ0NDgwMH0.sample-signature-not-valid';

type Verification = 'idle' | 'valid' | 'invalid' | 'unsupported';

export default function JwtTool(): React.ReactElement {
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [secretIsBase64, setSecretIsBase64] = useState(false);
  const [verification, setVerification] = useState<Verification>('idle');
  const debouncedToken = useDebounced(token.trim(), 120);
  const debouncedSecret = useDebounced(secret, 200);

  const decoded = useMemo<{ jwt: DecodedJwt | null; error: string | null }>(() => {
    if (!debouncedToken) return { jwt: null, error: null };
    try {
      return { jwt: decodeJwt(debouncedToken), error: null };
    } catch (e) {
      return { jwt: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [debouncedToken]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (!decoded.jwt || !debouncedSecret) {
        setVerification('idle');
        return;
      }
      if (!supportsVerification(decoded.jwt.algorithm)) {
        setVerification('unsupported');
        return;
      }
      const ok = await verifyJwtHmac(debouncedToken, debouncedSecret, secretIsBase64);
      if (!cancelled) setVerification(ok ? 'valid' : 'invalid');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [decoded.jwt, debouncedSecret, debouncedToken, secretIsBase64]);

  const jwt = decoded.jwt;

  const makeSample = async (): Promise<void> => {
    const now = Math.floor(Date.now() / 1000);
    const sample = await signJwtHmac(
      { alg: 'HS256', typ: 'JWT' },
      { sub: '1234567890', name: 'Ada Lovelace', role: 'admin', iat: now, exp: now + 3600, iss: 'https://web-tools.example' },
      'secret',
    );
    setToken(sample);
    setSecret('secret');
  };

  return (
    <ToolShell slug="jwt-decoder">
      <Workspace>
        <div className="flex flex-col gap-4">
          <TextInput
            value={token}
            onChange={setToken}
            label="Token"
            placeholder="eyJhbGciOi…"
            rows={7}
            invalid={Boolean(decoded.error)}
            autoFocus
            actions={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void makeSample()}>
                Signed sample
              </button>
            }
            sample={SAMPLE}
          />
          <Panel title="Verify signature" description="HS256, HS384 and HS512 are verified locally with your secret. Nothing leaves this page.">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Secret" value={secret} onChange={setSecret} type="password" placeholder="your-256-bit-secret" mono />
              <Toggle checked={secretIsBase64} onChange={setSecretIsBase64} label="Secret is Base64-encoded" />
              <VerificationBadge state={verification} algorithm={jwt?.algorithm} />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {decoded.error && (
            <Callout tone="error" title="Not a valid JWT">
              {decoded.error}
            </Callout>
          )}
          {jwt && (
            <>
              {jwt.issues.length > 0 && (
                <Callout tone={jwt.expired ? 'error' : 'warning'} title={jwt.expired ? 'This token has expired' : 'Things to note'}>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {jwt.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <Panel title="Claims" description="Registered claims explained; custom claims listed as-is." bodyClassName="px-4">
                <KeyValue
                  dense
                  rows={jwt.claims.map((c) => ({
                    key: c.label === c.key ? c.key : `${c.key} · ${c.label}`,
                    value: (
                      <span>
                        {c.display}
                        {c.note && <span className="muted block font-sans text-xs">{c.note}</span>}
                      </span>
                    ),
                    copy: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
                    tone: c.status === 'error' ? 'bad' : c.status === 'warn' ? 'warn' : c.status === 'ok' ? 'good' : 'default',
                  }))}
                />
              </Panel>
              <div className="grid gap-4 md:grid-cols-2">
                <TextOutput label="Header" value={JSON.stringify(jwt.header, null, 2)} rows={6} />
                <TextOutput label="Payload" value={JSON.stringify(jwt.payload, null, 2)} rows={6} />
              </div>
              <TextOutput label="Signature (Base64url)" value={jwt.signature} rows={2} />
            </>
          )}
          {!jwt && !decoded.error && (
            <div className="card muted flex h-full min-h-48 items-center justify-center p-8 text-center text-sm">
              Paste a token to see its header, claims and expiry.
            </div>
          )}
        </div>
      </Workspace>
    </ToolShell>
  );
}

function VerificationBadge({ state, algorithm }: { state: Verification; algorithm?: string }): React.ReactElement {
  if (state === 'idle') {
    return (
      <p className="muted flex items-center gap-2 text-sm">
        <ShieldQuestion size={16} aria-hidden /> Enter the secret to check the signature.
      </p>
    );
  }
  if (state === 'unsupported') {
    return (
      <Callout tone="info">
        {algorithm ?? 'This algorithm'} uses an asymmetric key; only HMAC (HS*) tokens can be verified with a shared secret here.
      </Callout>
    );
  }
  if (state === 'valid') {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ok)' }} role="status">
        <ShieldCheck size={16} aria-hidden /> Signature verified with {algorithm}.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--danger)' }} role="status">
      <ShieldOff size={16} aria-hidden /> Signature does not match this secret.
    </p>
  );
}
