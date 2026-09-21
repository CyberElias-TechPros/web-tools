/**
 * HTML → RichDocument importer.
 *
 * Uses the browser's DOMParser (or any DOM implementation such as jsdom in
 * tests) and walks the tree, mapping semantic elements onto the neutral
 * document model used by every converter in this app. Scripts, styles and
 * layout wrappers are ignored; text formatting, lists, tables, images
 * (data: URIs only — remote fetches never happen) and links are preserved.
 */

import type { Alignment, Block, Inline, Paragraph, ParagraphStyle, RichDocument, TableRow, TextRun } from './richdoc';
import { mergeRuns } from './richdoc';
import { base64ToBytes } from './encoding';

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  href?: string;
  color?: string;
}

const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'figure', 'figcaption', 'hr', 'br', 'address', 'details', 'summary', 'dl', 'dt', 'dd', 'form', 'fieldset']);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed', 'svg', 'canvas', 'video', 'audio', 'button', 'input', 'select', 'textarea']);

function parseDom(html: string): Document {
  if (typeof DOMParser === 'undefined') throw new Error('HTML import needs a browser environment.');
  return new DOMParser().parseFromString(html, 'text/html');
}

function alignmentOf(el: Element): Alignment | undefined {
  const style = (el.getAttribute('style') ?? '').toLowerCase();
  const m = /text-align\s*:\s*(left|center|right|justify)/.exec(style);
  if (m) return m[1] as Alignment;
  const attr = el.getAttribute('align')?.toLowerCase();
  if (attr === 'center' || attr === 'right' || attr === 'justify' || attr === 'left') return attr;
  return undefined;
}

function cssColor(el: Element): string | undefined {
  const style = el.getAttribute('style') ?? '';
  const m = /(?:^|;)\s*color\s*:\s*#([0-9a-f]{6})\b/i.exec(style);
  return m ? m[1]!.toUpperCase() : undefined;
}

function dataUriImage(src: string, alt: string): Block | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp|bmp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/i.exec(src.trim());
  if (!m) return null;
  try {
    const type = m[1]!.toLowerCase().replace('image/jpg', 'image/jpeg');
    const data = base64ToBytes(m[2]!.replace(/\s+/g, ''));
    return { kind: 'image', image: { data, type, width: 0, height: 0, alt: alt || undefined } };
  } catch {
    return null;
  }
}

class Importer {
  blocks: Block[] = [];
  warnings = new Set<string>();
  private runs: Inline[] = [];
  private style: ParagraphStyle = 'normal';
  private align: Alignment | undefined;
  private listStack: Array<{ ordered: boolean; index: number }> = [];
  private currentList: Paragraph['list'] | undefined;
  private inPre = 0;

  flush(): void {
    const runs = mergeRuns(this.runs).filter((r) => r.kind !== 'text' || r.text.length > 0);
    const hasText = runs.some((r) => (r.kind === 'text' && r.text.trim()) || r.kind === 'image');
    if (hasText) {
      const para: Paragraph = { kind: 'paragraph', runs, style: this.style };
      if (this.align) para.align = this.align;
      if (this.currentList) para.list = { ...this.currentList };
      this.blocks.push(para);
    }
    this.runs = [];
  }

  pushText(text: string, style: RunStyle): void {
    if (!text) return;
    const run: TextRun = { kind: 'text', text, ...style };
    this.runs.push(run);
  }

  walk(node: Node, style: RunStyle): void {
    if (node.nodeType === 3) {
      let text = node.nodeValue ?? '';
      if (!this.inPre) {
        text = text.replace(/\s+/g, ' ');
        if (!this.runs.length && !text.trim()) return;
      }
      if (this.inPre) {
        const lines = text.split('\n');
        lines.forEach((line, i) => {
          if (i > 0) this.runs.push({ kind: 'break' });
          this.pushText(line, style);
        });
      } else this.pushText(text, style);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true') return;

    switch (tag) {
      case 'br':
        this.runs.push({ kind: 'break' });
        return;
      case 'hr':
        this.flush();
        this.blocks.push({ kind: 'rule' });
        return;
      case 'img': {
        const block = dataUriImage(el.getAttribute('src') ?? '', el.getAttribute('alt') ?? '');
        if (block && block.kind === 'image') {
          const w = Number(el.getAttribute('width'));
          const h = Number(el.getAttribute('height'));
          if (w > 0 && h > 0) {
            block.image.width = w * 0.75;
            block.image.height = h * 0.75;
          }
          this.runs.push({ kind: 'image', image: block.image });
        } else if (el.getAttribute('src')) {
          this.warnings.add('External images are not downloaded; only inline data: images are embedded.');
        }
        return;
      }
      case 'table':
        this.flush();
        this.blocks.push(this.table(el));
        return;
      case 'pre': {
        this.flush();
        const prevStyle = this.style;
        this.style = 'code';
        this.inPre++;
        const codeChild = el.children.length === 1 && el.children[0]!.tagName.toLowerCase() === 'code' ? el.children[0]! : null;
        const lang = /language-([\w-]+)/.exec(codeChild?.getAttribute('class') ?? el.getAttribute('class') ?? '')?.[1];
        for (const child of Array.from(el.childNodes)) this.walk(child, { ...style, code: true });
        this.inPre--;
        const runs = mergeRuns(this.runs);
        this.runs = [];
        if (runs.length) {
          const para: Paragraph = { kind: 'paragraph', runs, style: 'code' };
          if (lang) para.language = lang;
          this.blocks.push(para);
        }
        this.style = prevStyle;
        return;
      }
      case 'ul':
      case 'ol': {
        this.flush();
        const start = Number(el.getAttribute('start')) || 1;
        this.listStack.push({ ordered: tag === 'ol', index: start - 1 });
        for (const child of Array.from(el.children)) {
          if (child.tagName.toLowerCase() === 'li') this.listItem(child, style);
          else this.walk(child, style);
        }
        this.listStack.pop();
        return;
      }
      case 'li':
        this.listItem(el, style);
        return;
    }

    // Inline formatting.
    const next: RunStyle = { ...style };
    if (tag === 'b' || tag === 'strong') next.bold = true;
    if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn' || tag === 'var') next.italic = true;
    if (tag === 'u' || tag === 'ins') next.underline = true;
    if (tag === 's' || tag === 'del' || tag === 'strike') next.strike = true;
    if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') next.code = true;
    if (tag === 'sup') next.superscript = true;
    if (tag === 'sub') next.subscript = true;
    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href && /^(https?:|mailto:|tel:)/i.test(href)) next.href = href;
    }
    const color = cssColor(el);
    if (color) next.color = color;
    const fontWeight = /font-weight\s*:\s*(bold|[6-9]00)/i.test(el.getAttribute('style') ?? '');
    if (fontWeight) next.bold = true;
    if (/font-style\s*:\s*italic/i.test(el.getAttribute('style') ?? '')) next.italic = true;

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) {
      this.flush();
      const prevStyle = this.style;
      const prevAlign = this.align;
      if (/^h[1-6]$/.test(tag)) this.style = tag as ParagraphStyle;
      else if (tag === 'blockquote') this.style = 'quote';
      else if (tag === 'figcaption') this.style = 'caption';
      else if (tag === 'summary' || tag === 'dt') next.bold = true;
      const align = alignmentOf(el);
      if (align) this.align = align;
      for (const child of Array.from(el.childNodes)) this.walk(child, next);
      this.flush();
      this.style = prevStyle;
      this.align = prevAlign;
      return;
    }

    for (const child of Array.from(el.childNodes)) this.walk(child, next);
  }

  private listItem(el: Element, style: RunStyle): void {
    const top = this.listStack[this.listStack.length - 1] ?? { ordered: false, index: 0 };
    top.index++;
    const info: Paragraph['list'] = { ordered: top.ordered, level: Math.max(0, this.listStack.length - 1), index: top.index };
    const checkbox = el.querySelector(':scope > input[type=checkbox]');
    if (checkbox) info.checked = checkbox.hasAttribute('checked');
    const prevList = this.currentList;
    this.currentList = info;
    this.flush();
    for (const child of Array.from(el.childNodes)) {
      const childTag = child.nodeType === 1 ? (child as Element).tagName.toLowerCase() : '';
      if (childTag === 'ul' || childTag === 'ol') {
        this.flush();
        this.currentList = undefined;
        this.walk(child, style);
        this.currentList = info;
      } else this.walk(child, style);
    }
    this.flush();
    this.currentList = prevList;
  }

  private table(el: Element): Block {
    const rows: TableRow[] = [];
    for (const tr of Array.from(el.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr'))) {
      const cells = Array.from(tr.children).filter((c) => /^t[hd]$/i.test(c.tagName));
      if (!cells.length) continue;
      const isHeader = cells.every((c) => c.tagName.toLowerCase() === 'th') || tr.parentElement?.tagName.toLowerCase() === 'thead';
      rows.push({
        header: isHeader,
        cells: cells.map((c) => {
          const sub = new Importer();
          sub.inPre = 0;
          for (const child of Array.from(c.childNodes)) sub.walk(child, {});
          sub.flush();
          for (const w of sub.warnings) this.warnings.add(w);
          const span = Number(c.getAttribute('colspan')) || 1;
          const align = alignmentOf(c);
          return { blocks: sub.blocks.length ? sub.blocks : [{ kind: 'paragraph', runs: [], style: 'normal' }], header: c.tagName.toLowerCase() === 'th', ...(span > 1 ? { colSpan: span } : {}), ...(align ? { align } : {}) };
        }),
      });
    }
    return { kind: 'table', rows };
  }
}

export function parseHtmlDocument(html: string): RichDocument {
  const dom = parseDom(html);
  const importer = new Importer();
  const root = dom.body ?? dom.documentElement;
  for (const child of Array.from(root.childNodes)) importer.walk(child, {});
  importer.flush();
  const title = dom.querySelector('title')?.textContent?.trim() || undefined;
  const author = dom.querySelector('meta[name="author"]')?.getAttribute('content') ?? undefined;
  return { blocks: importer.blocks, meta: { title, author: author || undefined }, warnings: [...importer.warnings] };
}
