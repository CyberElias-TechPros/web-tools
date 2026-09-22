/**
 * CSS beautifier and minifier plus a lightweight HTML pretty-printer.
 * Tokenises strings/comments correctly so URLs, data: URIs and content
 * strings survive intact.
 */

export interface CssFormatOptions {
  indent: string;
  preserveComments: boolean;
  blankLineBetweenRules: boolean;
}

export const defaultCssFormatOptions: CssFormatOptions = { indent: '  ', preserveComments: true, blankLineBetweenRules: true };

type CssToken = { type: 'comment' | 'string' | 'text' | 'brace-open' | 'brace-close' | 'semicolon'; value: string };

function tokenizeCss(src: string): CssToken[] {
  const tokens: CssToken[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf.trim()) tokens.push({ type: 'text', value: buf });
    buf = '';
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '/' && src[i + 1] === '*') {
      flush();
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      tokens.push({ type: 'comment', value: src.slice(i, stop) });
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') j++;
        j++;
      }
      buf += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '(' && /url$/i.test(buf)) {
      // url(...) may be unquoted and contain semicolons.
      const end = src.indexOf(')', i);
      const stop = end < 0 ? src.length : end + 1;
      buf += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '{') {
      flush();
      tokens.push({ type: 'brace-open', value: '{' });
      i++;
      continue;
    }
    if (ch === '}') {
      flush();
      tokens.push({ type: 'brace-close', value: '}' });
      i++;
      continue;
    }
    if (ch === ';') {
      flush();
      tokens.push({ type: 'semicolon', value: ';' });
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return tokens;
}

function normalizeSelector(sel: string): string {
  const trimmed = sel.replace(/\s+/g, ' ').trim();
  if (trimmed.startsWith('@')) return trimmed.replace(/\(\s*([\w-]+)\s*:\s*/g, '($1: ').replace(/\s*,\s*/g, ', ');
  return trimmed.replace(/\s*,\s*/g, ',\n').replace(/\s*([>+~])\s*/g, ' $1 ');
}

function normalizeDeclaration(decl: string): string {
  const idx = decl.indexOf(':');
  if (idx < 0) return decl.trim();
  const prop = decl.slice(0, idx).trim();
  let value = decl.slice(idx + 1).trim().replace(/\s+/g, ' ');
  value = value.replace(/\s*,\s*(?![^(]*\))/g, ', ');
  return `${prop}: ${value}`;
}

export function formatCss(src: string, options: Partial<CssFormatOptions> = {}): string {
  const opts = { ...defaultCssFormatOptions, ...options };
  const tokens = tokenizeCss(src);
  const out: string[] = [];
  let depth = 0;
  let pending = '';
  const pad = () => opts.indent.repeat(depth);
  let lastWasClose = false;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    switch (tok.type) {
      case 'comment':
        if (opts.preserveComments) {
          if (lastWasClose && opts.blankLineBetweenRules && depth === 0) out.push('');
          out.push(pad() + tok.value.trim());
        }
        lastWasClose = false;
        break;
      case 'text':
        pending += tok.value;
        break;
      case 'brace-open': {
        const selector = normalizeSelector(pending);
        pending = '';
        if (lastWasClose && opts.blankLineBetweenRules && depth === 0) out.push('');
        else if (lastWasClose && depth > 0) out.push('');
        const lines = selector.split('\n');
        lines.forEach((l, idx) => out.push(pad() + l.trim() + (idx === lines.length - 1 ? ' {' : '')));
        depth++;
        lastWasClose = false;
        break;
      }
      case 'semicolon': {
        const decl = pending.trim();
        pending = '';
        if (decl) out.push(`${pad()}${normalizeDeclaration(decl)};`);
        lastWasClose = false;
        break;
      }
      case 'brace-close': {
        const decl = pending.trim();
        pending = '';
        if (decl) out.push(`${pad()}${normalizeDeclaration(decl)};`);
        depth = Math.max(0, depth - 1);
        out.push(`${pad()}}`);
        lastWasClose = true;
        break;
      }
    }
  }
  if (pending.trim()) out.push(pad() + pending.trim());
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function minifyCss(src: string, keepImportantComments = true): string {
  const tokens = tokenizeCss(src);
  let out = '';
  for (const tok of tokens) {
    switch (tok.type) {
      case 'comment':
        if (keepImportantComments && tok.value.startsWith('/*!')) out += tok.value;
        break;
      case 'text':
        out += tok.value.replace(/\s+/g, ' ').trim().replace(/\s*([:,>+~])\s*(?![^(]*\))/g, '$1');
        break;
      case 'brace-open':
        out = out.replace(/\s+$/, '') + '{';
        break;
      case 'brace-close':
        out = out.replace(/;$/, '') + '}';
        break;
      case 'semicolon':
        out += ';';
        break;
    }
  }
  return out
    .replace(/;}/g, '}')
    .replace(/:\s+/g, ':')
    .replace(/\s*{\s*/g, '{')
    .replace(/}\s*/g, '}')
    .replace(/(^|[^0-9.])0(\.\d+)/g, '$1$2')
    .replace(/(^|[^0-9.\w-])0(?:px|em|rem|pt|vh|vw)(?![\w-])/g, (_, pre: string) => `${pre}0`)
    .replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3(?![0-9a-f])/gi, '#$1$2$3')
    .trim();
}

export function cssStats(src: string): { rules: number; declarations: number; selectors: number; comments: number; bytes: number } {
  const tokens = tokenizeCss(src);
  let rules = 0;
  let declarations = 0;
  let selectors = 0;
  let comments = 0;
  let pending = '';
  for (const tok of tokens) {
    if (tok.type === 'comment') comments++;
    else if (tok.type === 'text') pending += tok.value;
    else if (tok.type === 'brace-open') {
      if (!pending.trim().startsWith('@')) {
        rules++;
        selectors += pending.split(',').filter((s) => s.trim()).length;
      }
      pending = '';
    } else if (tok.type === 'semicolon' || tok.type === 'brace-close') {
      if (pending.includes(':')) declarations++;
      pending = '';
    }
  }
  return { rules, declarations, selectors, comments, bytes: new TextEncoder().encode(src).length };
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                       */
/* -------------------------------------------------------------------------- */

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const INLINE_ELEMENTS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'label', 'button']);
const RAW_TEXT = new Set(['script', 'style', 'pre', 'textarea']);

export function formatHtml(src: string, indent = '  '): string {
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  const n = src.length;
  let inlineBuffer = '';
  const flushInline = () => {
    const text = inlineBuffer.replace(/\s+/g, ' ').trim();
    if (text) out.push(indent.repeat(depth) + text);
    inlineBuffer = '';
  };
  while (i < n) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i);
      const stop = end < 0 ? n : end + 3;
      flushInline();
      out.push(indent.repeat(depth) + src.slice(i, stop).trim());
      i = stop;
      continue;
    }
    if (src[i] === '<') {
      const end = src.indexOf('>', i);
      if (end < 0) {
        inlineBuffer += src.slice(i);
        break;
      }
      const tag = src.slice(i, end + 1);
      const m = /^<\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tag);
      const name = m?.[1]?.toLowerCase() ?? '';
      const isClose = tag.startsWith('</');
      const isDoctype = tag.startsWith('<!');
      const selfClosing = tag.endsWith('/>') || VOID_ELEMENTS.has(name);
      if (INLINE_ELEMENTS.has(name) && !isDoctype) {
        inlineBuffer += tag;
        i = end + 1;
        continue;
      }
      flushInline();
      if (isClose) {
        depth = Math.max(0, depth - 1);
        out.push(indent.repeat(depth) + tag.replace(/\s+/g, ' '));
        i = end + 1;
        continue;
      }
      out.push(indent.repeat(depth) + tag.replace(/\s+/g, ' ').replace(/\s+>/, '>'));
      i = end + 1;
      if (RAW_TEXT.has(name) && !selfClosing) {
        const closeIdx = src.toLowerCase().indexOf(`</${name}`, i);
        const stop = closeIdx < 0 ? n : closeIdx;
        const raw = src.slice(i, stop);
        if (raw.trim()) {
          const lines = raw.replace(/^\n+|\s+$/g, '').split('\n');
          const minIndent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
          for (const l of lines) out.push(name === 'pre' || name === 'textarea' ? l : indent.repeat(depth + 1) + l.slice(Math.min(minIndent, l.length)));
        }
        i = stop;
        continue;
      }
      if (!selfClosing && !isDoctype) depth++;
      continue;
    }
    const next = src.indexOf('<', i);
    const stop = next < 0 ? n : next;
    inlineBuffer += src.slice(i, stop);
    i = stop;
  }
  flushInline();
  return out.join('\n') + '\n';
}

export function minifyHtml(src: string): string {
  const preserved: string[] = [];
  let out = src.replace(/<(pre|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    preserved.push(m);
    return `\u0000${preserved.length - 1}\u0000`;
  });
  out = out
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+>/g, '>')
    .trim();
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u0000(\d+)\u0000/g, (_, idx: string) => preserved[Number(idx)]!);
}
