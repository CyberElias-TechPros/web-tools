/**
 * Dominant-colour extraction (median cut + refinement) from RGBA pixel data,
 * plus export helpers for CSS, SCSS, Tailwind, JSON and Adobe .ase.
 */
import { formatColor, rgbToHex, type RGB } from './color';

export interface PaletteColor {
  color: RGB;
  hex: string;
  population: number;
  percent: number;
}

interface Bucket {
  pixels: Uint8Array[]; // each = [r,g,b]
}

function channelRange(pixels: Uint8Array[]): { channel: number; range: number } {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  for (const p of pixels) {
    for (let c = 0; c < 3; c++) {
      if (p[c]! < min[c]!) min[c] = p[c]!;
      if (p[c]! > max[c]!) max[c] = p[c]!;
    }
  }
  let channel = 0;
  let range = -1;
  for (let c = 0; c < 3; c++) {
    const r = max[c]! - min[c]!;
    if (r > range) {
      range = r;
      channel = c;
    }
  }
  return { channel, range };
}

export function extractPalette(data: Uint8ClampedArray | Uint8Array, count = 6, options: { ignoreTransparent?: boolean; ignoreNearWhite?: boolean; ignoreNearBlack?: boolean } = {}): PaletteColor[] {
  const pixels: Uint8Array[] = [];
  const step = Math.max(1, Math.floor(data.length / 4 / 60_000)); // sample at most ~60k pixels
  for (let i = 0; i < data.length; i += 4 * step) {
    const a = data[i + 3]!;
    if (options.ignoreTransparent !== false && a < 128) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (options.ignoreNearWhite && r > 245 && g > 245 && b > 245) continue;
    if (options.ignoreNearBlack && r < 10 && g < 10 && b < 10) continue;
    pixels.push(new Uint8Array([r, g, b]));
  }
  if (!pixels.length) return [];

  let buckets: Bucket[] = [{ pixels }];
  while (buckets.length < count) {
    buckets.sort((a, b) => channelRange(b.pixels).range * b.pixels.length - channelRange(a.pixels).range * a.pixels.length);
    const target = buckets.shift()!;
    if (target.pixels.length < 2) {
      buckets.push(target);
      break;
    }
    const { channel } = channelRange(target.pixels);
    target.pixels.sort((a, b) => a[channel]! - b[channel]!);
    const mid = Math.floor(target.pixels.length / 2);
    buckets.push({ pixels: target.pixels.slice(0, mid) }, { pixels: target.pixels.slice(mid) });
  }

  // Refine with a couple of k-means passes for cleaner centroids.
  let centroids = buckets.map((b) => average(b.pixels));
  for (let iter = 0; iter < 3; iter++) {
    const groups: Uint8Array[][] = centroids.map(() => []);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const cc = centroids[c]!;
        const d = (p[0]! - cc[0]) ** 2 + (p[1]! - cc[1]) ** 2 + (p[2]! - cc[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      groups[best]!.push(p);
    }
    centroids = groups.map((g, i) => (g.length ? average(g) : centroids[i]!));
    buckets = groups.map((g) => ({ pixels: g }));
  }

  const total = pixels.length;
  return buckets
    .map((b, i) => {
      const [r, g, bl] = centroids[i]!;
      const color: RGB = { r, g, b: bl, a: 1 };
      return { color, hex: rgbToHex(color), population: b.pixels.length, percent: (b.pixels.length / total) * 100 };
    })
    .filter((c) => c.population > 0)
    .sort((a, b) => b.population - a.population);
}

function average(pixels: Uint8Array[]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += p[0]!;
    g += p[1]!;
    b += p[2]!;
  }
  const n = Math.max(1, pixels.length);
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

export type PaletteExportFormat = 'css' | 'scss' | 'tailwind' | 'json' | 'text' | 'svg';

export function exportPalette(colors: PaletteColor[], format: PaletteExportFormat, prefix = 'color'): string {
  const names = colors.map((_, i) => `${prefix}-${i + 1}`);
  switch (format) {
    case 'css':
      return `:root {\n${colors.map((c, i) => `  --${names[i]}: ${c.hex};`).join('\n')}\n}`;
    case 'scss':
      return colors.map((c, i) => `$${names[i]}: ${c.hex};`).join('\n');
    case 'tailwind':
      return `colors: {\n${colors.map((c, i) => `  '${names[i]}': '${c.hex}',`).join('\n')}\n}`;
    case 'json':
      return JSON.stringify(
        colors.map((c, i) => ({ name: names[i], hex: c.hex, rgb: formatColor(c.color).rgb, hsl: formatColor(c.color).hsl, percent: Math.round(c.percent * 10) / 10 })),
        null,
        2,
      );
    case 'svg': {
      const w = 120;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * colors.length}" height="160" viewBox="0 0 ${w * colors.length} 160">${colors
        .map((c, i) => `<rect x="${i * w}" y="0" width="${w}" height="120" fill="${c.hex}"/><text x="${i * w + w / 2}" y="145" font-family="monospace" font-size="14" text-anchor="middle" fill="#111">${c.hex}</text>`)
        .join('')}</svg>`;
    }
    default:
      return colors.map((c) => c.hex).join('\n');
  }
}

/** Adobe Swatch Exchange (.ase) binary export. */
export function exportAse(colors: PaletteColor[], names?: string[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const enc = (s: string) => {
    const out = new Uint8Array((s.length + 1) * 2);
    const v = new DataView(out.buffer);
    for (let i = 0; i < s.length; i++) v.setUint16(i * 2, s.charCodeAt(i));
    return out;
  };
  colors.forEach((c, i) => {
    const name = enc(names?.[i] ?? c.hex.toUpperCase());
    const body = new Uint8Array(2 + name.length + 4 + 12 + 2);
    const v = new DataView(body.buffer);
    let o = 0;
    v.setUint16(o, name.length / 2);
    o += 2;
    body.set(name, o);
    o += name.length;
    body.set([0x52, 0x47, 0x42, 0x20], o); // "RGB "
    o += 4;
    v.setFloat32(o, c.color.r / 255);
    v.setFloat32(o + 4, c.color.g / 255);
    v.setFloat32(o + 8, c.color.b / 255);
    o += 12;
    v.setUint16(o, 0); // global
    const block = new Uint8Array(6 + body.length);
    const bv = new DataView(block.buffer);
    bv.setUint16(0, 0x0001);
    bv.setUint32(2, body.length);
    block.set(body, 6);
    chunks.push(block);
  });
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(12 + total);
  const v = new DataView(out.buffer);
  out.set([0x41, 0x53, 0x45, 0x46]); // ASEF
  v.setUint16(4, 1);
  v.setUint16(6, 0);
  v.setUint32(8, chunks.length);
  let o = 12;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
