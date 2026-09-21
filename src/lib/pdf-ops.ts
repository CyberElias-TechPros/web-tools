/**
 * PDF manipulation on top of pdf-lib: merge, split, reorder, rotate, stamp,
 * number, re-save and image→PDF. Everything here is pure and DOM-free.
 */

import { PDFDocument, PageSizes, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { hexToRgb, toWinAnsi } from '@/lib/pdf-doc';

export type PdfInput = ArrayBuffer | Uint8Array;

function toBytes(input: PdfInput): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export async function loadPdf(input: PdfInput): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(toBytes(input), { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/encrypted/i.test(message)) throw new Error('This PDF is encrypted and cannot be edited without its password.', { cause: e });
    throw new Error(`This file could not be read as a PDF (${message.split('\n')[0]}).`, { cause: e });
  }
}

export async function pageCountOf(input: PdfInput): Promise<number> {
  const pdf = await loadPdf(input);
  return pdf.getPageCount();
}

/* -------------------------------------------------------------------------- */
/* Page ranges                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parse "1-3, 5, 8-" into zero-based page indices, clamped to `pageCount`.
 * Accepts "all", "even", "odd", "last" and open-ended ranges; rejects garbage
 * with a message worth showing.
 */
export function parsePageRanges(spec: string, pageCount: number): number[] {
  const text = spec.trim().toLowerCase();
  if (!text || text === 'all') return Array.from({ length: pageCount }, (_, i) => i);
  const out: number[] = [];
  for (const rawPart of text.split(/[,;\s]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    if (part === 'even') {
      for (let i = 1; i < pageCount; i += 2) out.push(i);
      continue;
    }
    if (part === 'odd') {
      for (let i = 0; i < pageCount; i += 2) out.push(i);
      continue;
    }
    if (part === 'last') {
      out.push(pageCount - 1);
      continue;
    }
    const m = /^(\d+|last)?\s*(?:(-|–|—|\.\.)\s*(\d+|last)?)?$/.exec(part);
    if (!m || (!m[1] && !m[2])) throw new Error(`“${rawPart}” is not a valid page or range. Use forms like 1-3, 5, 8- or last.`);
    const parse = (v: string | undefined, fallback: number): number => (v === undefined ? fallback : v === 'last' ? pageCount : Number(v));
    const start = parse(m[1], 1);
    const end = m[2] ? parse(m[3], pageCount) : start;
    if (start < 1 || end < 1) throw new Error('Page numbers start at 1.');
    if (start > pageCount) throw new Error(`Page ${start} does not exist — the document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
    const lo = Math.min(start, end);
    const hi = Math.min(pageCount, Math.max(start, end));
    if (start <= end) for (let i = lo; i <= hi; i++) out.push(i - 1);
    else for (let i = hi; i >= lo; i--) out.push(i - 1);
  }
  if (!out.length) throw new Error('No pages selected.');
  return out;
}

/** Group consecutive indices for display: [0,1,2,4] → "1-3, 5". */
export function describeIndices(indices: number[]): string {
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(j > i ? `${sorted[i]! + 1}-${sorted[j]! + 1}` : String(sorted[i]! + 1));
    i = j + 1;
  }
  return parts.join(', ');
}

/* -------------------------------------------------------------------------- */
/* Merge / split / organise                                                   */
/* -------------------------------------------------------------------------- */

export interface MergeSource {
  data: PdfInput;
  /** Zero-based page indices to include; omit for all pages. */
  pages?: number[];
  name?: string;
}

export interface SaveOptions {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
}

function applyMeta(pdf: PDFDocument, meta: SaveOptions | undefined): void {
  if (meta?.title) pdf.setTitle(meta.title);
  if (meta?.author) pdf.setAuthor(meta.author);
  if (meta?.subject) pdf.setSubject(meta.subject);
  if (meta?.keywords?.length) pdf.setKeywords(meta.keywords);
  pdf.setProducer('Web Tools (pdf-lib)');
  pdf.setModificationDate(new Date());
}

export async function mergePdfs(
  sources: MergeSource[],
  options: SaveOptions & { onProgress?: (done: number, total: number) => void } = {},
): Promise<Uint8Array> {
  if (!sources.length) throw new Error('Add at least one PDF to merge.');
  const out = await PDFDocument.create();
  let index = 0;
  for (const source of sources) {
    const src = await loadPdf(source.data);
    const indices = source.pages ?? src.getPageIndices();
    const invalid = indices.find((i) => i < 0 || i >= src.getPageCount());
    if (invalid !== undefined) throw new Error(`${source.name ?? 'A document'} has no page ${invalid + 1}.`);
    const copied = await out.copyPages(src, indices);
    for (const page of copied) out.addPage(page);
    options.onProgress?.(++index, sources.length);
  }
  applyMeta(out, options);
  if (!options.title && sources.length === 1 && sources[0]?.name) out.setTitle(sources[0].name.replace(/\.pdf$/i, ''));
  out.setCreator('Web Tools — PDF merge');
  return out.save({ useObjectStreams: true });
}

/** Extract a subset of pages (in the given order) into a new document. */
export async function extractPages(input: PdfInput, indices: number[], meta?: SaveOptions): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  applyMeta(out, meta);
  return out.save({ useObjectStreams: true });
}

export type SplitMode = 'every-page' | 'every-n' | 'ranges' | 'extract';

export interface SplitPart {
  name: string;
  indices: number[];
  bytes: Uint8Array;
}

export async function splitPdf(
  input: PdfInput,
  options: { mode: SplitMode; n?: number; ranges?: string; baseName?: string; onProgress?: (done: number, total: number) => void },
): Promise<SplitPart[]> {
  const src = await loadPdf(input);
  const count = src.getPageCount();
  const base = (options.baseName ?? 'document').replace(/\.pdf$/i, '');
  let groups: number[][] = [];
  switch (options.mode) {
    case 'every-page':
      groups = Array.from({ length: count }, (_, i) => [i]);
      break;
    case 'every-n': {
      const n = Math.max(1, Math.floor(options.n ?? 1));
      for (let i = 0; i < count; i += n) groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
      break;
    }
    case 'ranges': {
      const spec = options.ranges?.trim() ?? '';
      if (!spec) throw new Error('Enter at least one page range, e.g. 1-3, 4-6.');
      groups = spec.split(/[,;]+/).map((part) => parsePageRanges(part, count));
      break;
    }
    case 'extract':
      groups = [parsePageRanges(options.ranges ?? 'all', count)];
      break;
  }
  const parts: SplitPart[] = [];
  const pad = String(groups.length).length;
  for (let g = 0; g < groups.length; g++) {
    const indices = groups[g]!;
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    for (const page of copied) out.addPage(page);
    applyMeta(out, {});
    const label =
      options.mode === 'every-page'
        ? `page-${String(indices[0]! + 1).padStart(String(count).length, '0')}`
        : options.mode === 'extract'
          ? `pages-${describeIndices(indices).replace(/,\s*/g, '_')}`
          : `part-${String(g + 1).padStart(pad, '0')}`;
    parts.push({ name: `${base}-${label}.pdf`, indices, bytes: await out.save({ useObjectStreams: true }) });
    options.onProgress?.(g + 1, groups.length);
  }
  return parts;
}

export interface PageEdit {
  /** Zero-based source index. */
  source: number;
  /** Additional rotation in degrees (multiple of 90). */
  rotate: number;
}

/** Rebuild a document from an ordered list of source pages with rotations. */
export async function organisePdf(input: PdfInput, edits: PageEdit[], meta?: SaveOptions): Promise<Uint8Array> {
  if (!edits.length) throw new Error('Keep at least one page.');
  const src = await loadPdf(input);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    edits.map((e) => e.source),
  );
  copied.forEach((page, i) => {
    const extra = ((edits[i]!.rotate % 360) + 360) % 360;
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    out.addPage(page);
  });
  applyMeta(out, meta);
  return out.save({ useObjectStreams: true });
}

export async function rotatePdf(input: PdfInput, angle: number, pages?: number[]): Promise<Uint8Array> {
  const pdf = await loadPdf(input);
  const targets = pages ?? pdf.getPageIndices();
  for (const index of targets) {
    const page = pdf.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + angle + 360) % 360));
  }
  applyMeta(pdf, {});
  return pdf.save({ useObjectStreams: true });
}

/* -------------------------------------------------------------------------- */
/* Stamps: watermark & page numbers                                           */
/* -------------------------------------------------------------------------- */

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  /** Degrees, counter-clockwise. */
  rotation: number;
  position: 'center' | 'tile' | 'top' | 'bottom';
  font: 'sans' | 'serif' | 'mono';
  bold: boolean;
  pages?: number[];
}

export const defaultWatermarkOptions: WatermarkOptions = {
  text: 'CONFIDENTIAL',
  fontSize: 56,
  color: 'FF0000',
  opacity: 0.18,
  rotation: 35,
  position: 'center',
  font: 'sans',
  bold: true,
};

async function stampFont(pdf: PDFDocument, family: 'sans' | 'serif' | 'mono', bold: boolean): Promise<PDFFont> {
  const name =
    family === 'serif'
      ? bold
        ? StandardFonts.TimesRomanBold
        : StandardFonts.TimesRoman
      : family === 'mono'
        ? bold
          ? StandardFonts.CourierBold
          : StandardFonts.Courier
        : bold
          ? StandardFonts.HelveticaBold
          : StandardFonts.Helvetica;
  return pdf.embedFont(name);
}

/** Effective visible size of a page, accounting for its /Rotate entry. */
function visibleSize(page: PDFPage): { width: number; height: number; rotated: boolean } {
  const { width, height } = page.getSize();
  const rotated = page.getRotation().angle % 180 !== 0;
  return rotated ? { width: height, height: width, rotated } : { width, height, rotated };
}

export async function watermarkPdf(input: PdfInput, partial: Partial<WatermarkOptions> = {}): Promise<Uint8Array> {
  const options = { ...defaultWatermarkOptions, ...partial };
  const text = toWinAnsi(options.text).trim();
  if (!text) throw new Error('Enter watermark text.');
  const pdf = await loadPdf(input);
  const font = await stampFont(pdf, options.font, options.bold);
  const color = hexToRgb(options.color);
  const targets = options.pages ?? pdf.getPageIndices();
  for (const index of targets) {
    const page = pdf.getPage(index);
    const { width, height } = page.getSize();
    const size = options.fontSize;
    const textWidth = font.widthOfTextAtSize(text, size);
    const draw = (cx: number, cy: number): void => {
      const rad = (options.rotation * Math.PI) / 180;
      // Offset so the text is centred on (cx, cy) after rotation.
      const x = cx - (textWidth / 2) * Math.cos(rad) + (size / 2) * Math.sin(rad) * 0.7;
      const y = cy - (textWidth / 2) * Math.sin(rad) - (size / 2) * Math.cos(rad) * 0.7;
      page.drawText(text, { x, y, size, font, color, opacity: options.opacity, rotate: degrees(options.rotation) });
    };
    if (options.position === 'tile') {
      const stepX = Math.max(textWidth + 60, 140);
      const stepY = Math.max(size * 3, 120);
      for (let y = stepY / 2; y < height + stepY; y += stepY) {
        for (let x = -stepX / 2; x < width + stepX; x += stepX) draw(x + ((y / stepY) % 2) * (stepX / 2), y);
      }
    } else if (options.position === 'top') {
      draw(width / 2, height - size);
    } else if (options.position === 'bottom') {
      draw(width / 2, size);
    } else {
      draw(width / 2, height / 2);
    }
  }
  applyMeta(pdf, {});
  return pdf.save({ useObjectStreams: true });
}

export interface PageNumberOptions {
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  /** Template: {n} page number, {total} page count. */
  format: string;
  fontSize: number;
  color: string;
  margin: number;
  start: number;
  font: 'sans' | 'serif' | 'mono';
  /** Skip numbering on the first N pages (cover pages). */
  skipFirst: number;
}

export const defaultPageNumberOptions: PageNumberOptions = {
  position: 'bottom-center',
  format: 'Page {n} of {total}',
  fontSize: 10,
  color: '444444',
  margin: 28,
  start: 1,
  font: 'sans',
  skipFirst: 0,
};

export async function numberPdfPages(input: PdfInput, partial: Partial<PageNumberOptions> = {}): Promise<Uint8Array> {
  const options = { ...defaultPageNumberOptions, ...partial };
  const pdf = await loadPdf(input);
  const font = await stampFont(pdf, options.font, false);
  const color = hexToRgb(options.color);
  const pages = pdf.getPages();
  const total = pages.length - options.skipFirst;
  pages.forEach((page, index) => {
    if (index < options.skipFirst) return;
    const n = index - options.skipFirst + options.start;
    const label = toWinAnsi(options.format.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total + options.start - 1)));
    const { width, height, rotated } = visibleSize(page);
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    const [vAlign, hAlign] = options.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
    const x = hAlign === 'left' ? options.margin : hAlign === 'right' ? width - options.margin - textWidth : (width - textWidth) / 2;
    const y = vAlign === 'top' ? height - options.margin : options.margin;
    if (!rotated) {
      page.drawText(label, { x, y, size: options.fontSize, font, color });
    } else {
      // Rotated pages: draw in the page's own coordinate space, rotated to read upright.
      const angle = page.getRotation().angle;
      const size = page.getSize();
      if (angle === 90) page.drawText(label, { x: size.width - y, y: x, size: options.fontSize, font, color, rotate: degrees(90) });
      else if (angle === 270) page.drawText(label, { x: y, y: size.height - x, size: options.fontSize, font, color, rotate: degrees(270) });
      else page.drawText(label, { x, y, size: options.fontSize, font, color });
    }
  });
  applyMeta(pdf, {});
  return pdf.save({ useObjectStreams: true });
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageCount: number;
}

export async function readPdfMetadata(input: PdfInput): Promise<PdfMetadata> {
  const pdf = await loadPdf(input);
  return {
    title: pdf.getTitle() ?? '',
    author: pdf.getAuthor() ?? '',
    subject: pdf.getSubject() ?? '',
    keywords: pdf.getKeywords() ?? '',
    creator: pdf.getCreator() ?? '',
    producer: pdf.getProducer() ?? '',
    creationDate: pdf.getCreationDate(),
    modificationDate: pdf.getModificationDate(),
    pageCount: pdf.getPageCount(),
  };
}

export async function writePdfMetadata(input: PdfInput, meta: Partial<Omit<PdfMetadata, 'pageCount'>>): Promise<Uint8Array> {
  const pdf = await loadPdf(input);
  pdf.setTitle(meta.title ?? '');
  pdf.setAuthor(meta.author ?? '');
  pdf.setSubject(meta.subject ?? '');
  pdf.setKeywords(meta.keywords?.trim() ? [meta.keywords.trim()] : []);
  pdf.setCreator(meta.creator ?? '');
  pdf.setProducer(meta.producer ?? 'Web Tools (pdf-lib)');
  if (meta.creationDate) pdf.setCreationDate(meta.creationDate);
  pdf.setModificationDate(meta.modificationDate ?? new Date());
  return pdf.save({ useObjectStreams: true });
}

/* -------------------------------------------------------------------------- */
/* Images → PDF                                                               */
/* -------------------------------------------------------------------------- */

export type ImagePageMode = 'fit-a4' | 'fit-letter' | 'image-size';

export interface ImagesToPdfOptions {
  pageMode: ImagePageMode;
  orientation: 'auto' | 'portrait' | 'landscape';
  /** Margin in points. */
  margin: number;
  /** Stretch small images up to the available area. */
  upscale: boolean;
  background: string;
  title?: string;
}

export const defaultImagesToPdfOptions: ImagesToPdfOptions = {
  pageMode: 'fit-a4',
  orientation: 'auto',
  margin: 24,
  upscale: true,
  background: 'FFFFFF',
};

export interface ImageSource {
  data: Uint8Array;
  type: 'image/png' | 'image/jpeg';
  name?: string;
}

export async function imagesToPdf(
  images: ImageSource[],
  partial: Partial<ImagesToPdfOptions> = {},
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (!images.length) throw new Error('Add at least one image.');
  const options = { ...defaultImagesToPdfOptions, ...partial };
  const pdf = await PDFDocument.create();
  const background = hexToRgb(options.background);
  let index = 0;
  for (const source of images) {
    const image = source.type === 'image/png' ? await pdf.embedPng(source.data) : await pdf.embedJpg(source.data);
    const imgW = image.width * 0.75;
    const imgH = image.height * 0.75;
    let pageW: number;
    let pageH: number;
    if (options.pageMode === 'image-size') {
      pageW = imgW + options.margin * 2;
      pageH = imgH + options.margin * 2;
    } else {
      const [w, h] = options.pageMode === 'fit-letter' ? PageSizes.Letter : PageSizes.A4;
      const landscape = options.orientation === 'landscape' || (options.orientation === 'auto' && imgW > imgH);
      pageW = landscape ? h : w;
      pageH = landscape ? w : h;
    }
    const page = pdf.addPage([pageW, pageH]);
    if (options.background.toUpperCase() !== 'FFFFFF') page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: background });
    const availW = pageW - options.margin * 2;
    const availH = pageH - options.margin * 2;
    let scale = Math.min(availW / imgW, availH / imgH);
    if (!options.upscale) scale = Math.min(1, scale);
    const w = imgW * scale;
    const h = imgH * scale;
    page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
    onProgress?.(++index, images.length);
  }
  applyMeta(pdf, { title: options.title });
  pdf.setCreator('Web Tools — images to PDF');
  return pdf.save({ useObjectStreams: true });
}

/* -------------------------------------------------------------------------- */
/* Re-save (structure-level compression)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Re-serialise with object streams and without incremental-update cruft.
 * This is lossless: images are untouched, so gains vary from 0 to ~40%.
 */
export async function resavePdf(input: PdfInput, options: { stripMetadata?: boolean } = {}): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  for (const page of copied) out.addPage(page);
  if (!options.stripMetadata) {
    if (src.getTitle()) out.setTitle(src.getTitle()!);
    if (src.getAuthor()) out.setAuthor(src.getAuthor()!);
    if (src.getSubject()) out.setSubject(src.getSubject()!);
    const keywords = src.getKeywords();
    if (keywords) out.setKeywords(keywords.split(/[,;]\s*/).filter(Boolean));
  }
  out.setProducer('Web Tools (pdf-lib)');
  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

/** Build a PDF from already-rendered page bitmaps (used by lossy compression). */
export async function pdfFromRenderedPages(
  pages: Array<{ data: Uint8Array; type: 'image/jpeg' | 'image/png'; widthPt: number; heightPt: number }>,
  meta?: SaveOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    const image = page.type === 'image/png' ? await pdf.embedPng(page.data) : await pdf.embedJpg(page.data);
    const p = pdf.addPage([page.widthPt, page.heightPt]);
    p.drawImage(image, { x: 0, y: 0, width: page.widthPt, height: page.heightPt });
  }
  applyMeta(pdf, meta);
  return pdf.save({ useObjectStreams: true });
}

export function formatPageLabel(count: number): string {
  return `${count} page${count === 1 ? '' : 's'}`;
}
