/**
 * Hashing: MD5 (first-party, since WebCrypto refuses it), SHA-1/256/384/512
 * via SubtleCrypto, HMAC, CRC32 and Adler-32. Works on strings or bytes.
 */
import { crc32 } from './zip';
import { bytesToBase64, bytesToHex } from './encoding';

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512' | 'crc32' | 'adler32';

export const HASH_ALGORITHMS: Array<{ id: HashAlgorithm; label: string; bits: number; note: string }> = [
  { id: 'md5', label: 'MD5', bits: 128, note: 'Legacy checksum — fine for integrity, broken for security.' },
  { id: 'sha1', label: 'SHA-1', bits: 160, note: 'Deprecated for signatures; still used by Git.' },
  { id: 'sha256', label: 'SHA-256', bits: 256, note: 'The everyday default for digests and checksums.' },
  { id: 'sha384', label: 'SHA-384', bits: 384, note: 'Truncated SHA-512 — used in TLS suites and SRI.' },
  { id: 'sha512', label: 'SHA-512', bits: 512, note: 'Faster than SHA-256 on 64-bit hardware.' },
  { id: 'crc32', label: 'CRC-32', bits: 32, note: 'Error-detection checksum used by ZIP and PNG.' },
  { id: 'adler32', label: 'Adler-32', bits: 32, note: 'zlib’s fast checksum.' },
];

const SUBTLE_NAMES: Partial<Record<HashAlgorithm, string>> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

const encoder = new TextEncoder();

export function toBytes(input: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof input === 'string') return encoder.encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/* -------------------------------------------------------------------------- */
/* MD5 (RFC 1321)                                                             */
/* -------------------------------------------------------------------------- */

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16,
  23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(input: string | Uint8Array | ArrayBuffer): Uint8Array {
  const msg = toBytes(input);
  const bitLen = msg.length * 8;
  const paddedLen = (((msg.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const M = new Uint32Array(16);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + MD5_K[i]! + M[g]!) >>> 0;
      A = D;
      D = C;
      C = B;
      const s = MD5_S[i]!;
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0, true);
  ov.setUint32(4, b0, true);
  ov.setUint32(8, c0, true);
  ov.setUint32(12, d0, true);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Checksums                                                                  */
/* -------------------------------------------------------------------------- */

export function adler32(input: string | Uint8Array | ArrayBuffer): number {
  const data = toBytes(input);
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32ToBytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function digest(algorithm: HashAlgorithm, input: string | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const bytes = toBytes(input);
  switch (algorithm) {
    case 'md5':
      return md5(bytes);
    case 'crc32':
      return u32ToBytes(crc32(bytes));
    case 'adler32':
      return u32ToBytes(adler32(bytes));
    default: {
      const name = SUBTLE_NAMES[algorithm];
      if (!name) throw new Error(`Unknown algorithm ${algorithm}`);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const result = await crypto.subtle.digest(name, copy);
      return new Uint8Array(result);
    }
  }
}

export type DigestEncoding = 'hex' | 'HEX' | 'base64' | 'base64url';

export function formatDigest(bytes: Uint8Array, encoding: DigestEncoding = 'hex'): string {
  switch (encoding) {
    case 'HEX':
      return bytesToHex(bytes).toUpperCase();
    case 'base64':
      return bytesToBase64(bytes);
    case 'base64url':
      return bytesToBase64(bytes, true, false);
    default:
      return bytesToHex(bytes);
  }
}

export async function hmac(algorithm: 'sha1' | 'sha256' | 'sha384' | 'sha512', key: string | Uint8Array, message: string | Uint8Array): Promise<Uint8Array> {
  const name = SUBTLE_NAMES[algorithm]!;
  const keyBytes = toBytes(key);
  const keyCopy = new Uint8Array(keyBytes.byteLength);
  keyCopy.set(keyBytes);
  const cryptoKey = await crypto.subtle.importKey('raw', keyCopy, { name: 'HMAC', hash: name }, false, ['sign']);
  const msgBytes = toBytes(message);
  const msgCopy = new Uint8Array(msgBytes.byteLength);
  msgCopy.set(msgBytes);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgCopy);
  return new Uint8Array(sig);
}

/** Constant-time-ish comparison of two hex digests (case-insensitive). */
export function digestsEqual(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** Guess which algorithm produced a hex digest from its length. */
export function guessAlgorithmFromDigest(hex: string): HashAlgorithm[] {
  const len = hex.trim().replace(/[^0-9a-f]/gi, '').length;
  switch (len) {
    case 8:
      return ['crc32', 'adler32'];
    case 32:
      return ['md5'];
    case 40:
      return ['sha1'];
    case 64:
      return ['sha256'];
    case 96:
      return ['sha384'];
    case 128:
      return ['sha512'];
    default:
      return [];
  }
}
