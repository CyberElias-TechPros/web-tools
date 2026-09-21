/**
 * Number base conversion with arbitrary precision (BigInt), fractional
 * support, two's complement views, bit inspection and human formatting.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export interface BaseConversion {
  binary: string;
  octal: string;
  decimal: string;
  hex: string;
  base32: string;
  base36: string;
  roman: string | null;
  words: string | null;
  bits: number;
  twosComplement: { 8: string | null; 16: string | null; 32: string | null; 64: string | null };
  bytesLE: string | null;
  bytesBE: string | null;
  isNegative: boolean;
  hasFraction: boolean;
  fraction?: { binary: string; hex: string; octal: string };
}

export function parseInBase(raw: string, base: number): { value: bigint; fraction: number; negative: boolean } {
  let text = raw.trim().toLowerCase().replace(/[_\s,]/g, '');
  if (!text) throw new Error('Enter a number.');
  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) text = text.slice(1);
  // Strip prefixes that match the base.
  if (base === 16 && text.startsWith('0x')) text = text.slice(2);
  else if (base === 2 && text.startsWith('0b')) text = text.slice(2);
  else if (base === 8 && (text.startsWith('0o'))) text = text.slice(2);
  if (!text) throw new Error('Enter a number.');
  const [intPart, fracPart] = text.split('.') as [string, string | undefined];
  const valid = DIGITS.slice(0, base);
  let value = 0n;
  for (const ch of intPart) {
    const d = valid.indexOf(ch);
    if (d < 0) throw new Error(`“${ch}” is not a valid base-${base} digit.`);
    value = value * BigInt(base) + BigInt(d);
  }
  let fraction = 0;
  if (fracPart !== undefined) {
    let scale = 1 / base;
    for (const ch of fracPart) {
      const d = valid.indexOf(ch);
      if (d < 0) throw new Error(`“${ch}” is not a valid base-${base} digit.`);
      fraction += d * scale;
      scale /= base;
    }
  }
  return { value, fraction, negative };
}

export function fractionToBase(fraction: number, base: number, digits = 16): string {
  let f = fraction;
  let out = '';
  for (let i = 0; i < digits && f > 0; i++) {
    f *= base;
    const d = Math.floor(f);
    out += DIGITS[d];
    f -= d;
  }
  return out;
}

export function groupDigits(s: string, size: number, sep = ' '): string {
  const out: string[] = [];
  for (let i = s.length; i > 0; i -= size) out.unshift(s.slice(Math.max(0, i - size), i));
  return out.join(sep);
}

export function toRoman(n: number): string | null {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return null;
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = n;
  let out = '';
  for (const [value, sym] of table) {
    while (rest >= value) {
      out += sym;
      rest -= value;
    }
  }
  return out;
}

export function fromRoman(s: string): number | null {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const upper = s.trim().toUpperCase();
  if (!upper || !/^[IVXLCDM]+$/.test(upper)) return null;
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const cur = map[upper[i]!]!;
    const next = map[upper[i + 1] ?? ''] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return toRoman(total) === upper ? total : null;
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion'];

export function numberToWords(value: bigint): string | null {
  if (value === 0n) return 'zero';
  const negative = value < 0n;
  let n = negative ? -value : value;
  const chunks: string[] = [];
  let scale = 0;
  while (n > 0n) {
    const chunk = Number(n % 1000n);
    if (chunk) {
      const words: string[] = [];
      const h = Math.floor(chunk / 100);
      const rest = chunk % 100;
      if (h) words.push(`${ONES[h]} hundred`);
      if (rest < 20 && rest > 0) words.push(ONES[rest]!);
      else if (rest >= 20) words.push(`${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`);
      const scaleWord = SCALES[scale];
      if (scaleWord === undefined) return null;
      chunks.unshift(`${words.join(' ')}${scaleWord ? ` ${scaleWord}` : ''}`);
    }
    n /= 1000n;
    scale++;
  }
  return `${negative ? 'minus ' : ''}${chunks.join(' ')}`;
}

function twos(value: bigint, bits: number): string | null {
  const min = -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(bits - 1)) - 1n;
  if (value < min || value > max) return null;
  const mod = 1n << BigInt(bits);
  const v = ((value % mod) + mod) % mod;
  return v.toString(2).padStart(bits, '0');
}

export function convertNumber(raw: string, base: number): BaseConversion {
  const { value, fraction, negative } = parseInBase(raw, base);
  const signed = negative ? -value : value;
  const sign = negative ? '-' : '';
  const hasFraction = fraction > 0;
  const bits = value === 0n ? 1 : value.toString(2).length;
  const bytes: string[] = [];
  if (!negative) {
    let hex = value.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    for (let i = 0; i < hex.length; i += 2) bytes.push(hex.slice(i, i + 2));
  }
  const decimal = sign + value.toString(10) + (hasFraction ? `.${fraction.toString().split('.')[1] ?? ''}` : '');
  return {
    binary: sign + value.toString(2),
    octal: sign + value.toString(8),
    decimal,
    hex: sign + value.toString(16),
    base32: sign + value.toString(32),
    base36: sign + value.toString(36),
    roman: !negative && !hasFraction && value < 4000n ? toRoman(Number(value)) : null,
    words: !hasFraction ? numberToWords(signed) : null,
    bits,
    twosComplement: { 8: twos(signed, 8), 16: twos(signed, 16), 32: twos(signed, 32), 64: twos(signed, 64) },
    bytesLE: bytes.length ? [...bytes].reverse().join(' ') : null,
    bytesBE: bytes.length ? bytes.join(' ') : null,
    isNegative: negative,
    hasFraction,
    fraction: hasFraction ? { binary: fractionToBase(fraction, 2), hex: fractionToBase(fraction, 16), octal: fractionToBase(fraction, 8) } : undefined,
  };
}

export function toBase(value: bigint, base: number): string {
  if (base < 2 || base > 36) throw new Error('Base must be between 2 and 36.');
  return value.toString(base);
}

/** IEEE-754 breakdown of a JS number. */
export function float64Bits(n: number): { sign: string; exponent: string; mantissa: string; hex: string; float32Hex: string } {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, n);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const bits = hi.toString(2).padStart(32, '0') + lo.toString(2).padStart(32, '0');
  const f32 = new DataView(new ArrayBuffer(4));
  f32.setFloat32(0, n);
  return {
    sign: bits[0]!,
    exponent: bits.slice(1, 12),
    mantissa: bits.slice(12),
    hex: `0x${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`,
    float32Hex: `0x${f32.getUint32(0).toString(16).padStart(8, '0')}`,
  };
}

export const BASES: Array<{ base: number; label: string; prefix: string }> = [
  { base: 2, label: 'Binary', prefix: '0b' },
  { base: 8, label: 'Octal', prefix: '0o' },
  { base: 10, label: 'Decimal', prefix: '' },
  { base: 16, label: 'Hexadecimal', prefix: '0x' },
  { base: 32, label: 'Base 32', prefix: '' },
  { base: 36, label: 'Base 36', prefix: '' },
];
