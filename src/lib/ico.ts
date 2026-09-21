/**
 * ICO container writer (PNG-compressed entries, as supported by Windows
 * Vista+ and every browser) plus favicon manifest helpers.
 */

export interface IcoEntry {
  size: number;
  png: Uint8Array;
}

export function buildIco(entries: IcoEntry[]): Uint8Array {
  if (!entries.length) throw new Error('At least one image is required.');
  const sorted = [...entries].sort((a, b) => a.size - b.size);
  const headerSize = 6 + 16 * sorted.length;
  const total = headerSize + sorted.reduce((n, e) => n + e.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, sorted.length, true);
  let offset = headerSize;
  sorted.forEach((entry, i) => {
    const dir = 6 + i * 16;
    out[dir] = entry.size >= 256 ? 0 : entry.size;
    out[dir + 1] = entry.size >= 256 ? 0 : entry.size;
    out[dir + 2] = 0; // palette
    out[dir + 3] = 0; // reserved
    view.setUint16(dir + 4, 1, true); // planes
    view.setUint16(dir + 6, 32, true); // bpp
    view.setUint32(dir + 8, entry.png.length, true);
    view.setUint32(dir + 12, offset, true);
    out.set(entry.png, offset);
    offset += entry.png.length;
  });
  return out;
}

export const FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512] as const;

export interface FaviconSet {
  ico: number[];
  png: Array<{ size: number; name: string; purpose: string }>;
}

export const DEFAULT_FAVICON_SET: FaviconSet = {
  ico: [16, 32, 48],
  png: [
    { size: 16, name: 'favicon-16x16.png', purpose: 'Browser tab' },
    { size: 32, name: 'favicon-32x32.png', purpose: 'Browser tab (retina)' },
    { size: 180, name: 'apple-touch-icon.png', purpose: 'iOS home screen' },
    { size: 192, name: 'android-chrome-192x192.png', purpose: 'Android / PWA' },
    { size: 512, name: 'android-chrome-512x512.png', purpose: 'PWA splash' },
  ],
};

export function faviconHtmlSnippet(set: FaviconSet, themeColor = '#0b0b0f'): string {
  const lines = ['<link rel="icon" href="/favicon.ico" sizes="any">'];
  for (const p of set.png) {
    if (p.name === 'apple-touch-icon.png') lines.push(`<link rel="apple-touch-icon" sizes="${p.size}x${p.size}" href="/${p.name}">`);
    else if (p.size <= 64) lines.push(`<link rel="icon" type="image/png" sizes="${p.size}x${p.size}" href="/${p.name}">`);
  }
  lines.push('<link rel="manifest" href="/site.webmanifest">');
  lines.push(`<meta name="theme-color" content="${themeColor}">`);
  return lines.join('\n');
}

export function faviconManifest(set: FaviconSet, name = 'My App', themeColor = '#0b0b0f', backgroundColor = '#ffffff'): string {
  const icons = set.png.filter((p) => p.size >= 192).map((p) => ({ src: `/${p.name}`, sizes: `${p.size}x${p.size}`, type: 'image/png', purpose: 'any maskable' }));
  return JSON.stringify({ name, short_name: name, icons, theme_color: themeColor, background_color: backgroundColor, display: 'standalone' }, null, 2);
}
