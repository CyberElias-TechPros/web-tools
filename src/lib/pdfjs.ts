/**
 * Thin, lazily-loaded wrapper around pdf.js for the read-only side of PDF
 * work: rendering pages to bitmaps, extracting text and counting pages.
 *
 * pdf.js is ~1 MB, so it is imported on first use rather than with the app.
 * The worker is bundled by Vite and served from the same origin, which keeps
 * the strict CSP (`worker-src 'self' blob:`) intact.
 */

import type * as PdfJsModule from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

type PdfJs = typeof PdfJsModule;

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return lib;
    });
  }
  return pdfjsPromise;
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  pageCount: number;
  destroy: () => Promise<void>;
}

export async function openPdf(data: ArrayBuffer | Uint8Array, password?: string): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  try {
    const task = pdfjs.getDocument({ data: bytes, password });
    const doc = await task.promise;
    return { doc, pageCount: doc.numPages, destroy: () => task.destroy() };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'PasswordException') {
      throw new Error(password ? 'The password is incorrect.' : 'This PDF is password-protected. Enter its password to continue.', { cause: e });
    }
    if (name === 'InvalidPDFException') throw new Error('This file is not a valid PDF, or it is damaged.', { cause: e });
    throw new Error(`Could not open the PDF: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

export interface RenderedPage {
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number;
}

export type RasterFormat = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Render one page to an image Blob. `scale` is relative to 72 dpi, so 2 =
 * 144 dpi; pass `dpi` to request an absolute resolution instead.
 */
export async function renderPageToBlob(
  page: PDFPageProxy,
  options: { scale?: number; dpi?: number; format?: RasterFormat; quality?: number; background?: string } = {},
): Promise<RenderedPage> {
  const scale = options.dpi ? options.dpi / 72 : (options.scale ?? 2);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is not available in this browser.');
  await page.render({ canvas, viewport, background: options.background ?? '#ffffff' }).promise;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, options.format ?? 'image/png', options.quality ?? 0.92),
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('The browser could not encode the rendered page.');
  return { blob, width: viewport.width, height: viewport.height, pageNumber: page.pageNumber };
}

/** Small thumbnail as a data URL, used for page pickers. */
export async function renderThumbnail(page: PDFPageProxy, maxWidth = 160): Promise<{ url: string; width: number; height: number }> {
  const base = page.getViewport({ scale: 1 });
  const scale = maxWidth / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is not available in this browser.');
  await page.render({ canvas, viewport, background: '#ffffff' }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.8);
  canvas.width = 0;
  canvas.height = 0;
  return { url, width: viewport.width, height: viewport.height };
}

export interface PageText {
  pageNumber: number;
  text: string;
}

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
}

/** Extract text page by page, reconstructing line breaks from glyph positions. */
export async function extractText(
  doc: PDFDocumentProxy,
  options: { from?: number; to?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<PageText[]> {
  const from = Math.max(1, options.from ?? 1);
  const to = Math.min(doc.numPages, options.to ?? doc.numPages);
  const pages: PageText[] = [];
  for (let n = from; n <= to; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    let lastY: number | null = null;
    let lastX: number | null = null;
    for (const raw of content.items as TextItemLike[]) {
      if (typeof raw.str !== 'string') continue;
      const tx = raw.transform;
      const y = tx ? tx[5]! : null;
      const x = tx ? tx[4]! : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        text += '\n';
      } else if (lastX !== null && x !== null && x - lastX > 1 && text && !text.endsWith(' ') && !text.endsWith('\n')) {
        text += ' ';
      }
      text += raw.str;
      if (raw.hasEOL) text += '\n';
      lastY = y;
      lastX = x !== null && raw.width !== undefined ? x + raw.width : x;
    }
    pages.push({ pageNumber: n, text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() });
    page.cleanup();
    options.onProgress?.(n - from + 1, to - from + 1);
  }
  return pages;
}

export async function getPdfInfo(doc: PDFDocumentProxy): Promise<{
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pdfVersion?: string;
  encrypted: boolean;
  firstPageSize: { width: number; height: number };
}> {
  const meta = await doc.getMetadata();
  const info = (meta.info ?? {}) as Record<string, unknown>;
  const first = await doc.getPage(1);
  const view = first.getViewport({ scale: 1 });
  const str = (key: string): string | undefined => {
    const v = info[key];
    return typeof v === 'string' && v.trim() ? v : undefined;
  };
  return {
    pageCount: doc.numPages,
    title: str('Title'),
    author: str('Author'),
    subject: str('Subject'),
    keywords: str('Keywords'),
    creator: str('Creator'),
    producer: str('Producer'),
    creationDate: str('CreationDate'),
    modificationDate: str('ModDate'),
    pdfVersion: str('PDFFormatVersion'),
    encrypted: Boolean(info.IsEncrypted),
    firstPageSize: { width: view.width, height: view.height },
  };
}

export function looksLikePdf(file: { name: string; type: string }): boolean {
  return /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
}
