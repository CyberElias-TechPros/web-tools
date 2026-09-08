/**
 * Minimal ZIP writer (APPNOTE 6.3.x, local file header + central directory).
 *
 * Written by hand rather than pulled from npm for three reasons: the archive
 * format we need is tiny, it avoids shipping ~100 KB of JS for one button, and
 * it lets us use the browser's native `CompressionStream('deflate-raw')` so
 * compression happens in optimised native code instead of userland JS.
 *
 * Zip64 is intentionally not implemented — the writer refuses archives above
 * the 4 GiB / 65,535-entry limits instead of producing a corrupt file.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ data[i]!) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** Modification time; defaults to now. */
  date?: Date;
}

const MAX_ENTRIES = 65535;
const MAX_SIZE = 0xffffffff;

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((date.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
}

/** Sanitise an entry path: no absolute paths, no traversal, no backslashes. */
export function sanitizeZipPath(name: string): string {
  const normalised = name
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');
  return normalised || 'file';
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (typeof CS !== 'function') return null;
  try {
    const stream = new CS('deflate-raw');
    const writer = stream.writable.getWriter();
    void writer.write(data as unknown as BufferSource);
    void writer.close();
    const chunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(new Uint8Array(value));
    }
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  } catch {
    return null;
  }
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, value, true);
    this.push(b);
  }

  u32(value: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, value >>> 0, true);
    this.push(b);
  }

  toBlob(type: string): Blob {
    return new Blob(this.parts as BlobPart[], { type });
  }
}

/**
 * Build a ZIP archive. Entries are deflated when the platform supports it and
 * stored otherwise; per-entry the smaller of the two is used.
 */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error('Cannot create an empty archive.');
  if (entries.length > MAX_ENTRIES)
    throw new Error(
      `A ZIP archive without Zip64 support can hold at most ${MAX_ENTRIES.toLocaleString()} files.`,
    );

  const encoder = new TextEncoder();
  const writer = new ByteWriter();
  const central: Array<{
    nameBytes: Uint8Array;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
    offset: number;
    method: number;
    time: number;
    date: number;
  }> = [];

  let totalUncompressed = 0;

  for (const entry of entries) {
    const name = sanitizeZipPath(entry.name);
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > 0xffff) throw new Error(`Filename too long: ${name}`);

    const raw = entry.data;
    totalUncompressed += raw.length;
    if (totalUncompressed > MAX_SIZE)
      throw new Error(
        'This archive would exceed the 4 GB ZIP limit. Download the files in smaller batches.',
      );

    const crc = crc32(raw);
    const deflated = raw.length > 64 ? await deflateRaw(raw) : null;
    const useDeflate = deflated !== null && deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const { time, date } = dosDateTime(entry.date ?? new Date());
    const offset = writer.length;

    // Local file header
    writer.u32(0x04034b50);
    writer.u16(20); // version needed
    writer.u16(0x0800); // UTF-8 filename flag
    writer.u16(method);
    writer.u16(time);
    writer.u16(date);
    writer.u32(crc);
    writer.u32(payload.length);
    writer.u32(raw.length);
    writer.u16(nameBytes.length);
    writer.u16(0); // extra field length
    writer.push(nameBytes);
    writer.push(payload);

    central.push({
      nameBytes,
      crc,
      compressedSize: payload.length,
      uncompressedSize: raw.length,
      offset,
      method,
      time,
      date,
    });
  }

  const centralStart = writer.length;
  for (const item of central) {
    writer.u32(0x02014b50);
    writer.u16(0x031e); // version made by: UNIX, spec 3.0
    writer.u16(20);
    writer.u16(0x0800);
    writer.u16(item.method);
    writer.u16(item.time);
    writer.u16(item.date);
    writer.u32(item.crc);
    writer.u32(item.compressedSize);
    writer.u32(item.uncompressedSize);
    writer.u16(item.nameBytes.length);
    writer.u16(0); // extra
    writer.u16(0); // comment
    writer.u16(0); // disk number
    writer.u16(0); // internal attrs
    writer.u32(0o644 << 16); // external attrs: regular file, rw-r--r--
    writer.u32(item.offset);
    writer.push(item.nameBytes);
  }
  const centralSize = writer.length - centralStart;

  // End of central directory
  writer.u32(0x06054b50);
  writer.u16(0);
  writer.u16(0);
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralStart);
  writer.u16(0);

  return writer.toBlob('application/zip');
}
