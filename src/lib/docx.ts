/**
 * DOCX (WordprocessingML) → RichDocument.
 *
 * A .docx file is a ZIP of XML parts. This reads the main document part plus
 * styles, numbering, relationships, footnotes, media and core properties, and
 * produces the format-neutral model in `richdoc.ts`. It deliberately covers
 * the constructs that carry meaning for a reader — headings, emphasis, lists,
 * tables, images, links, page breaks — and reports what it skipped.
 */

import { readZip, type ZipArchive } from '@/lib/zip-reader';
import type {
  Block,
  DocImage,
  Inline,
  Paragraph,
  ParagraphStyle,
  RichDocument,
  TableCell,
  TableRow,
  TextRun,
  Alignment,
} from '@/lib/richdoc';
import { mergeRuns } from '@/lib/richdoc';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU_PER_POINT = 12700;

const MONOSPACE_FONTS = /^(consolas|courier|courier new|lucida console|menlo|monaco|source code pro|fira code|jetbrains mono|roboto mono|cascadia|dejavu sans mono|ubuntu mono)$/i;

interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
  size?: number;
  code?: boolean;
}

interface ParaProps {
  styleId?: string;
  align?: Alignment;
  numId?: string;
  ilvl?: number;
  outlineLevel?: number;
  pageBreakBefore?: boolean;
  indentLeft?: number;
}

interface StyleDef {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  pPr: ParaProps;
  rPr: RunProps;
}

interface NumberingLevel {
  format: string;
  text: string;
  start: number;
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

/* -------------------------------------------------------------------------- */
/* XML helpers                                                                */
/* -------------------------------------------------------------------------- */

function parseXml(source: string, partName: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`“${partName}” inside the document is not well-formed XML.`);
  return doc;
}

function attr(el: Element, name: string): string | null {
  const direct = el.getAttributeNS(W_NS, name) ?? el.getAttributeNS(R_NS, name);
  if (direct != null) return direct;
  for (const a of Array.from(el.attributes)) {
    if (a.localName === name) return a.value;
  }
  return null;
}

function children(el: Element): Element[] {
  return Array.from(el.children);
}

function child(el: Element, localName: string): Element | undefined {
  for (const c of Array.from(el.children)) if (c.localName === localName) return c;
  return undefined;
}

function descendant(el: Element, localName: string): Element | undefined {
  const all = el.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const node = all[i]!;
    if (node.localName === localName) return node;
  }
  return undefined;
}

/** Word booleans: element present = true unless w:val says otherwise. */
function flag(parent: Element | undefined, localName: string): boolean | undefined {
  if (!parent) return undefined;
  const el = child(parent, localName);
  if (!el) return undefined;
  const val = attr(el, 'val');
  if (val == null) return true;
  return !(val === '0' || val === 'false' || val === 'off');
}

function toAlign(value: string | null): Alignment | undefined {
  switch (value) {
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'both':
    case 'distribute':
      return 'justify';
    case 'left':
    case 'start':
      return 'left';
    default:
      return undefined;
  }
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const segments = base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') segments.pop();
    else if (part !== '.' && part !== '') segments.push(part);
  }
  return segments.join('/');
}

function sniffImageType(bytes: Uint8Array, fallbackName: string): string {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes.length > 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  if (bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length > 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00))) return 'image/tiff';
  if (bytes.length > 4 && bytes[0] === 0x01 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'image/emf';
  if (bytes.length > 4 && bytes[0] === 0xd7 && bytes[1] === 0xcd && bytes[2] === 0xc6 && bytes[3] === 0x9a) return 'image/wmf';
  const ext = fallbackName.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    emf: 'image/emf',
    wmf: 'image/wmf',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return byExt[ext] ?? 'application/octet-stream';
}

/* -------------------------------------------------------------------------- */
/* Part readers                                                               */
/* -------------------------------------------------------------------------- */

function parseRelationships(xml: string | null): Map<string, Relationship> {
  const map = new Map<string, Relationship>();
  if (!xml) return map;
  const doc = parseXml(xml, 'relationships');
  const rels = doc.getElementsByTagName('*');
  for (let i = 0; i < rels.length; i++) {
    const el = rels[i]!;
    if (el.localName !== 'Relationship') continue;
    const id = el.getAttribute('Id');
    const type = el.getAttribute('Type') ?? '';
    const target = el.getAttribute('Target') ?? '';
    if (!id) continue;
    map.set(id, { id, type, target, external: el.getAttribute('TargetMode') === 'External' });
  }
  return map;
}

function readRunProps(rPr: Element | undefined): RunProps {
  const props: RunProps = {};
  if (!rPr) return props;
  const bold = flag(rPr, 'b');
  const italic = flag(rPr, 'i');
  const strike = flag(rPr, 'strike') ?? flag(rPr, 'dstrike');
  if (bold !== undefined) props.bold = bold;
  if (italic !== undefined) props.italic = italic;
  if (strike !== undefined) props.strike = strike;
  const u = child(rPr, 'u');
  if (u) props.underline = (attr(u, 'val') ?? 'single') !== 'none';
  const vert = child(rPr, 'vertAlign');
  if (vert) {
    const v = attr(vert, 'val');
    props.superscript = v === 'superscript';
    props.subscript = v === 'subscript';
  }
  const color = child(rPr, 'color');
  const colorVal = color ? attr(color, 'val') : null;
  if (colorVal && /^[0-9a-fA-F]{6}$/.test(colorVal)) props.color = colorVal.toUpperCase();
  const sz = child(rPr, 'sz');
  const szVal = sz ? Number(attr(sz, 'val')) : NaN;
  if (Number.isFinite(szVal) && szVal > 0) props.size = szVal / 2;
  const fonts = child(rPr, 'rFonts');
  const ascii = fonts ? (attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi')) : null;
  if (ascii && MONOSPACE_FONTS.test(ascii.trim())) props.code = true;
  return props;
}

function readParaProps(pPr: Element | undefined): ParaProps {
  const props: ParaProps = {};
  if (!pPr) return props;
  const style = child(pPr, 'pStyle');
  if (style) props.styleId = attr(style, 'val') ?? undefined;
  const jc = child(pPr, 'jc');
  if (jc) props.align = toAlign(attr(jc, 'val'));
  const numPr = child(pPr, 'numPr');
  if (numPr) {
    const numId = child(numPr, 'numId');
    const ilvl = child(numPr, 'ilvl');
    if (numId) props.numId = attr(numId, 'val') ?? undefined;
    if (ilvl) props.ilvl = Number(attr(ilvl, 'val') ?? 0);
  }
  const outline = child(pPr, 'outlineLvl');
  if (outline) props.outlineLevel = Number(attr(outline, 'val'));
  if (flag(pPr, 'pageBreakBefore')) props.pageBreakBefore = true;
  const ind = child(pPr, 'ind');
  if (ind) {
    const left = Number(attr(ind, 'left') ?? attr(ind, 'start') ?? 0);
    if (Number.isFinite(left) && left > 0) props.indentLeft = left / 20; // twips → pt
  }
  return props;
}

function parseStyles(xml: string | null): { styles: Map<string, StyleDef>; defaultSize: number } {
  const styles = new Map<string, StyleDef>();
  let defaultSize = 11;
  if (!xml) return { styles, defaultSize };
  const doc = parseXml(xml, 'word/styles.xml');
  const root = doc.documentElement;
  const defaults = child(root, 'docDefaults');
  const rPrDefault = defaults ? child(defaults, 'rPrDefault') : undefined;
  const defaultRun = rPrDefault ? readRunProps(child(rPrDefault, 'rPr')) : {};
  if (defaultRun.size) defaultSize = defaultRun.size;

  for (const el of children(root)) {
    if (el.localName !== 'style') continue;
    const id = attr(el, 'styleId');
    if (!id) continue;
    const nameEl = child(el, 'name');
    const basedOn = child(el, 'basedOn');
    styles.set(id, {
      id,
      name: (nameEl ? attr(nameEl, 'val') : null) ?? id,
      type: attr(el, 'type') ?? 'paragraph',
      basedOn: basedOn ? (attr(basedOn, 'val') ?? undefined) : undefined,
      pPr: readParaProps(child(el, 'pPr')),
      rPr: readRunProps(child(el, 'rPr')),
    });
  }
  return { styles, defaultSize };
}

function parseNumbering(xml: string | null): Map<string, Map<number, NumberingLevel>> {
  const result = new Map<string, Map<number, NumberingLevel>>();
  if (!xml) return result;
  const doc = parseXml(xml, 'word/numbering.xml');
  const root = doc.documentElement;
  const abstracts = new Map<string, Map<number, NumberingLevel>>();

  const readLevels = (container: Element): Map<number, NumberingLevel> => {
    const levels = new Map<number, NumberingLevel>();
    for (const lvl of children(container)) {
      if (lvl.localName !== 'lvl') continue;
      const ilvl = Number(attr(lvl, 'ilvl') ?? 0);
      const fmt = child(lvl, 'numFmt');
      const txt = child(lvl, 'lvlText');
      const start = child(lvl, 'start');
      levels.set(ilvl, {
        format: (fmt ? attr(fmt, 'val') : null) ?? 'decimal',
        text: (txt ? attr(txt, 'val') : null) ?? '%1.',
        start: Number((start ? attr(start, 'val') : null) ?? 1),
      });
    }
    return levels;
  };

  for (const el of children(root)) {
    if (el.localName === 'abstractNum') {
      const id = attr(el, 'abstractNumId');
      if (id) abstracts.set(id, readLevels(el));
    }
  }
  for (const el of children(root)) {
    if (el.localName !== 'num') continue;
    const numId = attr(el, 'numId');
    const abstractRef = child(el, 'abstractNumId');
    if (!numId || !abstractRef) continue;
    const base = abstracts.get(attr(abstractRef, 'val') ?? '') ?? new Map<number, NumberingLevel>();
    const levels = new Map(base);
    for (const override of children(el)) {
      if (override.localName !== 'lvlOverride') continue;
      const ilvl = Number(attr(override, 'ilvl') ?? 0);
      const lvl = child(override, 'lvl');
      const startOverride = child(override, 'startOverride');
      const existing = levels.get(ilvl) ?? { format: 'decimal', text: '%1.', start: 1 };
      if (lvl) {
        const parsed = readLevels(override).get(ilvl);
        if (parsed) levels.set(ilvl, parsed);
      } else if (startOverride) {
        levels.set(ilvl, { ...existing, start: Number(attr(startOverride, 'val') ?? existing.start) });
      }
    }
    result.set(numId, levels);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Number formatting                                                          */
/* -------------------------------------------------------------------------- */

function toRoman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rest = Math.max(1, Math.floor(n));
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

function toLetters(n: number): string {
  let out = '';
  let rest = Math.max(1, Math.floor(n));
  while (rest > 0) {
    rest--;
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

export function formatListNumber(n: number, format: string): string {
  switch (format) {
    case 'lowerLetter':
      return toLetters(n);
    case 'upperLetter':
      return toLetters(n).toUpperCase();
    case 'lowerRoman':
      return toRoman(n).toLowerCase();
    case 'upperRoman':
      return toRoman(n);
    case 'decimalZero':
      return String(n).padStart(2, '0');
    default:
      return String(n);
  }
}

/* -------------------------------------------------------------------------- */
/* Main parser                                                                */
/* -------------------------------------------------------------------------- */

interface ParserContext {
  zip: ZipArchive;
  rels: Map<string, Relationship>;
  styles: Map<string, StyleDef>;
  numbering: Map<string, Map<number, NumberingLevel>>;
  footnotes: Map<string, Inline[]>;
  images: Map<string, DocImage>;
  warnings: Set<string>;
  counters: Map<string, number[]>;
  mainPartDir: string;
  footnoteRefs: string[];
}

function resolveStyleChain(ctx: ParserContext, styleId: string | undefined): StyleDef[] {
  const chain: StyleDef[] = [];
  let current = styleId;
  let guard = 0;
  while (current && guard++ < 12) {
    const def = ctx.styles.get(current);
    if (!def) break;
    chain.unshift(def);
    current = def.basedOn;
  }
  return chain;
}

function classifyParagraph(chain: StyleDef[], props: ParaProps): ParagraphStyle {
  const names = chain.map((s) => s.name.toLowerCase());
  const last = names[names.length - 1] ?? '';
  const heading = /^heading\s*([1-6])$/.exec(last) ?? /^(?:überschrift|titre|título|titolo|заголовок)\s*([1-6])$/.exec(last);
  if (heading) return `h${heading[1]}` as ParagraphStyle;
  if (last === 'title') return 'title';
  if (last === 'subtitle') return 'subtitle';
  if (/quote/.test(last)) return 'quote';
  if (/caption/.test(last)) return 'caption';
  if (/(^|\s)(code|preformatted|macro text|source)/.test(last)) return 'code';
  const outline = props.outlineLevel ?? chain.map((s) => s.pPr.outlineLevel).filter((v) => v !== undefined).pop();
  if (outline !== undefined && outline >= 0 && outline <= 5) return `h${outline + 1}` as ParagraphStyle;
  if (chain.some((s) => s.rPr.code) && !chain.some((s) => /normal|body/.test(s.name.toLowerCase()) && !s.rPr.code)) return 'code';
  return 'normal';
}

async function loadImage(ctx: ParserContext, relId: string): Promise<DocImage | undefined> {
  const cached = ctx.images.get(relId);
  if (cached) return cached;
  const rel = ctx.rels.get(relId);
  if (!rel || rel.external) return undefined;
  const path = resolvePath(`${ctx.mainPartDir}/document.xml`, rel.target);
  const entry = ctx.zip.file(path);
  if (!entry) {
    ctx.warnings.add(`Image “${rel.target}” is referenced but missing from the file.`);
    return undefined;
  }
  const data = await ctx.zip.extract(entry);
  const type = sniffImageType(data, path);
  const unsupported = !/^image\/(png|jpeg|gif|bmp|webp|svg\+xml)$/.test(type);
  if (unsupported) ctx.warnings.add(`An image in ${type.replace('image/', '').toUpperCase()} format cannot be embedded and was replaced with a placeholder.`);
  const image: DocImage = { data, type, width: 0, height: 0, unsupported };
  ctx.images.set(relId, image);
  return image;
}

async function readDrawing(ctx: ParserContext, drawing: Element): Promise<DocImage | undefined> {
  const blip = descendant(drawing, 'blip');
  const embed = blip ? (blip.getAttributeNS(R_NS, 'embed') ?? blip.getAttribute('r:embed') ?? attr(blip, 'embed')) : null;
  if (!embed) return undefined;
  const base = await loadImage(ctx, embed);
  if (!base) return undefined;
  const extent = descendant(drawing, 'extent');
  const cx = Number(extent?.getAttribute('cx') ?? 0);
  const cy = Number(extent?.getAttribute('cy') ?? 0);
  const docPr = descendant(drawing, 'docPr');
  const alt = docPr?.getAttribute('descr') ?? docPr?.getAttribute('title') ?? undefined;
  return {
    ...base,
    width: cx > 0 ? cx / EMU_PER_POINT : 0,
    height: cy > 0 ? cy / EMU_PER_POINT : 0,
    alt: alt || undefined,
  };
}

async function readLegacyPicture(ctx: ParserContext, pict: Element): Promise<DocImage | undefined> {
  const data = descendant(pict, 'imagedata');
  const relId = data ? (data.getAttributeNS(R_NS, 'id') ?? data.getAttribute('r:id') ?? attr(data, 'id')) : null;
  if (!relId) return undefined;
  const base = await loadImage(ctx, relId);
  if (!base) return undefined;
  const shape = descendant(pict, 'shape');
  const style = shape?.getAttribute('style') ?? '';
  const w = /width:\s*([\d.]+)pt/.exec(style);
  const h = /height:\s*([\d.]+)pt/.exec(style);
  return { ...base, width: w ? Number(w[1]) : 0, height: h ? Number(h[1]) : 0 };
}

interface RunCollector {
  runs: Inline[];
  /** Paragraph pieces split by hard page breaks. */
  segments: Inline[][];
  extraBlocks: Block[];
}

async function collectRuns(
  ctx: ParserContext,
  container: Element,
  inherited: RunProps,
  href: string | undefined,
  out: RunCollector,
): Promise<void> {
  for (const node of children(container)) {
    switch (node.localName) {
      case 'r':
        await readRun(ctx, node, inherited, href, out);
        break;
      case 'hyperlink': {
        const rid = node.getAttributeNS(R_NS, 'id') ?? node.getAttribute('r:id') ?? attr(node, 'id');
        const anchor = attr(node, 'anchor');
        const rel = rid ? ctx.rels.get(rid) : undefined;
        const target = rel?.external ? rel.target : anchor ? `#${anchor}` : href;
        await collectRuns(ctx, node, inherited, target, out);
        break;
      }
      case 'ins':
      case 'smartTag':
      case 'fldSimple':
      case 'sdtContent':
      case 'customXml':
      case 'dir':
      case 'bdo':
        await collectRuns(ctx, node, inherited, href, out);
        break;
      case 'sdt': {
        const content = child(node, 'sdtContent');
        if (content) await collectRuns(ctx, content, inherited, href, out);
        break;
      }
      case 'del':
      case 'moveFrom':
      case 'proofErr':
      case 'bookmarkStart':
      case 'bookmarkEnd':
      case 'commentRangeStart':
      case 'commentRangeEnd':
      case 'pPr':
        break;
      case 'oMath':
      case 'oMathPara':
        ctx.warnings.add('Equations are not supported and were skipped.');
        break;
      default:
        break;
    }
  }
}

async function readRun(
  ctx: ParserContext,
  r: Element,
  inherited: RunProps,
  href: string | undefined,
  out: RunCollector,
): Promise<void> {
  const rPr = child(r, 'rPr');
  const own = readRunProps(rPr);
  const rStyle = rPr ? child(rPr, 'rStyle') : undefined;
  const charStyle = rStyle ? resolveStyleChain(ctx, attr(rStyle, 'val') ?? undefined) : [];
  const styleProps = charStyle.reduce<RunProps>((acc, s) => ({ ...acc, ...s.rPr }), {});
  const props: RunProps = { ...inherited, ...styleProps, ...own };

  const push = (content: string): void => {
    if (!content) return;
    const run: TextRun = { kind: 'text', text: content };
    if (props.bold) run.bold = true;
    if (props.italic) run.italic = true;
    if (props.underline) run.underline = true;
    if (props.strike) run.strike = true;
    if (props.code) run.code = true;
    if (props.superscript) run.superscript = true;
    if (props.subscript) run.subscript = true;
    if (props.color) run.color = props.color;
    if (props.size) run.size = props.size;
    if (href) run.href = href;
    out.runs.push(run);
  };

  for (const node of children(r)) {
    switch (node.localName) {
      case 't':
        push(node.textContent ?? '');
        break;
      case 'tab':
        push('\t');
        break;
      case 'br': {
        if (attr(node, 'type') === 'page') {
          out.segments.push(out.runs);
          out.runs = [];
        } else {
          out.runs.push({ kind: 'break' });
        }
        break;
      }
      case 'cr':
        out.runs.push({ kind: 'break' });
        break;
      case 'noBreakHyphen':
        push('\u2011');
        break;
      case 'sym': {
        const code = parseInt(attr(node, 'char') ?? '', 16);
        if (Number.isFinite(code)) {
          // Symbol fonts live in the private-use area; map them to a bullet.
          push(code >= 0xf000 ? '•' : String.fromCharCode(code));
        }
        break;
      }
      case 'drawing': {
        const image = await readDrawing(ctx, node);
        if (image) out.runs.push({ kind: 'image', image });
        break;
      }
      case 'pict':
      case 'object': {
        const image = await readLegacyPicture(ctx, node);
        if (image) out.runs.push({ kind: 'image', image });
        else if (node.localName === 'object') ctx.warnings.add('An embedded object could not be converted.');
        break;
      }
      case 'footnoteReference':
      case 'endnoteReference': {
        const id = attr(node, 'id') ?? '';
        const note = ctx.footnotes.get(`${node.localName === 'endnoteReference' ? 'e' : 'f'}${id}`);
        const key = `${node.localName === 'endnoteReference' ? 'e' : 'f'}${id}`;
        let index = ctx.footnoteRefs.indexOf(key);
        if (index < 0) {
          ctx.footnoteRefs.push(key);
          index = ctx.footnoteRefs.length - 1;
        }
        if (note) out.runs.push({ kind: 'text', text: String(index + 1), superscript: true });
        break;
      }
      case 'AlternateContent': {
        // Text boxes and shapes: pull any paragraphs out of the fallback content.
        const fallback = child(node, 'Fallback') ?? child(node, 'Choice');
        const txbx = fallback ? descendant(fallback, 'txbxContent') : undefined;
        if (txbx) {
          const nested = await readBlocks(ctx, txbx);
          out.extraBlocks.push(...nested);
        } else {
          const choice = child(node, 'Choice');
          const drawing = choice ? descendant(choice, 'drawing') : undefined;
          const image = drawing ? await readDrawing(ctx, drawing) : undefined;
          if (image) out.runs.push({ kind: 'image', image });
        }
        break;
      }
      default:
        break;
    }
  }
}

function nextListMarker(ctx: ParserContext, numId: string, ilvl: number): { ordered: boolean; marker?: string; index: number } | null {
  const levels = ctx.numbering.get(numId);
  const level = levels?.get(ilvl) ?? levels?.get(0);
  if (!level) return { ordered: false, index: 1 };
  if (level.format === 'none') return null;
  const counters = ctx.counters.get(numId) ?? [];
  // Entering this level again resets every deeper level.
  counters.length = Math.max(counters.length, ilvl + 1);
  for (let i = ilvl + 1; i < counters.length; i++) counters[i] = 0;
  counters[ilvl] = (counters[ilvl] ?? 0) + 1;
  ctx.counters.set(numId, counters);
  const index = level.start - 1 + (counters[ilvl] ?? 1);
  if (level.format === 'bullet') {
    const glyph = level.text;
    const marker = glyph && !/^[\uF000-\uF0FF]/.test(glyph) && glyph.trim() && glyph.length <= 2 ? glyph : '•';
    return { ordered: false, marker, index };
  }
  const marker = level.text
    .replace(/%(\d)/g, (_m, n: string) => {
      const lvl = Number(n) - 1;
      const lvlDef = levels?.get(lvl);
      const count = lvl === ilvl ? index : (lvlDef ? lvlDef.start - 1 : 0) + (counters[lvl] ?? 1);
      return formatListNumber(count, lvlDef?.format ?? 'decimal');
    })
    .trim();
  return { ordered: true, marker: marker || `${index}.`, index };
}

async function readParagraph(ctx: ParserContext, p: Element): Promise<Block[]> {
  const pPr = child(p, 'pPr');
  const own = readParaProps(pPr);
  const chain = resolveStyleChain(ctx, own.styleId);
  const styleParaProps = chain.reduce<ParaProps>((acc, s) => ({ ...acc, ...s.pPr }), {});
  const props: ParaProps = { ...styleParaProps, ...own };
  const inheritedRun = chain.reduce<RunProps>((acc, s) => ({ ...acc, ...s.rPr }), {});
  // Paragraph mark run properties (w:pPr/w:rPr) apply to the mark only, not the text.
  const style = classifyParagraph(chain, props);
  // Heading styles set bold/size themselves; the renderer owns heading typography.
  const baseRun: RunProps = /^(h[1-6]|title|subtitle)$/.test(style) ? { code: inheritedRun.code } : inheritedRun;

  const collector: RunCollector = { runs: [], segments: [], extraBlocks: [] };
  await collectRuns(ctx, p, baseRun, undefined, collector);
  collector.segments.push(collector.runs);

  const blocks: Block[] = [];
  let list: Paragraph['list'];
  if (props.numId && props.numId !== '0') {
    const marker = nextListMarker(ctx, props.numId, props.ilvl ?? 0);
    if (marker) {
      list = { ordered: marker.ordered, level: props.ilvl ?? 0, index: marker.index, marker: marker.marker };
    }
  }

  collector.segments.forEach((runs, i) => {
    if (i > 0) blocks.push({ kind: 'pageBreak' });
    const merged = mergeRuns(runs);
    const isEmpty = merged.every((r) => r.kind === 'text' && r.text.trim() === '');
    // Word documents are full of empty paragraphs used as spacing; keep a
    // single one so spacing survives, but not page-break-only paragraphs.
    if (isEmpty && (i > 0 || collector.segments.length > 1)) return;
    const para: Paragraph = { kind: 'paragraph', runs: merged, style };
    if (props.align) para.align = props.align;
    if (list && i === 0) para.list = list;
    if (props.pageBreakBefore && i === 0) para.pageBreakBefore = true;
    if (props.indentLeft && !list) para.indent = props.indentLeft;
    // A paragraph that is nothing but one image becomes an image block.
    const images = merged.filter((r) => r.kind === 'image');
    const textContent = merged.filter((r) => r.kind === 'text').map((r) => r.text).join('').trim();
    if (images.length === 1 && !textContent && images[0]?.kind === 'image') {
      blocks.push({ kind: 'image', image: images[0].image, align: props.align ?? 'left' });
    } else {
      blocks.push(para);
    }
  });

  blocks.push(...collector.extraBlocks);
  return blocks;
}

async function readTable(ctx: ParserContext, tbl: Element): Promise<Block> {
  const grid = child(tbl, 'tblGrid');
  const columnWidths = grid
    ? children(grid)
        .filter((c) => c.localName === 'gridCol')
        .map((c) => Number(attr(c, 'w') ?? 0))
    : [];
  const rows: TableRow[] = [];
  for (const tr of children(tbl)) {
    if (tr.localName !== 'tr') continue;
    const trPr = child(tr, 'trPr');
    const header = trPr ? child(trPr, 'tblHeader') !== undefined : false;
    const cells: TableCell[] = [];
    for (const tc of children(tr)) {
      if (tc.localName !== 'tc' && tc.localName !== 'sdt') continue;
      const cellEl = tc.localName === 'sdt' ? (child(tc, 'sdtContent') ? descendant(child(tc, 'sdtContent')!, 'tc') : undefined) : tc;
      if (!cellEl) continue;
      const tcPr = child(cellEl, 'tcPr');
      const span = tcPr ? child(tcPr, 'gridSpan') : undefined;
      const cell: TableCell = { blocks: await readBlocks(ctx, cellEl), header };
      const spanVal = span ? Number(attr(span, 'val') ?? 1) : 1;
      if (spanVal > 1) cell.colSpan = spanVal;
      cells.push(cell);
    }
    if (cells.length) rows.push({ cells, header });
  }
  const table: Block = { kind: 'table', rows };
  if (columnWidths.length && columnWidths.every((w) => w > 0)) table.columnWidths = columnWidths;
  return table;
}

async function readBlocks(ctx: ParserContext, container: Element): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const node of children(container)) {
    switch (node.localName) {
      case 'p':
        blocks.push(...(await readParagraph(ctx, node)));
        break;
      case 'tbl':
        blocks.push(await readTable(ctx, node));
        break;
      case 'sdt': {
        const content = child(node, 'sdtContent');
        if (content) blocks.push(...(await readBlocks(ctx, content)));
        break;
      }
      case 'sdtContent':
      case 'customXml':
      case 'ins':
        blocks.push(...(await readBlocks(ctx, node)));
        break;
      case 'sectPr':
      case 'bookmarkStart':
      case 'bookmarkEnd':
      case 'tcPr':
      case 'tblPr':
      case 'tblGrid':
      case 'proofErr':
      case 'del':
        break;
      case 'altChunk':
        ctx.warnings.add('Embedded external content (altChunk) was skipped.');
        break;
      default:
        break;
    }
  }
  return blocks;
}

async function parseFootnotes(ctx: ParserContext, xml: string | null, prefix: 'f' | 'e'): Promise<void> {
  if (!xml) return;
  const doc = parseXml(xml, prefix === 'f' ? 'word/footnotes.xml' : 'word/endnotes.xml');
  for (const note of children(doc.documentElement)) {
    if (note.localName !== 'footnote' && note.localName !== 'endnote') continue;
    const type = attr(note, 'type');
    if (type === 'separator' || type === 'continuationSeparator') continue;
    const id = attr(note, 'id') ?? '';
    const runs: Inline[] = [];
    for (const p of children(note)) {
      if (p.localName !== 'p') continue;
      const collector: RunCollector = { runs: [], segments: [], extraBlocks: [] };
      await collectRuns(ctx, p, {}, undefined, collector);
      if (runs.length) runs.push({ kind: 'break' });
      runs.push(...collector.runs.filter((r) => !(r.kind === 'text' && r.superscript && /^\s*$/.test(r.text))));
    }
    // Drop the leading footnote-mark run Word inserts.
    const first = runs[0];
    if (first?.kind === 'text' && first.superscript) runs.shift();
    ctx.footnotes.set(`${prefix}${id}`, mergeRuns(runs));
  }
}

function parseCoreProperties(xml: string | null): RichDocument['meta'] {
  if (!xml) return {};
  try {
    const doc = parseXml(xml, 'docProps/core.xml');
    const get = (name: string): string | undefined => {
      const all = doc.getElementsByTagName('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i]!;
        if (el.localName === name) return el.textContent?.trim() || undefined;
      }
      return undefined;
    };
    const created = get('created');
    const modified = get('modified');
    const keywords = get('keywords');
    return {
      title: get('title'),
      author: get('creator'),
      subject: get('subject'),
      keywords: keywords ? keywords.split(/[,;]\s*/).filter(Boolean) : undefined,
      created: created ? new Date(created) : undefined,
      modified: modified ? new Date(modified) : undefined,
    };
  } catch {
    return {};
  }
}

async function readOptional(zip: ZipArchive, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return zip.extractText(entry);
}

/** Locate the main document part via the package relationships. */
async function findMainPart(zip: ZipArchive): Promise<string> {
  const rootRels = parseRelationships(await readOptional(zip, '_rels/.rels'));
  for (const rel of rootRels.values()) {
    if (/\/officeDocument$/.test(rel.type)) return rel.target.replace(/^\//, '');
  }
  if (zip.file('word/document.xml')) return 'word/document.xml';
  throw new Error('This file is not a Word document (no main document part found).');
}

export async function parseDocx(input: ArrayBuffer | Uint8Array | Blob): Promise<RichDocument> {
  const bytes =
    input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : input instanceof Uint8Array ? input : new Uint8Array(input);
  let zip: ZipArchive;
  try {
    zip = await readZip(bytes);
  } catch (e) {
    throw new Error(`Could not open the document: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  const mainPart = await findMainPart(zip);
  if (!mainPart.endsWith('.xml') || !zip.file(mainPart)) {
    throw new Error('This file is not a Word document.');
  }
  const mainPartDir = mainPart.split('/').slice(0, -1).join('/') || 'word';
  const mainPartName = mainPart.split('/').pop() ?? 'document.xml';
  const relsPath = `${mainPartDir}/_rels/${mainPartName}.rels`;

  const [documentXml, relsXml, stylesXml, numberingXml, footnotesXml, endnotesXml, coreXml] = await Promise.all([
    zip.extractText(mainPart),
    readOptional(zip, relsPath),
    readOptional(zip, `${mainPartDir}/styles.xml`),
    readOptional(zip, `${mainPartDir}/numbering.xml`),
    readOptional(zip, `${mainPartDir}/footnotes.xml`),
    readOptional(zip, `${mainPartDir}/endnotes.xml`),
    readOptional(zip, 'docProps/core.xml'),
  ]);

  const { styles } = parseStyles(stylesXml);
  const ctx: ParserContext = {
    zip,
    rels: parseRelationships(relsXml),
    styles,
    numbering: parseNumbering(numberingXml),
    footnotes: new Map(),
    images: new Map(),
    warnings: new Set(),
    counters: new Map(),
    mainPartDir,
    footnoteRefs: [],
  };
  await parseFootnotes(ctx, footnotesXml, 'f');
  await parseFootnotes(ctx, endnotesXml, 'e');

  const doc = parseXml(documentXml, mainPart);
  if (doc.documentElement.localName !== 'document') {
    throw new Error('This file is not a Word document (it may be a spreadsheet or presentation).');
  }
  const body = descendant(doc.documentElement, 'body');
  if (!body) throw new Error('The document has no body.');

  const blocks = await readBlocks(ctx, body);

  // Append referenced footnotes as a notes section.
  if (ctx.footnoteRefs.length) {
    blocks.push({ kind: 'rule' });
    ctx.footnoteRefs.forEach((key, i) => {
      const runs = ctx.footnotes.get(key);
      if (!runs) return;
      blocks.push({
        kind: 'paragraph',
        style: 'caption',
        runs: [{ kind: 'text', text: `${i + 1}. ` }, ...runs],
      });
    });
  }

  for (const rel of ctx.rels.values()) {
    if (/\/(header|footer)$/.test(rel.type)) {
      ctx.warnings.add('Headers and footers are not carried over.');
      break;
    }
  }
  for (const rel of ctx.rels.values()) {
    if (/\/comments$/.test(rel.type)) {
      ctx.warnings.add('Comments were not included.');
      break;
    }
  }

  // Drop trailing empty paragraphs.
  while (blocks.length) {
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'paragraph' && last.runs.every((r) => r.kind === 'text' && !r.text.trim()) && !last.list) blocks.pop();
    else break;
  }

  return { blocks, meta: parseCoreProperties(coreXml), warnings: Array.from(ctx.warnings) };
}

/** Quick check used by drop zones before doing any real work. */
export function looksLikeDocx(file: { name: string; type: string }): boolean {
  return (
    /\.docx$/i.test(file.name) ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}
