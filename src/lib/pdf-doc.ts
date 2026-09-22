/**
 * RichDocument → PDF, built on pdf-lib.
 *
 * A small flow-layout engine: paragraphs are wrapped word-by-word using real
 * font metrics, headings keep with the text that follows, tables break
 * between rows (repeating their header), images scale to the column, and
 * everything is drawn with the fourteen standard PDF fonts so no font files
 * need to be downloaded. Standard fonts only cover Latin scripts (WinAnsi);
 * anything else is substituted and reported in `warnings`.
 */

import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import type { Block, DocImage, Inline, Paragraph, ParagraphStyle, RichDocument, Table, TextRun } from '@/lib/richdoc';
import { inlinesToText } from '@/lib/richdoc';

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export type PdfPageSize = 'A4' | 'Letter' | 'Legal' | 'A5';
export type PdfFontFamily = 'sans' | 'serif' | 'mono';

export interface PdfDocOptions {
  pageSize: PdfPageSize;
  orientation: 'portrait' | 'landscape';
  /** Margins in points (72 pt = 1 inch). */
  margin: number;
  fontFamily: PdfFontFamily;
  baseFontSize: number;
  lineHeight: number;
  pageNumbers: 'none' | 'number' | 'number-of-total';
  /** Honour explicit run sizes from the source document (DOCX). */
  useDocumentSizes: boolean;
  /** Start every document in a multi-document render on a fresh page. */
  breakBetweenDocuments: boolean;
  /** Draw the file name as a heading before each document when combining. */
  titleEachDocument: boolean;
  headingColor: string;
  linkColor: string;
  textColor: string;
}

export const defaultPdfDocOptions: PdfDocOptions = {
  pageSize: 'A4',
  orientation: 'portrait',
  margin: 64,
  fontFamily: 'sans',
  baseFontSize: 11,
  lineHeight: 1.45,
  pageNumbers: 'number-of-total',
  useDocumentSizes: true,
  breakBetweenDocuments: true,
  titleEachDocument: false,
  headingColor: '111827',
  linkColor: '1D4ED8',
  textColor: '1F2937',
};

export const PAGE_SIZES: Record<PdfPageSize, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  Legal: [612, 1008],
  A5: [419.53, 595.28],
};

export interface RenderInput {
  doc: RichDocument;
  /** Used for `titleEachDocument` and warnings. */
  name?: string;
}

export interface RenderResult {
  bytes: Uint8Array;
  pdf: PDFDocument;
  pageCount: number;
  warnings: string[];
}

export type ImageConverter = (image: DocImage) => Promise<{ data: Uint8Array; type: 'image/png' | 'image/jpeg' } | null>;

/* -------------------------------------------------------------------------- */
/* WinAnsi sanitisation                                                       */
/* -------------------------------------------------------------------------- */

const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const REPLACEMENTS: Record<string, string> = {
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '-', '\u2212': '-', '\u2043': '-',
  '\u2032': "'", '\u2033': '"', '\u2035': "'", '\u02bc': "'", '\u02bb': "'", '\u2044': '/', '\u2215': '/',
  '\u2190': '<-', '\u2192': '->', '\u2191': '^', '\u2193': 'v', '\u2194': '<->', '\u21d2': '=>', '\u21d0': '<=', '\u21d4': '<=>',
  '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u2248': '~', '\u221e': 'inf', '\u2261': '==', '\u00b1': '\u00b1',
  '\u2713': 'v', '\u2714': 'v', '\u2717': 'x', '\u2718': 'x', '\u2610': '[ ]', '\u2611': '[x]', '\u2612': '[x]',
  '\u25cf': '\u2022', '\u25e6': 'o', '\u25aa': '\u2022', '\u25a0': '\u2022', '\u2023': '\u2022', '\u2219': '\u2022', '\u00b7': '\u00b7',
  '\u2003': ' ', '\u2002': ' ', '\u2009': ' ', '\u200a': ' ', '\u202f': ' ', '\u205f': ' ', '\u3000': ' ', '\u2007': ' ', '\u2008': ' ',
  '\u200b': '', '\u200c': '', '\u200d': '', '\u2060': '', '\ufeff': '', '\u00ad': '',
  '\u0142': 'l', '\u0141': 'L', '\u0111': 'd', '\u0110': 'D', '\u0131': 'i', '\u2122': '\u2122', '\u2116': 'No.',
  '\u2018': '\u2018', '\u201c': '\u201c', '\u02c8': "'", '\u2122\u2122': '',
  '\ufb01': 'fi', '\ufb02': 'fl', '\ufb00': 'ff', '\ufb03': 'ffi', '\ufb04': 'ffl',
};

function canEncode(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WINANSI_EXTRA.has(codePoint);
}

export interface SanitizeReport {
  replaced: number;
  samples: string[];
}

/** Replace characters the standard fonts cannot draw, collecting a report. */
export function toWinAnsi(text: string, report?: SanitizeReport): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x09 || cp === 0x0a) {
      out += ch;
      continue;
    }
    if (canEncode(cp)) {
      out += ch;
      continue;
    }
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    // Strip combining marks after decomposition: ő → o, ẞ → ?
    const decomposed = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (decomposed && Array.from(decomposed).every((c) => canEncode(c.codePointAt(0)!))) {
      out += decomposed;
      continue;
    }
    // Emoji and symbols in the supplementary planes are dropped; letters become '?'.
    const isLetter = /\p{L}|\p{N}/u.test(ch);
    if (report) {
      report.replaced++;
      if (report.samples.length < 6 && !report.samples.includes(ch)) report.samples.push(ch);
    }
    out += isLetter ? '?' : '';
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

async function loadFonts(pdf: PDFDocument, family: PdfFontFamily): Promise<{ text: FontSet; mono: FontSet }> {
  const embed = (name: StandardFonts): Promise<PDFFont> => pdf.embedFont(name);
  const mono: FontSet = {
    regular: await embed(StandardFonts.Courier),
    bold: await embed(StandardFonts.CourierBold),
    italic: await embed(StandardFonts.CourierOblique),
    boldItalic: await embed(StandardFonts.CourierBoldOblique),
  };
  if (family === 'mono') return { text: mono, mono };
  if (family === 'serif') {
    return {
      text: {
        regular: await embed(StandardFonts.TimesRoman),
        bold: await embed(StandardFonts.TimesRomanBold),
        italic: await embed(StandardFonts.TimesRomanItalic),
        boldItalic: await embed(StandardFonts.TimesRomanBoldItalic),
      },
      mono,
    };
  }
  return {
    text: {
      regular: await embed(StandardFonts.Helvetica),
      bold: await embed(StandardFonts.HelveticaBold),
      italic: await embed(StandardFonts.HelveticaOblique),
      boldItalic: await embed(StandardFonts.HelveticaBoldOblique),
    },
    mono,
  };
}

function pickFont(set: FontSet, bold: boolean, italic: boolean): PDFFont {
  if (bold && italic) return set.boldItalic;
  if (bold) return set.bold;
  if (italic) return set.italic;
  return set.regular;
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return rgb(0, 0, 0);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/* -------------------------------------------------------------------------- */
/* Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

interface StyleSpec {
  scale: number;
  bold: boolean;
  italic: boolean;
  before: number;
  after: number;
  color?: 'heading' | 'muted';
  keepWithNext: boolean;
}

const STYLE_SPECS: Record<ParagraphStyle, StyleSpec> = {
  normal: { scale: 1, bold: false, italic: false, before: 0, after: 0.7, keepWithNext: false },
  title: { scale: 2.3, bold: true, italic: false, before: 0.2, after: 0.6, color: 'heading', keepWithNext: true },
  subtitle: { scale: 1.3, bold: false, italic: false, before: 0, after: 1.2, color: 'muted', keepWithNext: true },
  h1: { scale: 1.9, bold: true, italic: false, before: 1.4, after: 0.5, color: 'heading', keepWithNext: true },
  h2: { scale: 1.5, bold: true, italic: false, before: 1.2, after: 0.4, color: 'heading', keepWithNext: true },
  h3: { scale: 1.25, bold: true, italic: false, before: 1, after: 0.35, color: 'heading', keepWithNext: true },
  h4: { scale: 1.1, bold: true, italic: false, before: 0.9, after: 0.3, color: 'heading', keepWithNext: true },
  h5: { scale: 1, bold: true, italic: false, before: 0.8, after: 0.3, color: 'heading', keepWithNext: true },
  h6: { scale: 1, bold: true, italic: true, before: 0.8, after: 0.3, color: 'heading', keepWithNext: true },
  quote: { scale: 1, bold: false, italic: true, before: 0.3, after: 0.8, color: 'muted', keepWithNext: false },
  code: { scale: 0.88, bold: false, italic: false, before: 0.3, after: 0.9, keepWithNext: false },
  caption: { scale: 0.85, bold: false, italic: false, before: 0, after: 0.7, color: 'muted', keepWithNext: false },
};

interface Segment {
  text: string;
  font: PDFFont;
  size: number;
  color: RGB;
  width: number;
  underline: boolean;
  strike: boolean;
  href?: string;
  /** Baseline shift for super/subscript. */
  rise: number;
  isSpace: boolean;
  background?: RGB;
}

interface Line {
  segments: Segment[];
  width: number;
  height: number;
  /** Largest font size on the line, for baseline placement. */
  size: number;
}

interface LaidOutParagraph {
  lines: Line[];
  before: number;
  after: number;
  indent: number;
  align: NonNullable<Paragraph['align']>;
  marker?: { text: string; font: PDFFont; size: number; color: RGB };
  keepWithNext: boolean;
  codeBackground: boolean;
  quoteBar: boolean;
  height: number;
}

class Layout {
  readonly pdf: PDFDocument;
  readonly options: PdfDocOptions;
  readonly fonts: { text: FontSet; mono: FontSet };
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly contentWidth: number;
  readonly textColor: RGB;
  readonly headingColor: RGB;
  readonly linkColor: RGB;
  readonly mutedColor: RGB;
  readonly report: SanitizeReport = { replaced: 0, samples: [] };
  readonly warnings = new Set<string>();
  page!: PDFPage;
  y = 0;
  pageCount = 0;
  private readonly imageCache = new Map<Uint8Array, PDFImage | null>();

  constructor(pdf: PDFDocument, options: PdfDocOptions, fonts: { text: FontSet; mono: FontSet }, private readonly convertImage?: ImageConverter) {
    this.pdf = pdf;
    this.options = options;
    this.fonts = fonts;
    const [w, h] = PAGE_SIZES[options.pageSize];
    this.pageWidth = options.orientation === 'landscape' ? h : w;
    this.pageHeight = options.orientation === 'landscape' ? w : h;
    this.contentWidth = this.pageWidth - options.margin * 2;
    this.textColor = hexToRgb(options.textColor);
    this.headingColor = hexToRgb(options.headingColor);
    this.linkColor = hexToRgb(options.linkColor);
    this.mutedColor = rgb(0.42, 0.45, 0.5);
  }

  get bottom(): number {
    return this.options.margin;
  }

  get remaining(): number {
    return this.y - this.bottom;
  }

  get atTop(): boolean {
    return this.y >= this.pageHeight - this.options.margin - 0.01;
  }

  newPage(): void {
    this.page = this.pdf.addPage([this.pageWidth, this.pageHeight]);
    this.pageCount++;
    this.y = this.pageHeight - this.options.margin;
  }

  ensure(height: number): void {
    if (this.remaining < height && !this.atTop) this.newPage();
  }

  /* ---- Text measurement -------------------------------------------------- */

  private segmentsFor(runs: Inline[], style: StyleSpec, baseSize: number, isCode: boolean): Array<Segment | 'break'> {
    const out: Array<Segment | 'break'> = [];
    for (const run of runs) {
      if (run.kind === 'break') {
        out.push('break');
        continue;
      }
      if (run.kind === 'image') continue;
      const useMono = isCode || run.code;
      const set = useMono ? this.fonts.mono : this.fonts.text;
      const bold = style.bold || Boolean(run.bold);
      const italic = style.italic || Boolean(run.italic);
      const font = pickFont(set, bold, italic);
      let size = baseSize;
      if (this.options.useDocumentSizes && run.size && style.scale === 1) size = run.size;
      if (run.code && !isCode) size *= 0.92;
      const rise = run.superscript ? size * 0.35 : run.subscript ? -size * 0.15 : 0;
      if (run.superscript || run.subscript) size *= 0.68;
      const color = run.href
        ? this.linkColor
        : run.color
          ? hexToRgb(run.color)
          : style.color === 'heading'
            ? this.headingColor
            : style.color === 'muted'
              ? this.mutedColor
              : this.textColor;
      const text = toWinAnsi(run.text.replace(/\t/g, '    '), this.report);
      const pieces = isCode ? text.split(/(\n)/) : text.split(/(\s+)/);
      for (const piece of pieces) {
        if (!piece) continue;
        if (piece === '\n') {
          out.push('break');
          continue;
        }
        const isSpace = /^\s+$/.test(piece);
        out.push({
          text: piece,
          font,
          size,
          color,
          width: font.widthOfTextAtSize(piece, size),
          underline: Boolean(run.underline) || Boolean(run.href),
          strike: Boolean(run.strike),
          href: run.href,
          rise,
          isSpace,
          background: run.code && !isCode ? rgb(0.94, 0.94, 0.95) : undefined,
        });
      }
    }
    return out;
  }

  private wrap(items: Array<Segment | 'break'>, maxWidth: number, lineHeight: number, fallbackSize: number, preserveSpaces: boolean): Line[] {
    const lines: Line[] = [];
    let current: Segment[] = [];
    let width = 0;

    const finish = (): void => {
      // Drop trailing whitespace from the line.
      while (!preserveSpaces && current.length && current[current.length - 1]!.isSpace) {
        width -= current.pop()!.width;
      }
      const size = current.reduce((m, s) => Math.max(m, s.size + Math.abs(s.rise)), 0) || fallbackSize;
      lines.push({ segments: current, width, height: size * lineHeight, size });
      current = [];
      width = 0;
    };

    for (const item of items) {
      if (item === 'break') {
        finish();
        continue;
      }
      if (item.isSpace && current.length === 0 && !preserveSpaces) continue;
      if (width + item.width <= maxWidth || current.length === 0) {
        if (item.width > maxWidth) {
          // A single token wider than the line: split by characters.
          let chunk = '';
          for (const ch of item.text) {
            const w = item.font.widthOfTextAtSize(chunk + ch, item.size);
            if (w > maxWidth && chunk) {
              const seg: Segment = { ...item, text: chunk, width: item.font.widthOfTextAtSize(chunk, item.size) };
              current.push(seg);
              width += seg.width;
              finish();
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          if (chunk) {
            const seg: Segment = { ...item, text: chunk, width: item.font.widthOfTextAtSize(chunk, item.size) };
            current.push(seg);
            width += seg.width;
          }
          continue;
        }
        current.push(item);
        width += item.width;
      } else {
        finish();
        if (item.isSpace && !preserveSpaces) continue;
        current.push(item);
        width += item.width;
      }
    }
    if (current.length || lines.length === 0) finish();
    return lines;
  }

  layoutParagraph(para: Paragraph, maxWidth: number): LaidOutParagraph {
    const spec = STYLE_SPECS[para.style] ?? STYLE_SPECS.normal;
    const base = this.options.baseFontSize;
    const size = base * spec.scale;
    const isCode = para.style === 'code';
    const listIndent = para.list ? 18 + para.list.level * 18 : 0;
    const quoteIndent = para.style === 'quote' ? 14 : 0;
    const indent = listIndent + quoteIndent + (para.indent ?? 0);
    const available = Math.max(40, maxWidth - indent - (isCode ? 12 : 0));
    const items = this.segmentsFor(para.runs, spec, size, isCode);
    const lines = this.wrap(items, available, isCode ? 1.35 : this.options.lineHeight, size, isCode);

    let marker: LaidOutParagraph['marker'];
    if (para.list) {
      const label =
        para.list.checked !== undefined
          ? para.list.checked
            ? '[x]'
            : '[ ]'
          : (para.list.marker ?? (para.list.ordered ? `${para.list.index}.` : '•'));
      const font = pickFont(this.fonts.text, false, false);
      marker = { text: toWinAnsi(label), font, size, color: this.textColor };
    }

    const before = spec.before * base;
    const after = (para.list ? 0.25 : spec.after) * base;
    const height = lines.reduce((sum, l) => sum + l.height, 0) + (isCode ? 12 : 0);
    return {
      lines,
      before,
      after,
      indent,
      align: para.align ?? 'left',
      marker,
      keepWithNext: spec.keepWithNext,
      codeBackground: isCode,
      quoteBar: para.style === 'quote',
      height,
    };
  }

  /* ---- Drawing ----------------------------------------------------------- */

  drawLine(line: Line, x: number, yTop: number, maxWidth: number, align: LaidOutParagraph['align'], isLast: boolean): void {
    const ascent = line.size * 0.78;
    const baseline = yTop - (line.height - line.size) / 2 - ascent;
    let cursor = x;
    let spaceExtra = 0;
    if (align === 'center') cursor = x + (maxWidth - line.width) / 2;
    else if (align === 'right') cursor = x + maxWidth - line.width;
    else if (align === 'justify' && !isLast) {
      const spaces = line.segments.filter((s) => s.isSpace).length;
      if (spaces > 0) spaceExtra = (maxWidth - line.width) / spaces;
    }

    for (const seg of line.segments) {
      const width = seg.width + (seg.isSpace ? spaceExtra : 0);
      if (seg.background && !seg.isSpace) {
        this.page.drawRectangle({
          x: cursor - 1,
          y: baseline - seg.size * 0.25,
          width: width + 2,
          height: seg.size * 1.2,
          color: seg.background,
        });
      }
      if (!seg.isSpace || seg.text.trim()) {
        this.page.drawText(seg.text, { x: cursor, y: baseline + seg.rise, size: seg.size, font: seg.font, color: seg.color });
      }
      if (seg.underline && !seg.isSpace) {
        this.page.drawLine({
          start: { x: cursor, y: baseline + seg.rise - seg.size * 0.12 },
          end: { x: cursor + width, y: baseline + seg.rise - seg.size * 0.12 },
          thickness: Math.max(0.5, seg.size * 0.05),
          color: seg.color,
        });
      }
      if (seg.strike && !seg.isSpace) {
        this.page.drawLine({
          start: { x: cursor, y: baseline + seg.size * 0.3 },
          end: { x: cursor + width, y: baseline + seg.size * 0.3 },
          thickness: Math.max(0.5, seg.size * 0.05),
          color: seg.color,
        });
      }
      if (seg.href && !seg.isSpace) {
        this.addLink(cursor, baseline - seg.size * 0.25, width, seg.size * 1.2, seg.href);
      }
      cursor += width;
    }
  }

  private addLink(x: number, y: number, width: number, height: number, href: string): void {
    if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
    try {
      const annotation = this.pdf.context.register(
        this.pdf.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [x, y, x + width, y + height],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) },
        }),
      );
      const existing = this.page.node.lookup(PDFName.of('Annots'));
      const annots = this.pdf.context.obj([]);
      if (existing && 'asArray' in existing) {
        for (const item of (existing as { asArray(): unknown[] }).asArray()) annots.push(item as never);
      }
      annots.push(annotation);
      this.page.node.set(PDFName.of('Annots'), annots);
    } catch {
      /* annotations are decorative — never fail the render over one */
    }
  }

  drawParagraph(laid: LaidOutParagraph, x: number, width: number): void {
    const { options } = this;
    if (!this.atTop) this.y -= laid.before;

    const firstChunk = Math.min(laid.height, (laid.lines[0]?.height ?? 0) * 2);
    const need = laid.keepWithNext ? laid.height + options.baseFontSize * options.lineHeight * 2 : firstChunk;
    if (this.remaining < need && !this.atTop) this.newPage();

    const pad = laid.codeBackground ? 6 : 0;
    const boxX = x + laid.indent;
    const boxWidth = width - laid.indent;
    const innerX = boxX + pad;
    const innerWidth = boxWidth - pad * 2;
    const codeFill = rgb(0.96, 0.96, 0.97);

    if (laid.codeBackground) {
      this.page.drawRectangle({ x: boxX, y: this.y - pad, width: boxWidth, height: pad, color: codeFill });
      this.y -= pad;
    }

    laid.lines.forEach((line, index) => {
      if (this.remaining < line.height && !this.atTop) {
        this.newPage();
        if (laid.codeBackground) {
          this.page.drawRectangle({ x: boxX, y: this.y - pad, width: boxWidth, height: pad, color: codeFill });
          this.y -= pad;
        }
      }
      if (laid.codeBackground) {
        this.page.drawRectangle({ x: boxX, y: this.y - line.height, width: boxWidth, height: line.height, color: codeFill });
      }
      if (laid.quoteBar) {
        this.page.drawLine({
          start: { x: boxX - 8, y: this.y },
          end: { x: boxX - 8, y: this.y - line.height },
          thickness: 2.5,
          color: rgb(0.8, 0.8, 0.84),
        });
      }
      if (index === 0 && laid.marker) {
        const markerWidth = laid.marker.font.widthOfTextAtSize(laid.marker.text, laid.marker.size);
        const ascent = line.size * 0.78;
        const baseline = this.y - (line.height - line.size) / 2 - ascent;
        this.page.drawText(laid.marker.text, {
          x: Math.max(x, boxX - 6 - markerWidth),
          y: baseline,
          size: laid.marker.size,
          font: laid.marker.font,
          color: laid.marker.color,
        });
      }
      this.drawLine(line, innerX, this.y, innerWidth, laid.align, index === laid.lines.length - 1);
      this.y -= line.height;
    });

    if (laid.codeBackground) {
      this.page.drawRectangle({ x: boxX, y: this.y - pad, width: boxWidth, height: pad, color: codeFill });
      this.y -= pad;
    }
    this.y -= laid.after;
  }

  /* ---- Images ------------------------------------------------------------ */

  private async embedImage(image: DocImage): Promise<PDFImage | null> {
    if (this.imageCache.has(image.data)) return this.imageCache.get(image.data) ?? null;
    let result: PDFImage | null = null;
    try {
      if (image.type === 'image/png') result = await this.pdf.embedPng(image.data);
      else if (image.type === 'image/jpeg') result = await this.pdf.embedJpg(image.data);
      else if (!image.unsupported && this.convertImage) {
        const converted = await this.convertImage(image);
        if (converted) {
          result = converted.type === 'image/png' ? await this.pdf.embedPng(converted.data) : await this.pdf.embedJpg(converted.data);
        }
      }
    } catch {
      result = null;
    }
    if (!result) {
      this.warnings.add(
        image.unsupported
          ? `An image in ${image.type.replace('image/', '').toUpperCase()} format cannot be embedded in PDF and was replaced with a placeholder.`
          : `An image (${image.type}) could not be decoded and was replaced with a placeholder.`,
      );
    }
    this.imageCache.set(image.data, result);
    return result;
  }

  async drawImage(image: DocImage, align: Paragraph['align'] = 'left', caption?: string): Promise<void> {
    const embedded = await this.embedImage(image);
    const maxWidth = this.contentWidth;
    const maxHeight = this.pageHeight - this.options.margin * 2 - 20;
    let width = image.width || (embedded ? embedded.width * 0.75 : 200);
    let height = image.height || (embedded ? embedded.height * 0.75 : 120);
    if (embedded && (!image.width || !image.height)) {
      width = embedded.width * 0.75;
      height = embedded.height * 0.75;
    }
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;

    this.ensure(height + 8);
    const x =
      align === 'center' ? this.options.margin + (maxWidth - width) / 2 : align === 'right' ? this.options.margin + maxWidth - width : this.options.margin;
    const y = this.y - height;
    if (embedded) {
      this.page.drawImage(embedded, { x, y, width, height });
    } else {
      this.page.drawRectangle({ x, y, width, height, borderColor: rgb(0.75, 0.75, 0.78), borderWidth: 1, color: rgb(0.97, 0.97, 0.98) });
      const label = toWinAnsi(image.alt ? `[Image: ${image.alt}]` : '[Image could not be embedded]');
      const font = this.fonts.text.italic;
      const size = 9;
      const tw = font.widthOfTextAtSize(label, size);
      this.page.drawText(label, { x: x + Math.max(4, (width - tw) / 2), y: y + height / 2 - size / 2, size, font, color: this.mutedColor });
    }
    this.y = y - 6;
    if (caption) {
      const laid = this.layoutParagraph({ kind: 'paragraph', style: 'caption', runs: [{ kind: 'text', text: caption }], align: 'center' }, this.contentWidth);
      this.drawParagraph(laid, this.options.margin, this.contentWidth);
    } else {
      this.y -= this.options.baseFontSize * 0.5;
    }
  }

  /* ---- Tables ------------------------------------------------------------ */

  drawTable(table: Table): void {
    if (!table.rows.length) return;
    const pad = 5;
    const columnCount = Math.max(...table.rows.map((r) => r.cells.reduce((n, c) => n + (c.colSpan ?? 1), 0)));
    if (columnCount === 0) return;
    let widths: number[];
    if (table.columnWidths && table.columnWidths.length === columnCount) {
      const total = table.columnWidths.reduce((a, b) => a + b, 0) || 1;
      widths = table.columnWidths.map((w) => (w / total) * this.contentWidth);
    } else {
      // Size columns by their natural (unwrapped) content width, clamped so a
      // single verbose column cannot starve the others.
      const natural = Array.from({ length: columnCount }, () => 0);
      for (const row of table.rows) {
        let col = 0;
        for (const cell of row.cells) {
          const span = cell.colSpan ?? 1;
          if (span === 1) {
            let width = 0;
            for (const block of cell.blocks) {
              if (block.kind !== 'paragraph') continue;
              const items = this.segmentsFor(block.runs, STYLE_SPECS.normal, this.options.baseFontSize, false);
              let lineWidth = 0;
              for (const item of items) {
                if (item === 'break') {
                  width = Math.max(width, lineWidth);
                  lineWidth = 0;
                } else lineWidth += item.width;
              }
              width = Math.max(width, lineWidth);
            }
            natural[col] = Math.max(natural[col] ?? 0, Math.min(width + pad * 2 + 2, this.contentWidth * 0.55));
          }
          col += span;
        }
      }
      const minWidth = Math.min(48, this.contentWidth / columnCount);
      const sized = natural.map((w) => Math.max(minWidth, w));
      const total = sized.reduce((a, b) => a + b, 0) || 1;
      widths = sized.map((w) => (w / total) * this.contentWidth);
    }

    interface LaidCell {
      paragraphs: LaidOutParagraph[];
      height: number;
      x: number;
      width: number;
      header: boolean;
      align: Paragraph['align'];
    }

    const layoutRow = (row: Table['rows'][number]): { cells: LaidCell[]; height: number } => {
      const cells: LaidCell[] = [];
      let col = 0;
      let x = this.options.margin;
      for (const cell of row.cells) {
        const span = cell.colSpan ?? 1;
        const width = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
        const inner = Math.max(20, width - pad * 2);
        const paragraphs: LaidOutParagraph[] = [];
        for (const block of cell.blocks) {
          if (block.kind === 'paragraph') {
            const para: Paragraph = row.header || cell.header ? { ...block, runs: block.runs.map((r) => (r.kind === 'text' ? { ...r, bold: true } : r)) } : block;
            const laid = this.layoutParagraph({ ...para, align: cell.align ?? para.align }, inner);
            laid.before = 0;
            laid.after = paragraphs.length === cell.blocks.length - 1 ? 0 : this.options.baseFontSize * 0.3;
            paragraphs.push(laid);
          } else if (block.kind === 'table') {
            const flat = block.rows.map((r) => r.cells.map((c) => c.blocks.map((b) => (b.kind === 'paragraph' ? inlinesToText(b.runs) : '')).join(' ')).join(' | ')).join('\n');
            paragraphs.push(this.layoutParagraph({ kind: 'paragraph', style: 'normal', runs: [{ kind: 'text', text: flat }] }, inner));
          } else if (block.kind === 'image') {
            paragraphs.push(this.layoutParagraph({ kind: 'paragraph', style: 'caption', runs: [{ kind: 'text', text: `[Image${block.image.alt ? `: ${block.image.alt}` : ''}]` }] }, inner));
          }
        }
        const height = paragraphs.reduce((sum, p) => sum + p.height + p.after, 0) + pad * 2;
        cells.push({ paragraphs, height, x, width, header: Boolean(row.header || cell.header), align: cell.align });
        x += width;
        col += span;
      }
      const height = Math.max(this.options.baseFontSize * 1.6 + pad * 2, ...cells.map((c) => c.height));
      return { cells, height };
    };

    const drawRow = (laid: { cells: LaidCell[]; height: number }): void => {
      const top = this.y;
      const bottom = top - laid.height;
      for (const cell of laid.cells) {
        if (cell.header) {
          this.page.drawRectangle({ x: cell.x, y: bottom, width: cell.width, height: laid.height, color: rgb(0.95, 0.95, 0.96) });
        }
        this.page.drawRectangle({ x: cell.x, y: bottom, width: cell.width, height: laid.height, borderColor: rgb(0.78, 0.78, 0.82), borderWidth: 0.6 });
        const savedY = this.y;
        this.y = top - pad;
        for (const para of cell.paragraphs) {
          const innerX = cell.x + pad;
          const innerWidth = cell.width - pad * 2;
          para.lines.forEach((line, index) => {
            this.drawLine(line, innerX + para.indent, this.y, innerWidth - para.indent, para.align, index === para.lines.length - 1);
            this.y -= line.height;
          });
          this.y -= para.after;
        }
        this.y = savedY;
      }
      this.y = bottom;
    };

    const headerRow = table.rows[0] && (table.rows[0].header || table.rows[0].cells.every((c) => c.header)) ? layoutRow(table.rows[0]) : null;
    this.y -= this.options.baseFontSize * 0.3;

    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i]!;
      const laid = i === 0 && headerRow ? headerRow : layoutRow(row);
      if (this.remaining < laid.height && !this.atTop) {
        this.newPage();
        if (headerRow && i > 0) drawRow(headerRow);
      }
      drawRow(laid);
    }
    this.y -= this.options.baseFontSize * 0.9;
  }

  /* ---- Blocks ------------------------------------------------------------ */

  async drawBlocks(blocks: Block[]): Promise<void> {
    let count = 0;
    for (const block of blocks) {
      if (++count % 40 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      switch (block.kind) {
        case 'paragraph': {
          if (block.pageBreakBefore && !this.atTop) this.newPage();
          const images = block.runs.filter((r): r is Extract<Inline, { kind: 'image' }> => r.kind === 'image');
          const hasText = block.runs.some((r) => r.kind === 'text' && r.text.trim());
          if (hasText || block.list || !images.length) {
            const laid = this.layoutParagraph(block, this.contentWidth);
            if (laid.lines.some((l) => l.segments.length) || block.list) {
              this.drawParagraph(laid, this.options.margin, this.contentWidth);
            } else {
              // Empty paragraph: keep a little vertical rhythm.
              this.y -= this.options.baseFontSize * 0.6;
            }
          }
          for (const img of images) await this.drawImage(img.image, block.align);
          break;
        }
        case 'image':
          await this.drawImage(block.image, block.align, block.caption);
          break;
        case 'table':
          this.drawTable(block);
          break;
        case 'rule':
          this.ensure(20);
          this.y -= 10;
          this.page.drawLine({
            start: { x: this.options.margin, y: this.y },
            end: { x: this.pageWidth - this.options.margin, y: this.y },
            thickness: 0.75,
            color: rgb(0.8, 0.8, 0.84),
          });
          this.y -= 12;
          break;
        case 'pageBreak':
          if (!this.atTop) this.newPage();
          break;
      }
    }
  }

  drawPageNumbers(): void {
    if (this.options.pageNumbers === 'none') return;
    const pages = this.pdf.getPages();
    const font = this.fonts.text.regular;
    pages.forEach((page, index) => {
      const label = this.options.pageNumbers === 'number' ? String(index + 1) : `${index + 1} / ${pages.length}`;
      const size = 9;
      const width = font.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (this.pageWidth - width) / 2,
        y: this.options.margin / 2 - size / 2,
        size,
        font,
        color: this.mutedColor,
      });
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function renderPdf(
  inputs: RenderInput[],
  partial: Partial<PdfDocOptions> = {},
  hooks: { convertImage?: ImageConverter; onProgress?: (done: number, total: number) => void } = {},
): Promise<RenderResult> {
  const options: PdfDocOptions = { ...defaultPdfDocOptions, ...partial };
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf, options.fontFamily);
  const layout = new Layout(pdf, options, fonts, hooks.convertImage);
  layout.newPage();

  const first = inputs[0]?.doc;
  const title = first?.meta.title ?? (inputs.length === 1 ? inputs[0]?.name?.replace(/\.[^.]+$/, '') : undefined);
  if (title) pdf.setTitle(title);
  if (first?.meta.author) pdf.setAuthor(first.meta.author);
  if (first?.meta.subject) pdf.setSubject(first.meta.subject);
  if (first?.meta.keywords?.length) pdf.setKeywords(first.meta.keywords);
  pdf.setCreator('Web Tools — in-browser document converter');
  pdf.setProducer('Web Tools (pdf-lib)');
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    if (i > 0 && options.breakBetweenDocuments && !layout.atTop) layout.newPage();
    if (options.titleEachDocument && input.name) {
      const heading = layout.layoutParagraph(
        { kind: 'paragraph', style: 'h1', runs: [{ kind: 'text', text: input.name.replace(/\.[^.]+$/, '') }] },
        layout.contentWidth,
      );
      layout.drawParagraph(heading, options.margin, layout.contentWidth);
    }
    await layout.drawBlocks(input.doc.blocks);
    for (const warning of input.doc.warnings) layout.warnings.add(input.name ? `${input.name}: ${warning}` : warning);
    hooks.onProgress?.(i + 1, inputs.length);
  }

  layout.drawPageNumbers();

  if (layout.report.replaced > 0) {
    layout.warnings.add(
      `${layout.report.replaced} character${layout.report.replaced === 1 ? '' : 's'} outside the Latin range (e.g. ${layout.report.samples.join(' ')}) could not be drawn with the built-in PDF fonts and were substituted.`,
    );
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return { bytes, pdf, pageCount: pdf.getPageCount(), warnings: Array.from(layout.warnings) };
}

/** Convenience: a single plain-text document with no formatting. */
export function textToRichDocument(text: string, title?: string): RichDocument {
  const blocks: Block[] = [];
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const para of paragraphs) {
    const lines = para.split('\n');
    const runs: Inline[] = [];
    lines.forEach((line, index) => {
      if (index > 0) runs.push({ kind: 'break' });
      runs.push({ kind: 'text', text: line });
    });
    blocks.push({ kind: 'paragraph', style: 'normal', runs });
  }
  return { blocks, meta: title ? { title } : {}, warnings: [] };
}

export { toWinAnsi as sanitizeForPdf };
export type { TextRun };
