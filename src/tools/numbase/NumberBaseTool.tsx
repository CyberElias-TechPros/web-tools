import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, CopyButton, NumberField, Panel, SelectField, TextField } from '@/components/ui';
import { KeyValue } from '@/components/TextIO';
import { BASES, convertNumber, float64Bits, fromRoman, groupDigits, toBase } from '@/lib/numbers';
import { useLocalStorage } from '@/hooks';

export default function NumberBaseTool(): React.ReactElement {
  const [raw, setRaw] = useState('255');
  const [base, setBase] = useLocalStorage('nb:base', 10);
  const [customBase, setCustomBase] = useLocalStorage('nb:custom', 7);
  const [group, setGroup] = useLocalStorage('nb:group', true);

  const result = useMemo(() => {
    const text = raw.trim();
    if (!text) return { value: null, error: null as string | null };
    try {
      const roman = base === 10 && /^[IVXLCDM]+$/i.test(text) ? fromRoman(text.toUpperCase()) : null;
      const conv = convertNumber(roman !== null ? String(roman) : text, base);
      return { value: conv, error: null, fromRoman: roman };
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [raw, base]);

  const v = result.value;
  const g = (s: string, size: number): string => (group ? groupDigits(s, size) : s);
  const decimalNumber = v && !v.hasFraction && v.decimal.length < 16 ? Number(v.decimal) : null;
  const custom = useMemo(() => {
    if (!v || v.hasFraction) return null;
    try {
      const big = BigInt(v.decimal);
      return toBase(big, Math.min(36, Math.max(2, Math.floor(customBase))));
    } catch {
      return null;
    }
  }, [v, customBase]);

  return (
    <ToolShell slug="number-base">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Input">
            <div className="flex flex-col gap-3 p-4">
              <SelectField label="Input base" value={String(base)} onChange={(b) => setBase(Number(b))} options={BASES.map((b) => ({ value: String(b.base), label: `${b.label} (base ${b.base})` }))} />
              <TextField label="Number" value={raw} onChange={setRaw} mono autoFocus invalid={Boolean(result.error)} hint={result.error ?? 'Prefixes like 0x, 0b, 0o are understood. Negative numbers and fractions work in any base; Roman numerals are accepted in decimal mode.'} />
              <div className="flex flex-wrap gap-1.5">
                {[['255', 10], ['0xDEADBEEF', 16], ['0b101010', 2], ['0o755', 8], ['-42', 10], ['3.14159', 10], ['MMXXIV', 10], ['18446744073709551615', 10]].map(([sample, b]) => (
                  <button key={String(sample)} type="button" className="chip font-mono hover:opacity-80" onClick={() => { setBase(Number(b)); setRaw(String(sample)); }}>
                    {sample}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> Group digits
              </label>
            </div>
          </Panel>
          <Panel title="Custom base">
            <div className="flex items-end gap-3 p-4">
              <NumberField label="Base (2–36)" value={customBase} onChange={setCustomBase} min={2} max={36} className="w-32" />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 font-mono text-sm">
                <span className="truncate">{custom ?? '—'}</span>
                {custom && <CopyButton value={custom} small label="" className="!px-1.5" />}
              </div>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {v && (
            <>
              {result.fromRoman !== null && result.fromRoman !== undefined && <Callout tone="info">Read “{raw.trim().toUpperCase()}” as the Roman numeral {result.fromRoman}.</Callout>}
              <Panel title="Conversions" bodyClassName="px-4">
                <KeyValue
                  rows={[
                    { key: 'Binary', value: g(v.binary, 4), copy: v.binary },
                    { key: 'Octal', value: g(v.octal, 3), copy: v.octal },
                    { key: 'Decimal', value: g(v.decimal, 3), copy: v.decimal },
                    { key: 'Hexadecimal', value: g(v.hex, 4), copy: v.hex },
                    { key: 'Base 32', value: v.base32, copy: v.base32 },
                    { key: 'Base 36', value: v.base36, copy: v.base36 },
                    ...(v.roman ? [{ key: 'Roman', value: v.roman, copy: v.roman }] : []),
                    ...(v.words ? [{ key: 'In words', value: v.words, mono: false, copy: v.words }] : []),
                    { key: 'Bits needed', value: String(v.bits) },
                    ...(v.fraction ? [{ key: 'Fraction (bin)', value: `0.${v.fraction.binary}` }, { key: 'Fraction (hex)', value: `0.${v.fraction.hex}` }] : []),
                  ]}
                />
              </Panel>
              {!v.hasFraction && (
                <Panel title="Two’s complement & byte order" description="Bit patterns for signed integer widths that can hold the value.">
                  <KeyValue
                    dense
                    className="px-4"
                    rows={[
                      { key: '8-bit', value: v.twosComplement[8] ? g(v.twosComplement[8], 4) : 'does not fit' },
                      { key: '16-bit', value: v.twosComplement[16] ? g(v.twosComplement[16], 4) : 'does not fit' },
                      { key: '32-bit', value: v.twosComplement[32] ? g(v.twosComplement[32], 4) : 'does not fit' },
                      { key: '64-bit', value: v.twosComplement[64] ? g(v.twosComplement[64], 4) : 'does not fit' },
                      ...(v.bytesLE ? [{ key: 'Bytes (little-endian)', value: v.bytesLE }, { key: 'Bytes (big-endian)', value: v.bytesBE ?? '' }] : []),
                    ]}
                  />
                </Panel>
              )}
              {decimalNumber !== null && Number.isFinite(decimalNumber) && (
                <Panel title="IEEE 754 double" description={`How ${decimalNumber} is stored as a JavaScript number.`}>
                  <FloatBits n={decimalNumber} />
                </Panel>
              )}
              {v.hasFraction && (
                <Panel title="IEEE 754 double">
                  <FloatBits n={Number(v.decimal)} />
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </ToolShell>
  );
}

function FloatBits({ n }: { n: number }): React.ReactElement {
  const bits = float64Bits(n);
  return (
    <div className="p-4 font-mono text-xs">
      <div className="flex flex-wrap gap-1 break-all">
        <span className="rounded px-1" style={{ background: 'color-mix(in oklab, var(--danger) 25%, transparent)' }} title="sign">{bits.sign}</span>
        <span className="rounded px-1" style={{ background: 'color-mix(in oklab, var(--accent) 25%, transparent)' }} title="exponent">{bits.exponent}</span>
        <span className="rounded px-1" style={{ background: 'color-mix(in oklab, var(--accent-2) 25%, transparent)' }} title="mantissa">{bits.mantissa}</span>
      </div>
      <p className="muted mt-2">sign · exponent (11) · mantissa (52) — hex {bits.hex} · as float32 {bits.float32Hex}</p>
    </div>
  );
}
