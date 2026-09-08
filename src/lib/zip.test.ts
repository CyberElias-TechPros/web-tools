import { describe, expect, it } from 'vitest';
import { crc32, createZip, sanitizeZipPath } from '@/lib/zip';
import { computeTargetSize, defaultCompressOptions, extensionForType, formatBytes, resolveOutputType, savingsPercent } from '@/lib/image';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('crc32', () => {
  it('matches the reference value for the standard test vector', () => {
    // CRC-32 of "123456789" is 0xCBF43926.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('returns 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('matches the reference value for "The quick brown fox jumps over the lazy dog"', () => {
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('always returns an unsigned 32-bit integer', () => {
    for (const text of ['a', 'abc', 'x'.repeat(1000)]) {
      const value = crc32(bytes(text));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('sanitizeZipPath', () => {
  it('leaves a normal name unchanged', () => {
    expect(sanitizeZipPath('a/b/c.txt')).toBe('a/b/c.txt');
  });
  it('strips leading slashes so the path is never absolute', () => {
    expect(sanitizeZipPath('/etc/passwd')).toBe('etc/passwd');
  });
  it('removes traversal segments', () => {
    expect(sanitizeZipPath('../../secret.txt')).toBe('secret.txt');
    expect(sanitizeZipPath('a/../../b.txt')).toBe('a/b.txt');
  });
  it('normalises backslashes', () => {
    expect(sanitizeZipPath('a\\b.txt')).toBe('a/b.txt');
  });
  it('never returns an empty name', () => {
    expect(sanitizeZipPath('../..')).toBe('file');
  });
});

describe('createZip', () => {
  it('rejects an empty archive', async () => {
    await expect(createZip([])).rejects.toThrow(/empty/i);
  });

  it('produces a blob with the ZIP magic number', async () => {
    const zip = await createZip([{ name: 'a.txt', data: bytes('hello') }]);
    const header = new Uint8Array(await zip.slice(0, 4).arrayBuffer());
    expect(Array.from(header)).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('sets the correct MIME type', async () => {
    const zip = await createZip([{ name: 'a.txt', data: bytes('x') }]);
    expect(zip.type).toBe('application/zip');
  });

  it('ends with an end-of-central-directory record', async () => {
    const zip = await createZip([{ name: 'a.txt', data: bytes('hello world') }]);
    const buffer = new Uint8Array(await zip.arrayBuffer());
    const tail = buffer.slice(buffer.length - 22, buffer.length - 18);
    expect(Array.from(tail)).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it('records the number of entries in the central directory', async () => {
    const zip = await createZip([
      { name: 'a.txt', data: bytes('a') },
      { name: 'b.txt', data: bytes('b') },
      { name: 'c.txt', data: bytes('c') },
    ]);
    const buffer = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(buffer.buffer);
    const eocd = buffer.length - 22;
    expect(view.getUint16(eocd + 10, true)).toBe(3);
  });

  it('stores the filename in the local header', async () => {
    const zip = await createZip([{ name: 'readme.md', data: bytes('x') }]);
    const text = new TextDecoder().decode(new Uint8Array(await zip.arrayBuffer()));
    expect(text).toContain('readme.md');
  });

  it('sets the UTF-8 filename flag', async () => {
    const zip = await createZip([{ name: 'café.txt', data: bytes('x') }]);
    const view = new DataView(await zip.arrayBuffer());
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it('sanitises hostile entry names', async () => {
    const zip = await createZip([{ name: '../../evil.sh', data: bytes('x') }]);
    const text = new TextDecoder().decode(new Uint8Array(await zip.arrayBuffer()));
    expect(text).not.toContain('../');
    expect(text).toContain('evil.sh');
  });

  it('rejects archives above the entry limit', async () => {
    const many = Array.from({ length: 65536 }, (_, i) => ({
      name: `f${i}`,
      data: new Uint8Array(0),
    }));
    await expect(createZip(many)).rejects.toThrow(/at most/i);
  });

  it('stores small entries uncompressed and records a correct CRC', async () => {
    const payload = bytes('tiny');
    const zip = await createZip([{ name: 'a.txt', data: payload }]);
    const view = new DataView(await zip.arrayBuffer());
    expect(view.getUint16(8, true)).toBe(0); // method 0 = stored
    expect(view.getUint32(14, true)).toBe(crc32(payload));
    expect(view.getUint32(22, true)).toBe(payload.length); // uncompressed size
  });

  it('grows roughly linearly with content', async () => {
    const small = await createZip([{ name: 'a', data: new Uint8Array(100) }]);
    const large = await createZip([{ name: 'a', data: new Uint8Array(10000) }]);
    expect(large.size).toBeGreaterThan(small.size);
  });
});

describe('computeTargetSize', () => {
  const natural = { width: 4000, height: 3000 };

  it('returns the original size in none mode', () => {
    expect(computeTargetSize(natural, { ...defaultCompressOptions, resizeMode: 'none' })).toEqual(natural);
  });

  it('scales the longest side', () => {
    const result = computeTargetSize(natural, {
      ...defaultCompressOptions,
      resizeMode: 'max-dimension',
      maxWidth: 2000,
      maxHeight: 2000,
    });
    expect(result).toEqual({ width: 2000, height: 1500 });
  });

  it('leaves images already under the limit alone', () => {
    const small = { width: 800, height: 600 };
    expect(
      computeTargetSize(small, { ...defaultCompressOptions, resizeMode: 'max-dimension', maxWidth: 1920, maxHeight: 1920 }),
    ).toEqual(small);
  });

  it('preserves the aspect ratio for an exact width', () => {
    const result = computeTargetSize(natural, {
      ...defaultCompressOptions,
      resizeMode: 'exact-width',
      maxWidth: 800,
      preventUpscale: false,
    });
    expect(result).toEqual({ width: 800, height: 600 });
  });

  it('fits inside a bounding box', () => {
    const result = computeTargetSize(natural, {
      ...defaultCompressOptions,
      resizeMode: 'fit',
      maxWidth: 1000,
      maxHeight: 1000,
    });
    expect(result.width).toBeLessThanOrEqual(1000);
    expect(result.height).toBeLessThanOrEqual(1000);
  });

  it('scales by percentage', () => {
    const result = computeTargetSize(natural, {
      ...defaultCompressOptions,
      resizeMode: 'percentage',
      percentage: 50,
    });
    expect(result).toEqual({ width: 2000, height: 1500 });
  });

  it('refuses to upscale when told not to', () => {
    const small = { width: 100, height: 100 };
    const result = computeTargetSize(small, {
      ...defaultCompressOptions,
      resizeMode: 'percentage',
      percentage: 400,
      preventUpscale: true,
    });
    expect(result).toEqual(small);
  });

  it('never returns a zero dimension', () => {
    const result = computeTargetSize({ width: 3, height: 1 }, {
      ...defaultCompressOptions,
      resizeMode: 'percentage',
      percentage: 5,
    });
    expect(result.width).toBeGreaterThanOrEqual(1);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveOutputType', () => {
  it('honours an explicit format', () => {
    expect(resolveOutputType('image/png', 'image/webp')).toBe('image/webp');
  });
  it('keeps re-encodable originals', () => {
    expect(resolveOutputType('image/jpeg', 'original')).toBe('image/jpeg');
  });
  it('falls back to PNG for formats a canvas cannot emit', () => {
    expect(resolveOutputType('image/svg+xml', 'original')).toBe('image/png');
    expect(resolveOutputType('image/gif', 'original')).toBe('image/png');
  });
});

describe('extensionForType', () => {
  it('maps MIME types to sensible extensions', () => {
    expect(extensionForType('image/jpeg')).toBe('jpg');
    expect(extensionForType('image/webp')).toBe('webp');
    expect(extensionForType('image/png')).toBe('png');
  });
});

describe('formatBytes', () => {
  it('formats each unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
  it('handles invalid values gracefully', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('savingsPercent', () => {
  it('computes a positive saving', () => {
    expect(savingsPercent(1000, 250)).toBe(75);
  });
  it('reports a negative saving when the output grew', () => {
    expect(savingsPercent(100, 150)).toBe(-50);
  });
  it('handles a zero input safely', () => {
    expect(savingsPercent(0, 10)).toBe(0);
  });
});
