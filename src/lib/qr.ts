/**
 * QR code generation built on `uqr` (matrix encoder) with our own SVG
 * renderer supporting rounded modules, colours, quiet zone and payload
 * helpers (Wi-Fi, vCard, email, SMS, geo, calendar).
 */
import { encode } from 'uqr';

export type QrEcc = 'L' | 'M' | 'Q' | 'H';
export type QrModuleStyle = 'square' | 'rounded' | 'dots';

export interface QrRenderOptions {
  ecc: QrEcc;
  size: number;
  margin: number;
  dark: string;
  light: string;
  transparent: boolean;
  style: QrModuleStyle;
}

export const defaultQrOptions: QrRenderOptions = { ecc: 'M', size: 512, margin: 2, dark: '#0b0b0f', light: '#ffffff', transparent: false, style: 'square' };

export interface QrMatrix {
  size: number;
  version: number;
  modules: boolean[][];
}

export function generateQrMatrix(data: string, ecc: QrEcc = 'M'): QrMatrix {
  if (!data) throw new Error('Enter some text or a URL to encode.');
  const bytes = new TextEncoder().encode(data);
  if (bytes.length > 2953) throw new Error(`Too much data (${bytes.length} bytes). A QR code holds at most 2,953 bytes.`);
  const result = encode(data, { ecc, border: 0 });
  return { size: result.size, version: result.version, modules: result.data };
}

function isFinder(x: number, y: number, size: number): boolean {
  const inBox = (bx: number, by: number) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
  return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7);
}

export function renderQrSvg(matrix: QrMatrix, options: Partial<QrRenderOptions> = {}): string {
  const opts = { ...defaultQrOptions, ...options };
  const { size, modules } = matrix;
  const total = size + opts.margin * 2;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${opts.size}" height="${opts.size}" shape-rendering="${opts.style === 'square' ? 'crispEdges' : 'geometricPrecision'}">`);
  if (!opts.transparent) parts.push(`<rect width="${total}" height="${total}" fill="${opts.light}"/>`);

  // Finder patterns drawn as shapes so rounded styles still scan well.
  const finders: string[] = [];
  const drawFinder = (fx: number, fy: number) => {
    const x = fx + opts.margin;
    const y = fy + opts.margin;
    const r = opts.style === 'square' ? 0 : opts.style === 'rounded' ? 1.6 : 2.4;
    finders.push(`<rect x="${x}" y="${y}" width="7" height="7" rx="${r}" fill="${opts.dark}"/>`);
    finders.push(`<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${r * 0.7}" fill="${opts.transparent ? 'white' : opts.light}"/>`);
    finders.push(`<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${r * 0.45}" fill="${opts.dark}"/>`);
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  let path = '';
  const dots: string[] = [];
  for (let y = 0; y < size; y++) {
    const row = modules[y]!;
    for (let x = 0; x < size; x++) {
      if (!row[x] || isFinder(x, y, size)) continue;
      const px = x + opts.margin;
      const py = y + opts.margin;
      if (opts.style === 'square') path += `M${px} ${py}h1v1h-1z`;
      else if (opts.style === 'dots') dots.push(`<circle cx="${px + 0.5}" cy="${py + 0.5}" r="0.42" fill="${opts.dark}"/>`);
      else dots.push(`<rect x="${px + 0.04}" y="${py + 0.04}" width="0.92" height="0.92" rx="0.3" fill="${opts.dark}"/>`);
    }
  }
  if (path) parts.push(`<path d="${path}" fill="${opts.dark}"/>`);
  parts.push(...dots, ...finders);
  parts.push('</svg>');
  return parts.join('');
}

export function renderQrAscii(matrix: QrMatrix): string {
  const lines: string[] = [];
  for (let y = 0; y < matrix.size; y += 2) {
    let line = '';
    for (let x = 0; x < matrix.size; x++) {
      const top = matrix.modules[y]![x]!;
      const bottom = y + 1 < matrix.size ? matrix.modules[y + 1]![x]! : false;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Draw the matrix on a canvas and return a PNG blob. */
export async function renderQrPng(matrix: QrMatrix, options: Partial<QrRenderOptions> = {}): Promise<Blob> {
  const opts = { ...defaultQrOptions, ...options };
  const svg = renderQrSvg(matrix, opts);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not rasterise the QR code.'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = opts.size;
    canvas.height = opts.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0, opts.size, opts.size);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* -------------------------------------------------------------------------- */
/* Payload builders                                                           */
/* -------------------------------------------------------------------------- */

const escapeWifi = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

export function wifiPayload(input: { ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean }): string {
  const parts = [`WIFI:T:${input.security};`, `S:${escapeWifi(input.ssid)};`];
  if (input.security !== 'nopass' && input.password) parts.push(`P:${escapeWifi(input.password)};`);
  if (input.hidden) parts.push('H:true;');
  return `${parts.join('')};`;
}

export function vcardPayload(input: { firstName: string; lastName: string; organization?: string; title?: string; phone?: string; email?: string; url?: string; address?: string; note?: string }): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(input.lastName)};${esc(input.firstName)};;;`, `FN:${esc(`${input.firstName} ${input.lastName}`.trim())}`];
  if (input.organization) lines.push(`ORG:${esc(input.organization)}`);
  if (input.title) lines.push(`TITLE:${esc(input.title)}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL:${input.phone.replace(/\s+/g, '')}`);
  if (input.email) lines.push(`EMAIL:${input.email}`);
  if (input.url) lines.push(`URL:${input.url}`);
  if (input.address) lines.push(`ADR;TYPE=WORK:;;${esc(input.address)};;;;`);
  if (input.note) lines.push(`NOTE:${esc(input.note)}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export function emailPayload(input: { to: string; subject?: string; body?: string }): string {
  const params = new URLSearchParams();
  if (input.subject) params.set('subject', input.subject);
  if (input.body) params.set('body', input.body);
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${input.to}${qs ? `?${qs}` : ''}`;
}

export function smsPayload(input: { phone: string; message?: string }): string {
  return `SMSTO:${input.phone.replace(/\s+/g, '')}:${input.message ?? ''}`;
}

export function geoPayload(input: { latitude: number; longitude: number }): string {
  return `geo:${input.latitude},${input.longitude}`;
}

export function eventPayload(input: { title: string; start: string; end?: string; location?: string; description?: string }): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error('Event dates must be valid.');
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  const lines = ['BEGIN:VEVENT', `SUMMARY:${input.title}`, `DTSTART:${fmt(input.start)}`];
  if (input.end) lines.push(`DTEND:${fmt(input.end)}`);
  if (input.location) lines.push(`LOCATION:${input.location}`);
  if (input.description) lines.push(`DESCRIPTION:${input.description}`);
  lines.push('END:VEVENT');
  return lines.join('\n');
}

export const QR_CAPACITY: Record<QrEcc, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };
