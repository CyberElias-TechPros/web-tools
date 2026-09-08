import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  Disclosure,
  FieldGroup,
  Panel,
  Segmented,
  Slider,
  Stat,
  Toasts,
  Toggle,
  useToasts,
} from '@/components/ui';
import {
  assessStrength,
  buildAlphabet,
  defaultPassphraseOptions,
  defaultPasswordOptions,
  generatePassphrase,
  generatePassword,
  generatePin,
} from '@/lib/password';
import type { GeneratedSecret, PassphraseOptions, PasswordOptions } from '@/lib/password';
import { WORDLIST_SIZE } from '@/lib/wordlist';
import { useCopy, useLocalStorage } from '@/hooks';

type Mode = 'password' | 'passphrase' | 'pin';

const LEVEL_COLOR: Record<string, string> = {
  critical: 'var(--danger)',
  weak: 'var(--danger)',
  fair: 'var(--warn)',
  strong: 'var(--ok)',
  excellent: 'var(--ok)',
};

export default function PasswordTool(): React.ReactElement {
  const [mode, setMode] = useLocalStorage<Mode>('wt:password:mode', 'password');
  const [passwordOptions, setPasswordOptions] = useLocalStorage<PasswordOptions>(
    'wt:password:options',
    defaultPasswordOptions,
  );
  const [passphraseOptions, setPassphraseOptions] = useLocalStorage<PassphraseOptions>(
    'wt:passphrase:options',
    defaultPassphraseOptions,
  );
  const [pinLength, setPinLength] = useLocalStorage<number>('wt:pin:length', 6);
  const [batchCount, setBatchCount] = useState(1);
  const [reveal, setReveal] = useState(true);
  const [secrets, setSecrets] = useState<GeneratedSecret[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checkValue, setCheckValue] = useState('');

  const { copied, copy } = useCopy();
  const { toasts, push, dismiss } = useToasts();

  const generate = useCallback(() => {
    try {
      const count = Math.max(1, Math.min(50, batchCount));
      const next: GeneratedSecret[] = [];
      for (let i = 0; i < count; i++) {
        if (mode === 'password') next.push(generatePassword(passwordOptions));
        else if (mode === 'passphrase') next.push(generatePassphrase(passphraseOptions));
        else next.push(generatePin(pinLength));
      }
      setSecrets(next);
      setError(null);
    } catch (e) {
      setSecrets([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [mode, passwordOptions, passphraseOptions, pinLength, batchCount]);

  // Regenerate whenever the settings change, so the preview always matches the
  // controls. This genuinely has to be an effect: generation reads the CSPRNG,
  // so it is impure and cannot live in render or a useMemo (React is free to
  // discard and recompute a memo, which would silently swap the secret the user
  // is about to copy).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generate();
  }, [generate]);

  const primary = secrets[0];
  const strength = useMemo(
    () => (primary ? assessStrength(primary.value, primary.entropyBits) : null),
    [primary],
  );
  const checkStrength = useMemo(
    () => (checkValue ? assessStrength(checkValue) : null),
    [checkValue],
  );

  const alphabet = useMemo(() => buildAlphabet(passwordOptions), [passwordOptions]);

  const setPwd = <K extends keyof PasswordOptions>(key: K, value: PasswordOptions[K]): void =>
    setPasswordOptions((prev) => ({ ...prev, [key]: value }));
  const setPhrase = <K extends keyof PassphraseOptions>(
    key: K,
    value: PassphraseOptions[K],
  ): void => setPassphraseOptions((prev) => ({ ...prev, [key]: value }));

  const copyAll = async (): Promise<void> => {
    const ok = await copy(secrets.map((s) => s.value).join('\n'), 'all');
    push(ok ? `Copied ${secrets.length} to the clipboard.` : 'Copying was blocked by the browser.', ok ? 'success' : 'error');
  };

  return (
    <ToolShell
      slug="password-generator"
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={generate}>
          <RefreshCw size={14} aria-hidden />
          Generate
        </button>
      }
    >
      <div className="mb-4">
        <Segmented
          label="Secret type"
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            { value: 'password', label: 'Random password', title: 'Maximum entropy per character' },
            { value: 'passphrase', label: 'Passphrase', title: 'Memorable, typed easily' },
            { value: 'pin', label: 'Numeric PIN', title: 'Digits only' },
          ]}
        />
      </div>

      {error && (
        <Callout tone="error" title="Cannot generate" className="mb-4">
          {error}
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Panel title="Settings" bodyClassName="space-y-5 p-4">
          {mode === 'password' && (
            <>
              <Slider
                label="Length"
                min={4}
                max={128}
                value={passwordOptions.length}
                onChange={(v) => setPwd('length', v)}
                format={(v) => `${v} characters`}
                hint={
                  passwordOptions.length < 12
                    ? 'Under 12 characters is not enough for anything important.'
                    : undefined
                }
              />
              <FieldGroup label="Character types">
                <div className="space-y-2.5">
                  <Toggle
                    checked={passwordOptions.lowercase}
                    onChange={(v) => setPwd('lowercase', v)}
                    label="Lowercase (a–z)"
                  />
                  <Toggle
                    checked={passwordOptions.uppercase}
                    onChange={(v) => setPwd('uppercase', v)}
                    label="Uppercase (A–Z)"
                  />
                  <Toggle
                    checked={passwordOptions.digits}
                    onChange={(v) => setPwd('digits', v)}
                    label="Digits (0–9)"
                  />
                  <Toggle
                    checked={passwordOptions.symbols}
                    onChange={(v) => setPwd('symbols', v)}
                    label="Symbols (!@#$…)"
                  />
                </div>
              </FieldGroup>

              <FieldGroup
                label="Extra characters"
                hint="Added to the alphabet — useful when a site allows an unusual set."
                htmlFor="custom-chars"
              >
                <input
                  id="custom-chars"
                  type="text"
                  className="field font-mono"
                  value={passwordOptions.customCharacters}
                  onChange={(e) => setPwd('customCharacters', e.target.value)}
                  placeholder="e.g. ~^<>"
                  maxLength={64}
                />
              </FieldGroup>

              <FieldGroup label="Rules">
                <div className="space-y-2.5">
                  <Toggle
                    checked={passwordOptions.requireEachClass}
                    onChange={(v) => setPwd('requireEachClass', v)}
                    label="At least one of each type"
                    hint="Satisfies strict site validators. Slightly reduces true entropy."
                  />
                  <Toggle
                    checked={passwordOptions.excludeAmbiguous}
                    onChange={(v) => setPwd('excludeAmbiguous', v)}
                    label="Avoid look-alike characters"
                    hint="Excludes I l 1 O 0 o and similar, for passwords read aloud or typed from paper."
                  />
                  <Toggle
                    checked={passwordOptions.noRepeats}
                    onChange={(v) => setPwd('noRepeats', v)}
                    label="No character twice in a row"
                  />
                </div>
              </FieldGroup>

              <p className="muted text-xs">
                Alphabet: <strong>{alphabet.pool.length}</strong> characters across{' '}
                {alphabet.classes.length} type{alphabet.classes.length === 1 ? '' : 's'}.
              </p>
            </>
          )}

          {mode === 'passphrase' && (
            <>
              <Slider
                label="Words"
                min={3}
                max={12}
                value={passphraseOptions.wordCount}
                onChange={(v) => setPhrase('wordCount', v)}
                format={(v) => `${v} words`}
                hint={
                  passphraseOptions.wordCount < 4
                    ? 'Four words is the practical minimum for a passphrase.'
                    : undefined
                }
              />
              <FieldGroup label="Separator">
                <Segmented
                  size="sm"
                  value={passphraseOptions.separator}
                  onChange={(v) => setPhrase('separator', v)}
                  options={[
                    { value: '-', label: 'hyphen' },
                    { value: '.', label: 'dot' },
                    { value: '_', label: 'under' },
                    { value: ' ', label: 'space' },
                    { value: '', label: 'none' },
                  ]}
                />
              </FieldGroup>
              <FieldGroup label="Capitalisation">
                <Segmented
                  size="sm"
                  value={passphraseOptions.wordCase}
                  onChange={(v) => setPhrase('wordCase', v)}
                  options={[
                    { value: 'lower', label: 'lower' },
                    { value: 'title', label: 'Title' },
                    { value: 'upper', label: 'UPPER' },
                    { value: 'mixed', label: 'MiXeD' },
                  ]}
                />
              </FieldGroup>
              <FieldGroup label="Add complexity">
                <div className="space-y-2.5">
                  <Toggle
                    checked={passphraseOptions.includeNumber}
                    onChange={(v) => setPhrase('includeNumber', v)}
                    label="Append a digit to one word"
                    hint="Satisfies “must contain a number” validators."
                  />
                  <Toggle
                    checked={passphraseOptions.includeSymbol}
                    onChange={(v) => setPhrase('includeSymbol', v)}
                    label="Append a symbol to one word"
                  />
                </div>
              </FieldGroup>
              <Slider
                label="Longest word"
                min={4}
                max={9}
                value={passphraseOptions.maxWordLength}
                onChange={(v) => setPhrase('maxWordLength', v)}
                format={(v) => `${v} letters`}
                hint="Shorter words are faster to type on a phone."
              />
              <p className="muted text-xs">
                Drawn from a curated list of <strong>{WORDLIST_SIZE.toLocaleString()}</strong> common
                English words — about {Math.log2(WORDLIST_SIZE).toFixed(1)} bits per word.
              </p>
            </>
          )}

          {mode === 'pin' && (
            <>
              <Slider
                label="Digits"
                min={3}
                max={16}
                value={pinLength}
                onChange={setPinLength}
                format={(v) => `${v} digits`}
              />
              <Callout tone="warning">
                A PIN is only safe where the number of attempts is strictly limited, such as a phone
                lock screen or a bank card. Never use one as a website password.
              </Callout>
            </>
          )}

          <FieldGroup label="How many to generate">
            <Segmented
              size="sm"
              value={String(batchCount)}
              onChange={(v) => setBatchCount(Number(v))}
              options={[
                { value: '1', label: '1' },
                { value: '5', label: '5' },
                { value: '10', label: '10' },
                { value: '25', label: '25' },
              ]}
            />
          </FieldGroup>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel
            title="Generated"
            actions={
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setReveal((v) => !v)}
                  aria-pressed={!reveal}
                >
                  {reveal ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  {reveal ? 'Hide' : 'Reveal'}
                </button>
                {secrets.length > 1 && (
                  <button type="button" className="btn btn-sm" onClick={() => void copyAll()}>
                    <Copy size={14} aria-hidden />
                    Copy all
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-primary" onClick={generate}>
                  <RefreshCw size={14} aria-hidden />
                  New
                </button>
              </>
            }
            bodyClassName="p-4 space-y-3"
          >
            {secrets.length === 0 && !error && (
              <p className="muted py-6 text-center text-sm">Nothing generated yet.</p>
            )}

            {primary && (
              <div
                className="rounded-xl border p-4"
                style={{ background: 'var(--surface)' }}
              >
                {/* <output> carries an implicit `status` role, so assistive tech
                    announces each new secret and can address it by name. */}
                <output
                  className="code-area block break-all select-all"
                  style={{ fontSize: primary.value.length > 40 ? '0.95rem' : '1.25rem', lineHeight: 1.5 }}
                  aria-label="Generated secret"
                >
                  {reveal ? primary.value : '•'.repeat(Math.min(48, primary.value.length))}
                </output>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={async () => {
                      const ok = await copy(primary.value, 'primary');
                      if (!ok) push('Copying was blocked by the browser.', 'error');
                    }}
                  >
                    <Copy size={14} aria-hidden />
                    {copied === 'primary' ? 'Copied' : 'Copy'}
                  </button>
                  <span className="muted text-xs">
                    {primary.value.length} characters · pool of {primary.poolSize.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {strength && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: LEVEL_COLOR[strength.level] }}>
                    {strength.label}
                  </span>
                  <span className="muted font-mono text-xs">
                    {strength.entropyBits} bits of entropy
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full"
                  role="meter"
                  aria-valuenow={strength.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Password strength"
                  style={{ background: 'var(--surface-3)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${strength.score}%`, background: LEVEL_COLOR[strength.level] }}
                  />
                </div>
                <p className="muted mt-2 text-xs">
                  An attacker with 100 billion guesses per second — a realistic offline GPU cluster
                  against a fast hash — would need about{' '}
                  <strong style={{ color: 'var(--text)' }}>{strength.crackTime}</strong> on average.
                </p>
              </div>
            )}

            {secrets.length > 1 && (
              <ul className="divide-y rounded-lg border">
                {secrets.slice(1).map((secret, index) => (
                  <li key={index} className="flex items-center gap-2 px-3 py-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs select-all">
                      {reveal ? secret.value : '•'.repeat(Math.min(32, secret.value.length))}
                    </code>
                    <span className="muted shrink-0 font-mono text-[0.7rem]">
                      {Math.round(secret.entropyBits)}b
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost shrink-0"
                      onClick={() => void copy(secret.value, `s${index}`)}
                      aria-label={`Copy secret ${index + 2}`}
                    >
                      {copied === `s${index}` ? '✓' : <Copy size={13} aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Check an existing password"
            description="Typed here only — never stored, never sent."
            actions={
              checkValue ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setCheckValue('')}
                  aria-label="Clear"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              ) : null
            }
            bodyClassName="p-4 space-y-3"
          >
            <input
              type="text"
              className="field code-area"
              value={checkValue}
              onChange={(e) => setCheckValue(e.target.value)}
              placeholder="Paste a password to assess its strength"
              autoComplete="off"
              spellCheck={false}
              aria-label="Password to check"
            />
            {checkStrength && (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Strength" value={checkStrength.label} />
                  <Stat label="Entropy" value={`${checkStrength.entropyBits} bits`} />
                  <Stat label="Length" value={checkValue.length} />
                  <Stat label="Time to crack" value={checkStrength.crackTime} />
                </div>
                {checkStrength.warnings.length > 0 ? (
                  <Callout tone="warning" title="Weaknesses found">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {checkStrength.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Callout>
                ) : (
                  <Callout tone="success">
                    No common weaknesses detected. Note that this check cannot know whether the
                    password has appeared in a breach — that would require sending it somewhere.
                  </Callout>
                )}
              </>
            )}
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card flex gap-3 p-4">
              <ShieldCheck size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} aria-hidden />
              <div>
                <h3 className="text-sm font-semibold">Real randomness</h3>
                <p className="muted mt-1 text-xs leading-relaxed">
                  Values come from <code className="font-mono">crypto.getRandomValues</code> with
                  rejection sampling, so every character is equally likely. If a secure source is
                  unavailable, generation fails rather than silently using{' '}
                  <code className="font-mono">Math.random</code>.
                </p>
              </div>
            </div>
            <div className="card flex gap-3 p-4">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} aria-hidden />
              <div>
                <h3 className="text-sm font-semibold">Where entropy comes from</h3>
                <p className="muted mt-1 text-xs leading-relaxed">
                  Bits are computed from the actual pool size and length, not a made-up score.
                  Length beats complexity: a 16-character lowercase password is stronger than an
                  8-character one with every symbol type.
                </p>
              </div>
            </div>
          </div>

          <Disclosure summary="Guidance worth following">
            <ul className="muted list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
              <li>
                Use a password manager and a unique password per site. Reuse, not weakness, is how
                most accounts are actually lost.
              </li>
              <li>
                Aim for 75+ bits of entropy for anything that matters, and 100+ for a password
                manager master password or a disk encryption key.
              </li>
              <li>
                Passphrases are for the handful of secrets you must type from memory. Everything
                else should be a long random string you never see.
              </li>
              <li>
                Enable two-factor authentication. It defends you even when a password does leak.
              </li>
              <li>
                Nothing here is transmitted, but be mindful of shoulder-surfing and clipboard
                managers that keep history.
              </li>
            </ul>
          </Disclosure>
        </div>
      </div>

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}
