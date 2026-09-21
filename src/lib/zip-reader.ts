/**
 * Minimal ZIP reader — the counterpart of `zip.ts`.
 *
 * Parses the central directory, then extracts entries on demand. Inflate uses
 * the platform `DecompressionStream('deflate-raw')` where available and falls
 * back to a small pure-JS RFC 1951 decoder otherwise, so Office documents
 * (which are ZIP containers) can be opened in every current browser.
 *
 * Zip64 archives and encrypted entries are rejected with a clear error rather
 * than producing garbage.
 */

export interface ZipEntryInfo {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  /** Offset of the local file header. */
  offset: number;
  isDirectory: boolean;
  date: Date;
}

export interface ZipArchive {
  entries: ZipEntryInfo[];
  /** Case-sensitive lookup, tolerant of a leading slash and backslashes. */
  file(name: string): ZipEntryInfo | undefined;
  extract(entry: ZipEntryInfo | string): Promise<Uint8Array>;
  extractText(entry: ZipEntryInfo | string): Promise<string>;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const textDecoder = new TextDecoder('utf-8');

function dosToDate(dosDate: number, dosTime: number): Date {
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  const month = ((dosDate >> 5) & 0x0f) - 1;
  const day = dosDate & 0x1f;
  const hours = (dosTime >> 11) & 0x1f;
  const minutes = (dosTime >> 5) & 0x3f;
  const seconds = (dosTime & 0x1f) * 2;
  return new Date(year, Math.max(0, month), Math.max(1, day), hours, minutes, seconds);
}

function normaliseName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isZipData(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
}

export function readZip(input: ArrayBuffer | Uint8Array): Promise<ZipArchive> {
  try {
    return Promise.resolve(readZipSync(input));
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

export function readZipSync(input: ArrayBuffer | Uint8Array): ZipArchive {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (!isZipData(bytes)) {
    throw new Error('This file is not a ZIP archive (missing PK signature).');
  }

  // The end-of-central-directory record is at the end, before an optional
  // comment of up to 65,535 bytes.
  const minEocd = 22;
  let eocd = -1;
  for (let i = bytes.length - minEocd; i >= Math.max(0, bytes.length - minEocd - 0xffff); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP archive is truncated or corrupt (no end-of-central-directory record).');

  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('Zip64 archives are not supported.');
  }
  if (centralOffset + centralSize > bytes.length) {
    throw new Error('ZIP central directory points outside the file — the archive is corrupt.');
  }

  const entries: ZipEntryInfo[] = [];
  let p = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CENTRAL) {
      throw new Error(`ZIP central directory entry ${i + 1} is corrupt.`);
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const dosTime = view.getUint16(p + 12, true);
    const dosDate = view.getUint16(p + 14, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const rawName = bytes.subarray(p + 46, p + 46 + nameLength);
    const name = normaliseName(textDecoder.decode(rawName));
    if (flags & 0x1) {
      throw new Error(`“${name}” is encrypted; password-protected archives are not supported.`);
    }
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      crc32: crc,
      offset,
      isDirectory: name.endsWith('/'),
      date: dosToDate(dosDate, dosTime),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }

  const byName = new Map(entries.map((e) => [e.name, e]));

  const resolve = (entry: ZipEntryInfo | string): ZipEntryInfo => {
    if (typeof entry !== 'string') return entry;
    const found = byName.get(normaliseName(entry));
    if (!found) throw new Error(`“${entry}” is not in the archive.`);
    return found;
  };

  const extract = async (target: ZipEntryInfo | string): Promise<Uint8Array> => {
    const entry = resolve(target);
    if (entry.isDirectory) return new Uint8Array(0);
    const lp = entry.offset;
    if (lp + 30 > bytes.length || view.getUint32(lp, true) !== SIG_LOCAL) {
      throw new Error(`Local header for “${entry.name}” is corrupt.`);
    }
    const nameLength = view.getUint16(lp + 26, true);
    const extraLength = view.getUint16(lp + 28, true);
    const start = lp + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > bytes.length) throw new Error(`Data for “${entry.name}” runs past the end of the file.`);
    const compressed = bytes.subarray(start, end);

    let data: Uint8Array;
    if (entry.method === 0) {
      data = compressed.slice();
    } else if (entry.method === 8) {
      data = await inflateRaw(compressed, entry.uncompressedSize);
    } else {
      throw new Error(`“${entry.name}” uses an unsupported compression method (${entry.method}).`);
    }
    return data;
  };

  return {
    entries,
    file: (name) => byName.get(normaliseName(name)),
    extract,
    extractText: async (target) => textDecoder.decode(await extract(target)),
  };
}

/* -------------------------------------------------------------------------- */
/* Inflate                                                                    */
/* -------------------------------------------------------------------------- */

export async function inflateRaw(data: Uint8Array, expectedSize?: number): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (typeof DS === 'function') {
    try {
      const stream = new DS('deflate-raw');
      const writer = stream.writable.getWriter();
      void writer.write(data as unknown as BufferSource).catch(() => undefined);
      void writer.close().catch(() => undefined);
      const reader = stream.readable.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(new Uint8Array(value));
          total += value.length;
        }
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    } catch {
      /* fall through to the JS decoder */
    }
  }
  return inflateRawSync(data, expectedSize);
}

/* A compact, allocation-light RFC 1951 decoder for engines without DecompressionStream. */

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODELEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  counts: Uint16Array;
  symbols: Uint16Array;
}

function buildHuffman(lengths: Uint8Array | number[], n: number): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < n; i++) counts[lengths[i]!]!++;
  counts[0] = 0;
  const offsets = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1]! + counts[i - 1]!;
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    if (lengths[i]! !== 0) symbols[offsets[lengths[i]!]!++] = i;
  }
  return { counts, symbols };
}

class BitReader {
  pos = 0;
  bitBuf = 0;
  bitCount = 0;
  constructor(private readonly data: Uint8Array) {}

  bits(count: number): number {
    while (this.bitCount < count) {
      if (this.pos >= this.data.length) throw new Error('Deflate stream ended unexpectedly.');
      this.bitBuf |= this.data[this.pos++]! << this.bitCount;
      this.bitCount += 8;
    }
    const value = this.bitBuf & ((1 << count) - 1);
    this.bitBuf >>>= count;
    this.bitCount -= count;
    return value;
  }

  decode(h: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= this.bits(1);
      const count = h.counts[len]!;
      if (code - count < first) return h.symbols[index + (code - first)]!;
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code in deflate stream.');
  }

  alignToByte(): void {
    this.bitBuf = 0;
    this.bitCount = 0;
  }
}

class OutputBuffer {
  buf: Uint8Array;
  length = 0;
  constructor(initial: number) {
    this.buf = new Uint8Array(Math.max(1024, initial));
  }
  ensure(extra: number): void {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  push(byte: number): void {
    this.ensure(1);
    this.buf[this.length++] = byte;
  }
  copyBack(distance: number, length: number): void {
    if (distance > this.length) throw new Error('Invalid back-reference in deflate stream.');
    this.ensure(length);
    let from = this.length - distance;
    for (let i = 0; i < length; i++) this.buf[this.length++] = this.buf[from++]!;
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

let fixedTables: { lit: Huffman; dist: Huffman } | null = null;
function getFixedTables(): { lit: Huffman; dist: Huffman } {
  if (fixedTables) return fixedTables;
  const lengths = new Uint8Array(288);
  for (let i = 0; i < 144; i++) lengths[i] = 8;
  for (let i = 144; i < 256; i++) lengths[i] = 9;
  for (let i = 256; i < 280; i++) lengths[i] = 7;
  for (let i = 280; i < 288; i++) lengths[i] = 8;
  const distLengths = new Uint8Array(30).fill(5);
  fixedTables = { lit: buildHuffman(lengths, 288), dist: buildHuffman(distLengths, 30) };
  return fixedTables;
}

function inflateBlock(reader: BitReader, out: OutputBuffer, lit: Huffman, dist: Huffman): void {
  while (true) {
    const symbol = reader.decode(lit);
    if (symbol < 256) {
      out.push(symbol);
    } else if (symbol === 256) {
      return;
    } else {
      const li = symbol - 257;
      if (li >= 29) throw new Error('Invalid length symbol in deflate stream.');
      const length = LENGTH_BASE[li]! + reader.bits(LENGTH_EXTRA[li]!);
      const di = reader.decode(dist);
      if (di >= 30) throw new Error('Invalid distance symbol in deflate stream.');
      const distance = DIST_BASE[di]! + reader.bits(DIST_EXTRA[di]!);
      out.copyBack(distance, length);
    }
  }
}

export function inflateRawSync(data: Uint8Array, expectedSize = data.length * 4): Uint8Array {
  const reader = new BitReader(data);
  const out = new OutputBuffer(expectedSize);
  let final: number;
  do {
    final = reader.bits(1);
    const type = reader.bits(2);
    if (type === 0) {
      reader.alignToByte();
      if (reader.pos + 4 > data.length) throw new Error('Deflate stored block is truncated.');
      const len = data[reader.pos]! | (data[reader.pos + 1]! << 8);
      const nlen = data[reader.pos + 2]! | (data[reader.pos + 3]! << 8);
      if ((len ^ 0xffff) !== nlen) throw new Error('Deflate stored block length check failed.');
      reader.pos += 4;
      if (reader.pos + len > data.length) throw new Error('Deflate stored block is truncated.');
      out.ensure(len);
      out.buf.set(data.subarray(reader.pos, reader.pos + len), out.length);
      out.length += len;
      reader.pos += len;
    } else if (type === 1) {
      const { lit, dist } = getFixedTables();
      inflateBlock(reader, out, lit, dist);
    } else if (type === 2) {
      const hlit = reader.bits(5) + 257;
      const hdist = reader.bits(5) + 1;
      const hclen = reader.bits(4) + 4;
      const codeLengths = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) codeLengths[CODELEN_ORDER[i]!] = reader.bits(3);
      const codeHuff = buildHuffman(codeLengths, 19);
      const lengths = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < hlit + hdist) {
        const sym = reader.decode(codeHuff);
        if (sym < 16) {
          lengths[i++] = sym;
        } else if (sym === 16) {
          if (i === 0) throw new Error('Invalid repeat in deflate code lengths.');
          const prev = lengths[i - 1]!;
          let repeat = 3 + reader.bits(2);
          while (repeat-- > 0) lengths[i++] = prev;
        } else if (sym === 17) {
          let repeat = 3 + reader.bits(3);
          while (repeat-- > 0) lengths[i++] = 0;
        } else {
          let repeat = 11 + reader.bits(7);
          while (repeat-- > 0) lengths[i++] = 0;
        }
      }
      const lit = buildHuffman(lengths.subarray(0, hlit), hlit);
      const dist = buildHuffman(lengths.subarray(hlit), hdist);
      inflateBlock(reader, out, lit, dist);
    } else {
      throw new Error('Invalid deflate block type.');
    }
  } while (!final);
  return out.result();
}
