/**
 * Markdown → RichDocument.
 *
 * A pragmatic CommonMark + GFM subset: ATX/setext headings, paragraphs, hard
 * breaks, emphasis, strikethrough, code spans, links, images (data URIs are
 * embedded), autolinks, fenced and indented code, block quotes, nested
 * ordered/unordered/task lists, tables, thematic breaks, front matter and a
 * safe subset of inline HTML. Everything the renderer does not understand
 * degrades to plain text rather than disappearing.
 */

import type { Alignment, Block, DocImage, Inline, Paragraph, ParagraphStyle, RichDocument, TableCell, TableRow } from '@/lib/richdoc';
import { mergeRuns } from '@/lib/richdoc';

interface Ctx {
  listDepth: number;
  warnings: Set<string>;
  quote: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  bull: '•', middot: '·', times: '×', divide: '÷', deg: '°', euro: '€', pound: '£', yen: '¥', cent: '¢',
  para: '¶', sect: '§', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', hearts: '♥', check: '✓',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code < 0x110000) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    return ENTITIES[body] ?? match;
  });
}

/* -------------------------------------------------------------------------- */
/* Block-level helpers                                                        */
/* -------------------------------------------------------------------------- */

const RE_ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RE_FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const RE_HR = /^ {0,3}((?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const RE_BULLET = /^( {0,3})([-*+])([ \t]+|$)(.*)$/;
const RE_ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)(.*)$/;
const RE_QUOTE = /^ {0,3}>[ ]?(.*)$/;
const RE_TABLE_SEP = /^ {0,3}\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const RE_SETEXT_H1 = /^ {0,3}=+[ \t]*$/;
const RE_SETEXT_H2 = /^ {0,3}-+[ \t]*$/;
const RE_HTML_BLOCK = /^ {0,3}<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/;
const RE_PAGE_BREAK = /page-break-(?:after|before)\s*:\s*always|break-(?:after|before)\s*:\s*page/i;

function isBlank(line: string): boolean {
  return /^\s*$/.test(line);
}

function expandTabs(line: string): string {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(4 - (out.length % 4));
    else out += ch;
  }
  return out;
}

function stripIndent(line: string, count: number): string {
  let removed = 0;
  let i = 0;
  while (i < line.length && removed < count && line[i] === ' ') {
    i++;
    removed++;
  }
  return line.slice(i);
}

function startsBlock(line: string): boolean {
  return (
    RE_ATX.test(line) ||
    RE_FENCE_OPEN.test(line) ||
    RE_HR.test(line) ||
    RE_BULLET.test(line) ||
    RE_ORDERED.test(line) ||
    RE_QUOTE.test(line) ||
    RE_HTML_BLOCK.test(line)
  );
}

function tableAlignments(sep: string): Alignment[] {
  return sep
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => {
      const c = cell.trim();
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/* -------------------------------------------------------------------------- */
/* Block parser                                                               */
/* -------------------------------------------------------------------------- */

export function parseMarkdown(source: string): RichDocument {
  const warnings = new Set<string>();
  let lines = source.replace(/\r\n?/g, '\n').split('\n').map(expandTabs);
  const meta: RichDocument['meta'] = {};

  // YAML front matter.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const m = /^(title|author|subject)\s*:\s*(.+)$/i.exec(line);
        if (m) {
          const value = m[2]!.trim().replace(/^["']|["']$/g, '');
          if (m[1]!.toLowerCase() === 'title') meta.title = value;
          if (m[1]!.toLowerCase() === 'author') meta.author = value;
          if (m[1]!.toLowerCase() === 'subject') meta.subject = value;
        }
      }
      lines = lines.slice(end + 1);
    }
  }

  const blocks = parseBlocks(lines, { listDepth: 0, warnings, quote: false });
  return { blocks, meta, warnings: Array.from(warnings) };
}

function parseBlocks(lines: string[], ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const paraStyle: ParagraphStyle = ctx.quote ? 'quote' : 'normal';

  while (i < lines.length) {
    const line = lines[i]!;

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = RE_FENCE_OPEN.exec(line);
    if (fence) {
      const indent = fence[1]!.length;
      const marker = fence[2]!;
      const language = fence[3] ?? '';
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const current = lines[i]!;
        if (new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`).test(current)) {
          i++;
          break;
        }
        body.push(stripIndent(current, indent));
        i++;
      }
      const para: Paragraph = { kind: 'paragraph', style: 'code', runs: [{ kind: 'text', text: body.join('\n') }] };
      if (language) para.language = language;
      blocks.push(para);
      continue;
    }

    // Indented code block (only outside lists to avoid eating nested content).
    if (/^ {4}/.test(line) && ctx.listDepth === 0 && blocks[blocks.length - 1]?.kind !== 'paragraph') {
      const body: string[] = [];
      while (i < lines.length && (/^ {4}/.test(lines[i]!) || isBlank(lines[i]!))) {
        body.push(stripIndent(lines[i]!, 4));
        i++;
      }
      while (body.length && isBlank(body[body.length - 1]!)) body.pop();
      blocks.push({ kind: 'paragraph', style: 'code', runs: [{ kind: 'text', text: body.join('\n') }] });
      continue;
    }

    // ATX heading.
    const atx = RE_ATX.exec(line);
    if (atx) {
      const level = atx[1]!.length;
      blocks.push({ kind: 'paragraph', style: `h${level}` as ParagraphStyle, runs: parseInline(atx[2] ?? '', ctx) });
      i++;
      continue;
    }

    // Thematic break (checked before lists because `* * *` also matches a bullet).
    if (RE_HR.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    // Block quote.
    if (RE_QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const current = lines[i]!;
        const m = RE_QUOTE.exec(current);
        if (m) {
          inner.push(m[1] ?? '');
          i++;
        } else if (!isBlank(current) && inner.length && !isBlank(inner[inner.length - 1]!) && !startsBlock(current)) {
          inner.push(current); // lazy continuation
          i++;
        } else {
          break;
        }
      }
      blocks.push(...parseBlocks(inner, { ...ctx, quote: true }));
      continue;
    }

    // Lists.
    const bullet = RE_BULLET.exec(line);
    const ordered = RE_ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const markerChar = isOrdered ? ordered![3]! : bullet![2]!;
      let index = isOrdered ? Number(ordered![2]) : 1;
      while (i < lines.length) {
        const current = lines[i]!;
        const m = isOrdered ? RE_ORDERED.exec(current) : RE_BULLET.exec(current);
        if (!m || (isOrdered ? m[3] !== markerChar : m[2] !== markerChar)) break;
        if (RE_HR.test(current)) break;
        const leading = m[1]!.length;
        const markerWidth = isOrdered ? m[2]!.length + 1 : 1;
        const spaces = (isOrdered ? m[4]! : m[3]!).length;
        const rest = isOrdered ? m[5]! : m[4]!;
        // Content column: marker + 1..4 spaces (5+ spaces means indented code, use 1).
        const contentIndent = leading + markerWidth + (spaces >= 5 || spaces === 0 ? 1 : spaces);
        const itemLines: string[] = [rest];
        i++;
        while (i < lines.length) {
          const next = lines[i]!;
          if (isBlank(next)) {
            // A blank line ends the item unless the following line is indented enough.
            let j = i;
            while (j < lines.length && isBlank(lines[j]!)) j++;
            if (j < lines.length && /^ +/.test(lines[j]!) && (lines[j]!.match(/^ */)?.[0].length ?? 0) >= contentIndent) {
              for (; i < j; i++) itemLines.push('');
              continue;
            }
            break;
          }
          const indentLen = next.match(/^ */)?.[0].length ?? 0;
          if (indentLen >= contentIndent) {
            itemLines.push(next.slice(contentIndent));
            i++;
            continue;
          }
          // Lazy continuation: plain paragraph text directly after the item.
          const last = itemLines[itemLines.length - 1] ?? '';
          if (!isBlank(last) && !startsBlock(next) && !RE_TABLE_SEP.test(next)) {
            itemLines.push(next.trim());
            i++;
            continue;
          }
          break;
        }

        // Task list marker.
        let checked: boolean | undefined;
        const task = /^\[([ xX])\][ \t]+(.*)$/.exec(itemLines[0] ?? '');
        if (task) {
          checked = task[1] !== ' ';
          itemLines[0] = task[2] ?? '';
        }

        const itemBlocks = parseBlocks(itemLines, { ...ctx, listDepth: ctx.listDepth + 1, quote: false });
        const first = itemBlocks[0];
        const listInfo = { ordered: isOrdered, level: ctx.listDepth, index, checked, marker: isOrdered ? `${index}.` : undefined };
        if (first && first.kind === 'paragraph' && !first.list && first.style !== 'code') {
          first.list = listInfo;
          if (ctx.quote) first.style = 'quote';
        } else {
          itemBlocks.unshift({ kind: 'paragraph', style: paraStyle, runs: [], list: listInfo });
        }
        for (const block of itemBlocks.slice(1)) {
          if (block.kind === 'paragraph' && !block.list) block.indent = (block.indent ?? 0) + 18;
        }
        blocks.push(...itemBlocks);
        index++;
      }
      continue;
    }

    // HTML block: page breaks, otherwise keep the text content.
    const html = RE_HTML_BLOCK.exec(line);
    if (html && !html[1]) {
      const tag = html[2]!.toLowerCase();
      const buffer: string[] = [];
      while (i < lines.length && !isBlank(lines[i]!)) {
        buffer.push(lines[i]!);
        i++;
      }
      const raw = buffer.join('\n');
      if (RE_PAGE_BREAK.test(raw)) {
        blocks.push({ kind: 'pageBreak' });
      } else if (tag === 'br' || tag === 'hr') {
        if (tag === 'hr') blocks.push({ kind: 'rule' });
      } else if (tag === 'img') {
        const run = parseInline(raw, ctx).find((r) => r.kind === 'image');
        if (run && run.kind === 'image') blocks.push({ kind: 'image', image: run.image });
      } else {
        const runs = parseInline(raw, ctx);
        if (runs.length) blocks.push({ kind: 'paragraph', style: paraStyle, runs });
      }
      continue;
    }

    // Table: header row, separator row, body rows.
    if (i + 1 < lines.length && line.includes('|') && RE_TABLE_SEP.test(lines[i + 1]!)) {
      const headerCells = splitTableRow(line);
      const aligns = tableAlignments(lines[i + 1]!);
      if (headerCells.length >= 1 && aligns.length === headerCells.length) {
        const rows: TableRow[] = [];
        rows.push({
          header: true,
          cells: headerCells.map((c, idx): TableCell => ({ blocks: [{ kind: 'paragraph', style: 'normal', runs: parseInline(c, ctx) }], header: true, align: aligns[idx] })),
        });
        i += 2;
        while (i < lines.length && !isBlank(lines[i]!) && !startsBlock(lines[i]!)) {
          const cells = splitTableRow(lines[i]!);
          while (cells.length < headerCells.length) cells.push('');
          rows.push({
            cells: cells.slice(0, headerCells.length).map((c, idx): TableCell => ({ blocks: [{ kind: 'paragraph', style: 'normal', runs: parseInline(c, ctx) }], align: aligns[idx] })),
          });
          i++;
        }
        blocks.push({ kind: 'table', rows });
        continue;
      }
    }

    // Paragraph (with setext heading detection).
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i]!;
      if (isBlank(next)) break;
      if (RE_SETEXT_H1.test(next) || (RE_SETEXT_H2.test(next) && !RE_HR.test(next) && para.length > 0)) {
        const level = RE_SETEXT_H1.test(next) ? 1 : 2;
        blocks.push({ kind: 'paragraph', style: `h${level}` as ParagraphStyle, runs: parseInline(para.join('\n'), ctx) });
        i++;
        para.length = 0;
        break;
      }
      if (RE_SETEXT_H2.test(next) && RE_HR.test(next)) {
        // `---` after a paragraph is a setext H2 per CommonMark.
        blocks.push({ kind: 'paragraph', style: 'h2', runs: parseInline(para.join('\n'), ctx) });
        i++;
        para.length = 0;
        break;
      }
      if (startsBlock(next) && !RE_ORDERED.test(next)) break;
      if (RE_ORDERED.test(next) && /^ {0,3}1[.)]/.test(next)) break;
      if (RE_ORDERED.test(next)) {
        para.push(next);
        i++;
        continue;
      }
      if (i + 1 < lines.length && next.includes('|') && RE_TABLE_SEP.test(lines[i + 1]!)) break;
      para.push(next);
      i++;
    }
    if (para.length) {
      blocks.push({ kind: 'paragraph', style: paraStyle, runs: parseInline(para.join('\n'), ctx) });
    }
  }

  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Inline parser                                                              */
/* -------------------------------------------------------------------------- */

interface Style {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  href?: string;
}

function decodeDataUri(uri: string): DocImage | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(uri);
  if (!m) return null;
  try {
    const binary = atob(m[2]!.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { data: bytes, type: m[1]!.toLowerCase(), width: 0, height: 0 };
  } catch {
    return null;
  }
}

function findClosing(text: string, start: number, delimiter: string): number {
  let i = start;
  while (i < text.length) {
    const idx = text.indexOf(delimiter, i);
    if (idx < 0) return -1;
    // Closer must follow non-whitespace and not be escaped.
    const before = text[idx - 1];
    if (idx > start && before && !/\s/.test(before) && text[idx - 1] !== '\\') {
      if (delimiter === '_' || delimiter === '__') {
        const after = text[idx + delimiter.length];
        if (after && /[A-Za-z0-9]/.test(after)) {
          i = idx + delimiter.length;
          continue;
        }
      }
      return idx;
    }
    i = idx + delimiter.length;
  }
  return -1;
}

function parseLinkTarget(text: string, from: number): { href: string; end: number } | null {
  // from points just past '(' — handles <url>, plain url, optional "title".
  let i = from;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  let href: string;
  if (text[i] === '<') {
    const close = text.indexOf('>', i + 1);
    if (close < 0) return null;
    href = text.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const start = i;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      } else if (/\s/.test(ch)) break;
      i++;
    }
    href = text.slice(start, i);
  }
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (text[i] === '"' || text[i] === "'") {
    const quote = text[i]!;
    const close = text.indexOf(quote, i + 1);
    if (close < 0) return null;
    i = close + 1;
    while (i < text.length && /\s/.test(text[i]!)) i++;
  }
  if (text[i] !== ')') return null;
  return { href: href.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1'), end: i + 1 };
}

function findBracketClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '`') {
      // Skip code spans.
      const run = /^`+/.exec(text.slice(i))?.[0] ?? '`';
      const close = text.indexOf(run, i + run.length);
      if (close > 0) {
        i = close + run.length - 1;
        continue;
      }
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const INLINE_TAGS: Record<string, keyof Style | 'br'> = {
  b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline', ins: 'underline',
  s: 'strike', del: 'strike', strike: 'strike', code: 'code', kbd: 'code', sup: 'superscript', sub: 'subscript', br: 'br',
};

export function parseInline(source: string, ctx?: Ctx): Inline[] {
  const runs: Inline[] = [];
  const text = source.replace(/\n[ \t]+/g, '\n');
  const styleStack: Style[] = [{}];
  const tagStack: Array<keyof Style> = [];
  let buffer = '';

  const current = (): Style => styleStack[styleStack.length - 1]!;
  const flush = (): void => {
    if (!buffer) return;
    runs.push({ kind: 'text', text: buffer, ...current() });
    buffer = '';
  };
  const emit = (content: string, style: Style): void => {
    flush();
    if (content) runs.push({ kind: 'text', text: content, ...style });
  };
  const emitRuns = (inner: Inline[], style: Style): void => {
    flush();
    for (const run of inner) {
      if (run.kind === 'text') runs.push({ ...run, ...style, text: run.text });
      else runs.push(run);
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const rest = text.slice(i);

    // Backslash escapes and hard line breaks.
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === '\n') {
        flush();
        runs.push({ kind: 'break' });
        i += 2;
        continue;
      }
      if (next && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(next)) {
        buffer += next;
        i += 2;
        continue;
      }
      buffer += ch;
      i++;
      continue;
    }

    if (ch === '\n') {
      // Two trailing spaces = hard break; otherwise a soft break becomes a space.
      if (buffer.endsWith('  ')) {
        buffer = buffer.replace(/ +$/, '');
        flush();
        runs.push({ kind: 'break' });
      } else {
        buffer = buffer.replace(/ +$/, '') + ' ';
      }
      i++;
      continue;
    }

    // Code span.
    if (ch === '`') {
      const run = /^`+/.exec(rest)![0];
      const close = text.indexOf(run, i + run.length);
      if (close > 0) {
        let code = text.slice(i + run.length, close).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        emit(code, { ...current(), code: true });
        i = close + run.length;
        continue;
      }
      buffer += run;
      i += run.length;
      continue;
    }

    // Images.
    if (ch === '!' && text[i + 1] === '[') {
      const close = findBracketClose(text, i + 1);
      if (close > 0 && text[close + 1] === '(') {
        const target = parseLinkTarget(text, close + 2);
        if (target) {
          const alt = text.slice(i + 2, close);
          const image = decodeDataUri(target.href);
          flush();
          if (image) {
            image.alt = alt;
            runs.push({ kind: 'image', image });
          } else {
            ctx?.warnings.add('Remote images cannot be fetched from the browser sandbox and were replaced with their alt text.');
            runs.push({ kind: 'text', text: alt ? `[${alt}]` : '', ...current(), italic: true });
          }
          i = target.end;
          continue;
        }
      }
    }

    // Links.
    if (ch === '[') {
      const close = findBracketClose(text, i);
      if (close > 0 && text[close + 1] === '(') {
        const target = parseLinkTarget(text, close + 2);
        if (target) {
          const inner = parseInline(text.slice(i + 1, close), ctx);
          emitRuns(inner, { ...current(), href: target.href });
          i = target.end;
          continue;
        }
      }
      // Task markers inside paragraphs and footnotes fall through as text.
    }

    // Autolinks <https://…> and inline HTML.
    if (ch === '<') {
      const auto = /^<((?:https?|mailto|ftp):[^\s<>]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)>/i.exec(rest);
      if (auto) {
        const url = auto[1]!;
        const href = /^[\w.+-]+@/.test(url) ? `mailto:${url}` : url;
        emit(url, { ...current(), href });
        i += auto[0].length;
        continue;
      }
      const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/.exec(rest);
      if (tag) {
        const name = tag[2]!.toLowerCase();
        const closing = tag[1] === '/';
        const mapped = INLINE_TAGS[name];
        if (mapped === 'br') {
          flush();
          runs.push({ kind: 'break' });
        } else if (mapped && !closing) {
          flush();
          styleStack.push({ ...current(), [mapped]: true });
          tagStack.push(mapped);
        } else if (mapped && closing) {
          flush();
          const idx = tagStack.lastIndexOf(mapped);
          if (idx >= 0) {
            tagStack.splice(idx, 1);
            styleStack.splice(idx + 1, 1);
          }
        } else if (name === 'img') {
          const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1];
          const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag[0])?.[1] ?? '';
          const image = src ? decodeDataUri(src) : null;
          flush();
          if (image) {
            image.alt = alt;
            runs.push({ kind: 'image', image });
          } else if (alt) {
            runs.push({ kind: 'text', text: `[${alt}]`, ...current(), italic: true });
          }
        } else if (name === 'a' && !closing) {
          const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1];
          flush();
          styleStack.push({ ...current(), href });
          tagStack.push('href');
        } else if (name === 'a' && closing) {
          flush();
          const idx = tagStack.lastIndexOf('href');
          if (idx >= 0) {
            tagStack.splice(idx, 1);
            styleStack.splice(idx + 1, 1);
          }
        }
        // Unknown tags are dropped, their content kept.
        i += tag[0].length;
        continue;
      }
      const comment = /^<!--[\s\S]*?-->/.exec(rest);
      if (comment) {
        i += comment[0].length;
        continue;
      }
    }

    // Entities.
    if (ch === '&') {
      const ent = /^&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/i.exec(rest);
      if (ent) {
        buffer += decodeEntities(ent[0]);
        i += ent[0].length;
        continue;
      }
    }

    // Emphasis, strong, strikethrough.
    if (ch === '*' || ch === '_' || ch === '~') {
      const run = new RegExp(`^\\${ch}+`).exec(rest)![0];
      const after = text[i + run.length];
      const before = text[i - 1];
      const canOpen = after !== undefined && !/\s/.test(after) && (ch !== '_' || !before || !/[A-Za-z0-9]/.test(before));
      if (canOpen) {
        const tryLengths = ch === '~' ? [2] : run.length >= 3 ? [3, 2, 1] : run.length === 2 ? [2, 1] : [1];
        let matched = false;
        for (const len of tryLengths) {
          if (run.length < len) continue;
          const delimiter = ch.repeat(len);
          const close = findClosing(text, i + len, delimiter);
          if (close < 0) continue;
          const inner = parseInline(text.slice(i + len, close), ctx);
          const style: Style = { ...current() };
          if (ch === '~') style.strike = true;
          else if (len === 3) {
            style.bold = true;
            style.italic = true;
          } else if (len === 2) style.bold = true;
          else style.italic = true;
          emitRuns(inner, style);
          i = close + len;
          matched = true;
          break;
        }
        if (matched) continue;
      }
      buffer += run;
      i += run.length;
      continue;
    }

    // Bare URLs (GFM autolink literal).
    if ((ch === 'h' || ch === 'w') && /^(https?:\/\/|www\.)[^\s<]+/i.test(rest) && (!text[i - 1] || /[\s(]/.test(text[i - 1]!))) {
      let url = /^(https?:\/\/|www\.)[^\s<]+/i.exec(rest)![0];
      url = url.replace(/[.,:;!?)\]]+$/, '');
      emit(url, { ...current(), href: url.startsWith('www.') ? `https://${url}` : url });
      i += url.length;
      continue;
    }

    buffer += ch;
    i++;
  }
  flush();

  const cleaned = mergeRuns(runs).filter((r) => r.kind !== 'text' || r.text.length > 0);
  // Trim leading/trailing whitespace of the whole run list.
  const first = cleaned[0];
  if (first?.kind === 'text') first.text = first.text.replace(/^\s+/, '');
  const last = cleaned[cleaned.length - 1];
  if (last?.kind === 'text') last.text = last.text.replace(/\s+$/, '');
  return cleaned.filter((r) => r.kind !== 'text' || r.text.length > 0);
}
