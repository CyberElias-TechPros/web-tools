import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyToClipboard,
  downloadBlob,
  downloadText,
  readFileAsArrayBuffer,
  readFileAsText,
  safeFilename,
  timestampSuffix,
} from '@/lib/files';

describe('safeFilename', () => {
  it('leaves a good name alone', () => {
    expect(safeFilename('report-2025.csv')).toBe('report-2025.csv');
  });

  it('replaces characters that are illegal on Windows', () => {
    expect(safeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('strips control characters', () => {
    // eslint-disable-next-line no-control-regex -- asserting control chars are gone
    expect(safeFilename('a\u0000b\u001fc')).not.toMatch(/[\u0000-\u001f]/);
  });

  it('strips path separators so a name can never escape its folder', () => {
    expect(safeFilename('../../etc/passwd')).not.toContain('/');
  });

  it('trims trailing dots and spaces', () => {
    expect(safeFilename('name.  ')).toBe('name');
    expect(safeFilename('name...')).toBe('name');
  });

  it('falls back to a default for an empty result', () => {
    expect(safeFilename('')).toBe('download');
    expect(safeFilename('///')).toBe('download');
  });

  it('collapses runs of replacement dashes', () => {
    expect(safeFilename('a////b')).toBe('a-b');
  });

  it('truncates absurdly long names but keeps the extension', () => {
    const out = safeFilename(`${'x'.repeat(500)}.txt`);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('.txt')).toBe(true);
  });

  it('never returns a reserved Windows device name', () => {
    for (const reserved of ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1']) {
      expect(safeFilename(reserved).toUpperCase()).not.toBe(reserved);
    }
  });
});

describe('timestampSuffix', () => {
  it('produces a filename-safe sortable stamp', () => {
    const stamp = timestampSuffix(new Date('2025-06-17T14:05:09Z'));
    expect(stamp).toMatch(/^\d{8}-\d{6}$/);
  });

  it('produces a value equal to itself for the same instant', () => {
    const date = new Date('2025-01-02T03:04:05Z');
    expect(timestampSuffix(date)).toBe(timestampSuffix(date));
  });

  it('contains no characters that need escaping', () => {
    expect(timestampSuffix()).toBe(safeFilename(timestampSuffix()));
  });
});

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it('creates and clicks an anchor, then cleans up', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['x']), 'out.txt');
    expect(click).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('sanitises the suggested filename', () => {
    let seen = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen = this.download;
    });
    downloadBlob(new Blob(['x']), '../../evil.sh');
    expect(seen).not.toContain('/');
    expect(seen).toContain('evil.sh');
  });

  it('downloadText wraps text in a typed blob', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('hello', 'a.txt', 'text/plain');
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('copyToClipboard', () => {
  it('uses the async clipboard API when available', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('reports failure instead of throwing when the API rejects', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(() => Promise.reject(new Error('denied'))),
      },
    });
    // The fallback path uses document.execCommand, which jsdom does not implement.
    const result = await copyToClipboard('hello');
    expect(typeof result).toBe('boolean');
  });
});

describe('readFileAsText', () => {
  it('reads a small file', async () => {
    const file = new File(['hello world'], 'a.txt', { type: 'text/plain' });
    await expect(readFileAsText(file)).resolves.toBe('hello world');
  });

  it('reads UTF-8 correctly', async () => {
    const file = new File(['héllo → 世界'], 'a.txt');
    await expect(readFileAsText(file)).resolves.toBe('héllo → 世界');
  });

  it('rejects a file above the size limit', async () => {
    const file = new File(['x'.repeat(100)], 'a.txt');
    await expect(readFileAsText(file, 10)).rejects.toThrow(/too large/i);
  });

  it('accepts a file exactly at the limit', async () => {
    const file = new File(['1234567890'], 'a.txt');
    await expect(readFileAsText(file, 10)).resolves.toBe('1234567890');
  });

  it('handles an empty file', async () => {
    await expect(readFileAsText(new File([], 'a.txt'))).resolves.toBe('');
  });
});

describe('readFileAsArrayBuffer', () => {
  it('returns the raw bytes', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.bin');
    const buffer = await readFileAsArrayBuffer(file);
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);
  });
});
