/**
 * Identifier generation: UUID v1/v4/v5/v7, ULID, NanoID, short IDs, plus
 * UUID inspection. Everything uses crypto.getRandomValues.
 */
import { utf8Encode } from './encoding';

export type UuidVersion = 'v1' | 'v4' | 'v5' | 'v7' | 'nil' | 'max';

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function formatUuidBytes(bytes: Uint8Array): string {
  const h = Array.from(bytes, (b) => HEX[b]!).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function uuidV4(): string {
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return formatUuidBytes(b);
}

/** RFC 9562 UUID v7 — time-ordered, millisecond timestamp + random. */
export function uuidV7(timestamp = Date.now()): string {
  const b = randomBytes(16);
  const ts = BigInt(timestamp);
  b[0] = Number((ts >> 40n) & 0xffn);
  b[1] = Number((ts >> 32n) & 0xffn);
  b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn);
  b[4] = Number((ts >> 8n) & 0xffn);
  b[5] = Number(ts & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return formatUuidBytes(b);
}

const v1ClockSeq = randomBytes(2);
let v1Node: Uint8Array | null = null;
let v1LastTime = 0n;

/** UUID v1 with a random (multicast-bit) node ID — never leaks a MAC address. */
export function uuidV1(timestamp = Date.now()): string {
  if (!v1Node) {
    v1Node = randomBytes(6);
    v1Node[0] = v1Node[0]! | 0x01;
  }
  // 100ns intervals since 1582-10-15.
  let time = BigInt(timestamp) * 10000n + 122192928000000000n;
  if (time <= v1LastTime) time = v1LastTime + 1n;
  v1LastTime = time;
  const timeLow = Number(time & 0xffffffffn);
  const timeMid = Number((time >> 32n) & 0xffffn);
  const timeHi = Number((time >> 48n) & 0x0fffn) | 0x1000;
  const clock = (((v1ClockSeq[0]! << 8) | v1ClockSeq[1]!) & 0x3fff) | 0x8000;
  const b = new Uint8Array(16);
  const view = new DataView(b.buffer);
  view.setUint32(0, timeLow);
  view.setUint16(4, timeMid);
  view.setUint16(6, timeHi);
  view.setUint16(8, clock);
  b.set(v1Node, 10);
  return formatUuidBytes(b);
}

export const UUID_NAMESPACES = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
} as const;

export function parseUuid(uuid: string): Uint8Array | null {
  const clean = uuid.trim().replace(/^urn:uuid:/i, '').replace(/[{}]/g, '').replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(clean)) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** UUID v5 (SHA-1 name-based). */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const ns = parseUuid(namespace);
  if (!ns) throw new Error('Namespace must be a valid UUID.');
  const nameBytes = utf8Encode(name);
  const data = new Uint8Array(16 + nameBytes.length);
  data.set(ns);
  data.set(nameBytes, 16);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  const b = hash.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return formatUuidBytes(b);
}

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

export interface UuidInfo {
  valid: boolean;
  version: number | null;
  variant: string;
  timestamp: Date | null;
  description: string;
}

export function inspectUuid(uuid: string): UuidInfo {
  const bytes = parseUuid(uuid);
  if (!bytes) return { valid: false, version: null, variant: 'n/a', timestamp: null, description: 'Not a valid UUID.' };
  const str = formatUuidBytes(bytes);
  if (str === NIL_UUID) return { valid: true, version: 0, variant: 'nil', timestamp: null, description: 'The nil UUID (all zeros).' };
  if (str === MAX_UUID) return { valid: true, version: 15, variant: 'max', timestamp: null, description: 'The max UUID (all ones).' };
  const version = bytes[6]! >> 4;
  const v = bytes[8]!;
  let variant = 'reserved (NCS)';
  if ((v & 0xc0) === 0x80) variant = 'RFC 4122 / 9562';
  else if ((v & 0xe0) === 0xc0) variant = 'Microsoft GUID';
  else if ((v & 0xe0) === 0xe0) variant = 'reserved (future)';
  let timestamp: Date | null = null;
  let description = `Version ${version} UUID.`;
  if (version === 1 || version === 6) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let t: bigint;
    if (version === 1) {
      t = (BigInt(view.getUint16(6) & 0x0fff) << 48n) | (BigInt(view.getUint16(4)) << 32n) | BigInt(view.getUint32(0));
    } else {
      t = (BigInt(view.getUint32(0)) << 28n) | (BigInt(view.getUint16(4)) << 12n) | BigInt(view.getUint16(6) & 0x0fff);
    }
    const ms = Number((t - 122192928000000000n) / 10000n);
    timestamp = new Date(ms);
    description = version === 1 ? 'Time-based UUID (Gregorian timestamp + node ID).' : 'Reordered time-based UUID (sortable v1).';
  } else if (version === 7) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ms = Number((BigInt(view.getUint32(0)) << 16n) | BigInt(view.getUint16(4)));
    timestamp = new Date(ms);
    description = 'Unix-time ordered UUID (RFC 9562) — sorts chronologically.';
  } else if (version === 4) description = 'Random UUID — 122 bits of entropy.';
  else if (version === 3) description = 'Name-based UUID (MD5).';
  else if (version === 5) description = 'Name-based UUID (SHA-1).';
  else if (version === 8) description = 'Custom/vendor-defined UUID.';
  return { valid: true, version, variant, timestamp, description };
}

/* -------------------------------------------------------------------------- */
/* ULID, NanoID, misc                                                         */
/* -------------------------------------------------------------------------- */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(timestamp = Date.now()): string {
  let time = '';
  let t = timestamp;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rand = randomBytes(16);
  let random = '';
  for (let i = 0; i < 16; i++) random += CROCKFORD[rand[i]! % 32];
  return time + random;
}

export function ulidTimestamp(id: string): Date | null {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) return null;
  let t = 0;
  for (const ch of id.slice(0, 10).toUpperCase()) t = t * 32 + CROCKFORD.indexOf(ch);
  return new Date(t);
}

export const NANOID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

export function nanoid(size = 21, alphabet = NANOID_ALPHABET): string {
  if (!alphabet.length) throw new Error('Alphabet cannot be empty.');
  const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * size) / alphabet.length);
  let id = '';
  while (id.length < size) {
    const bytes = randomBytes(step);
    for (let i = 0; i < step && id.length < size; i++) {
      const ch = alphabet[bytes[i]! & mask];
      if (ch !== undefined) id += ch;
    }
  }
  return id;
}

export function randomHex(bytes: number): string {
  return Array.from(randomBytes(bytes), (b) => HEX[b]!).join('');
}

export function objectId(timestamp = Date.now()): string {
  const secs = Math.floor(timestamp / 1000).toString(16).padStart(8, '0');
  return secs + randomHex(8);
}

export type IdFormat = 'lower' | 'upper' | 'braces' | 'urn' | 'compact' | 'base64';

export function formatUuid(uuid: string, format: IdFormat): string {
  const bytes = parseUuid(uuid);
  if (!bytes) return uuid;
  const std = formatUuidBytes(bytes);
  switch (format) {
    case 'upper':
      return std.toUpperCase();
    case 'braces':
      return `{${std}}`;
    case 'urn':
      return `urn:uuid:${std}`;
    case 'compact':
      return std.replace(/-/g, '');
    case 'base64':
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    default:
      return std;
  }
}
