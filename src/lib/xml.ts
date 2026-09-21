/**
 * XML tokenizer, validator, pretty-printer, minifier and XML→JSON converter.
 * First-party so error positions are precise and it works off the DOM.
 */

export type XmlToken =
  | { type: 'open'; name: string; attrs: Array<[string, string]>; selfClosing: boolean; pos: number }
  | { type: 'close'; name: string; pos: number }
  | { type: 'text'; value: string; pos: number }
  | { type: 'comment'; value: string; pos: number }
  | { type: 'cdata'; value: string; pos: number }
  | { type: 'pi'; value: string; pos: number }
  | { type: 'doctype'; value: string; pos: number };

export interface XmlError {
  message: string;
  line: number;
  column: number;
  position: number;
}

export interface XmlElement {
  name: string;
  attrs: Array<[string, string]>;
  children: Array<XmlElement | { text: string } | { cdata: string } | { comment: string }>;
}

export interface XmlDocument {
  prolog: XmlToken[];
  root: XmlElement | null;
  tokens: XmlToken[];
}

function position(src: string, pos: number): { line: number; column: number } {
  let line = 1;
  let last = 0;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src[i] === '\n') {
      line++;
      last = i + 1;
    }
  }
  return { line, column: pos - last + 1 };
}

function fail(src: string, pos: number, message: string): never {
  const { line, column } = position(src, pos);
  const err = new Error(`${message} (line ${line}, column ${column})`) as Error & XmlError;
  err.line = line;
  err.column = column;
  err.position = pos;
  err.message = `${message} (line ${line}, column ${column})`;
  throw err;
}

const NAME_START = /[A-Za-z_:\u00C0-\uFFFF]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-\u00B7\u00C0-\uFFFF]/;

export function tokenizeXml(src: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src[i] !== '<') {
      const start = i;
      while (i < n && src[i] !== '<') i++;
      const value = src.slice(start, i);
      if (value.includes(']]>')) fail(src, start + value.indexOf(']]>'), 'The sequence "]]>" is not allowed in text');
      tokens.push({ type: 'text', value, pos: start });
      continue;
    }
    const start = i;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) fail(src, start, 'Unterminated comment');
      const value = src.slice(i + 4, end);
      if (value.includes('--')) fail(src, start, 'Comments may not contain "--"');
      tokens.push({ type: 'comment', value, pos: start });
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end < 0) fail(src, start, 'Unterminated CDATA section');
      tokens.push({ type: 'cdata', value: src.slice(i + 9, end), pos: start });
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end < 0) fail(src, start, 'Unterminated processing instruction');
      tokens.push({ type: 'pi', value: src.slice(i + 2, end), pos: start });
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!DOCTYPE', i) || src.startsWith('<!doctype', i)) {
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']') depth--;
        else if (src[j] === '>' && depth <= 0) break;
      }
      if (j >= n) fail(src, start, 'Unterminated DOCTYPE');
      tokens.push({ type: 'doctype', value: src.slice(i + 2, j), pos: start });
      i = j + 1;
      continue;
    }
    if (src.startsWith('</', i)) {
      i += 2;
      const nameStart = i;
      while (i < n && NAME_CHAR.test(src[i]!)) i++;
      const name = src.slice(nameStart, i);
      if (!name) fail(src, start, 'Expected element name in closing tag');
      while (i < n && /\s/.test(src[i]!)) i++;
      if (src[i] !== '>') fail(src, i, `Expected ">" to close </${name}>`);
      i++;
      tokens.push({ type: 'close', name, pos: start });
      continue;
    }
    // Opening tag
    i++;
    if (i >= n || !NAME_START.test(src[i]!)) fail(src, start, 'Expected element name after "<"');
    const nameStart = i;
    while (i < n && NAME_CHAR.test(src[i]!)) i++;
    const name = src.slice(nameStart, i);
    const attrs: Array<[string, string]> = [];
    let selfClosing = false;
    for (;;) {
      while (i < n && /\s/.test(src[i]!)) i++;
      if (i >= n) fail(src, start, `Unterminated tag <${name}>`);
      if (src[i] === '>') {
        i++;
        break;
      }
      if (src[i] === '/') {
        if (src[i + 1] !== '>') fail(src, i, 'Expected "/>"');
        selfClosing = true;
        i += 2;
        break;
      }
      if (!NAME_START.test(src[i]!)) fail(src, i, `Unexpected character "${src[i]}" in tag <${name}>`);
      const aStart = i;
      while (i < n && NAME_CHAR.test(src[i]!)) i++;
      const aName = src.slice(aStart, i);
      while (i < n && /\s/.test(src[i]!)) i++;
      if (src[i] !== '=') fail(src, i, `Attribute "${aName}" needs a value (="…")`);
      i++;
      while (i < n && /\s/.test(src[i]!)) i++;
      const quote = src[i];
      if (quote !== '"' && quote !== "'") fail(src, i, `Attribute "${aName}" value must be quoted`);
      const vStart = i + 1;
      const vEnd = src.indexOf(quote, vStart);
      if (vEnd < 0) fail(src, i, `Unterminated attribute value for "${aName}"`);
      const value = src.slice(vStart, vEnd);
      if (value.includes('<')) fail(src, vStart, `Attribute "${aName}" contains "<" — escape it as &lt;`);
      if (attrs.some(([k]) => k === aName)) fail(src, aStart, `Duplicate attribute "${aName}"`);
      attrs.push([aName, value]);
      i = vEnd + 1;
    }
    tokens.push({ type: 'open', name, attrs, selfClosing, pos: start });
  }
  return tokens;
}

export function parseXml(src: string): XmlDocument {
  const tokens = tokenizeXml(src);
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  const prolog: XmlToken[] = [];
  let hasRoot = false;
  for (const tok of tokens) {
    const parent = stack[stack.length - 1];
    switch (tok.type) {
      case 'open': {
        const el: XmlElement = { name: tok.name, attrs: tok.attrs, children: [] };
        if (parent) parent.children.push(el);
        else {
          if (hasRoot) fail(src, tok.pos, `Only one root element is allowed (found a second <${tok.name}>)`);
          root = el;
          hasRoot = true;
        }
        if (!tok.selfClosing) stack.push(el);
        break;
      }
      case 'close': {
        if (!parent) fail(src, tok.pos, `Closing tag </${tok.name}> has no matching opening tag`);
        if (parent.name !== tok.name) fail(src, tok.pos, `Expected </${parent.name}> but found </${tok.name}>`);
        stack.pop();
        break;
      }
      case 'text': {
        if (parent) {
          if (tok.value.includes('&')) validateEntities(src, tok.pos, tok.value);
          parent.children.push({ text: tok.value });
        } else if (tok.value.trim()) fail(src, tok.pos, 'Text is not allowed outside the root element');
        break;
      }
      case 'cdata':
        if (!parent) fail(src, tok.pos, 'CDATA is not allowed outside the root element');
        parent.children.push({ cdata: tok.value });
        break;
      case 'comment':
        if (parent) parent.children.push({ comment: tok.value });
        else prolog.push(tok);
        break;
      case 'pi':
      case 'doctype':
        if (parent) fail(src, tok.pos, `${tok.type === 'pi' ? 'Processing instructions' : 'DOCTYPE'} must appear before the root element`);
        if (tok.type === 'doctype' && hasRoot) fail(src, tok.pos, 'DOCTYPE must appear before the root element');
        prolog.push(tok);
        break;
    }
  }
  if (stack.length) {
    const open = stack[stack.length - 1]!;
    fail(src, src.length, `Unclosed element <${open.name}>`);
  }
  if (!root) fail(src, 0, 'Document has no root element');
  return { prolog, root, tokens };
}

function validateEntities(src: string, base: number, text: string): void {
  const re = /&([^;\s<&]*);?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = m[1] ?? '';
    const terminated = m[0].endsWith(';');
    if (!terminated) fail(src, base + m.index, `Unescaped "&" — write it as &amp;`);
    if (/^#x[0-9a-fA-F]+$/.test(body) || /^#\d+$/.test(body)) continue;
    if (['amp', 'lt', 'gt', 'quot', 'apos'].includes(body)) continue;
    if (!/^[A-Za-z_][\w.-]*$/.test(body)) fail(src, base + m.index, `Malformed entity reference "&${body};"`);
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export interface XmlFormatOptions {
  indent: string;
  preserveComments: boolean;
  collapseEmpty: boolean;
  sortAttributes: boolean;
  maxInlineLength: number;
}

export const defaultXmlFormatOptions: XmlFormatOptions = { indent: '  ', preserveComments: true, collapseEmpty: true, sortAttributes: false, maxInlineLength: 60 };

const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');

function renderOpen(el: XmlElement, opts: XmlFormatOptions, selfClose: boolean, compact = false): string {
  const attrs = opts.sortAttributes ? [...el.attrs].sort((a, b) => a[0].localeCompare(b[0])) : el.attrs;
  const a = attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  return `<${el.name}${a}${selfClose ? (compact ? '/>' : ' />') : '>'}`;
}

function isInlineText(el: XmlElement): string | null {
  const meaningful = el.children.filter((c) => !('text' in c) || c.text.trim() !== '');
  if (meaningful.length === 0) return el.children.some((c) => 'text' in c && c.text.length) ? '' : null;
  if (meaningful.length === 1 && 'text' in meaningful[0]!) return meaningful[0].text.trim();
  return null;
}

function formatElement(el: XmlElement, depth: number, opts: XmlFormatOptions, out: string[]): void {
  const pad = opts.indent.repeat(depth);
  const inline = isInlineText(el);
  const meaningful = el.children.filter((c) => !('text' in c) || c.text.trim() !== '').filter((c) => opts.preserveComments || !('comment' in c));
  if (meaningful.length === 0 && (inline === null || inline === '')) {
    out.push(pad + (opts.collapseEmpty ? renderOpen(el, opts, true) : `${renderOpen(el, opts, false)}</${el.name}>`));
    return;
  }
  if (inline !== null && inline.length <= opts.maxInlineLength && !inline.includes('\n')) {
    out.push(`${pad}${renderOpen(el, opts, false)}${inline}</${el.name}>`);
    return;
  }
  out.push(pad + renderOpen(el, opts, false));
  for (const child of meaningful) {
    if ('text' in child) {
      const lines = child.text.trim().split('\n').map((l) => l.trim());
      for (const l of lines) out.push(opts.indent.repeat(depth + 1) + l);
    } else if ('cdata' in child) out.push(`${opts.indent.repeat(depth + 1)}<![CDATA[${child.cdata}]]>`);
    else if ('comment' in child) out.push(`${opts.indent.repeat(depth + 1)}<!--${child.comment}-->`);
    else formatElement(child, depth + 1, opts, out);
  }
  out.push(`${pad}</${el.name}>`);
}

export function formatXml(src: string, options: Partial<XmlFormatOptions> = {}): string {
  const opts = { ...defaultXmlFormatOptions, ...options };
  const doc = parseXml(src);
  const out: string[] = [];
  for (const tok of doc.prolog) {
    if (tok.type === 'pi') out.push(`<?${tok.value.trim()}?>`);
    else if (tok.type === 'doctype') out.push(`<!${tok.value.trim()}>`);
    else if (tok.type === 'comment' && opts.preserveComments) out.push(`<!--${tok.value}-->`);
  }
  if (doc.root) formatElement(doc.root, 0, opts, out);
  return out.join('\n');
}

export function minifyXml(src: string, keepComments = false): string {
  const doc = parseXml(src);
  const parts: string[] = [];
  for (const tok of doc.prolog) {
    if (tok.type === 'pi') parts.push(`<?${tok.value.trim()}?>`);
    else if (tok.type === 'doctype') parts.push(`<!${tok.value.trim()}>`);
    else if (tok.type === 'comment' && keepComments) parts.push(`<!--${tok.value}-->`);
  }
  const walk = (el: XmlElement) => {
    const kids = el.children.filter((c) => !('text' in c) || c.text.trim() !== '').filter((c) => keepComments || !('comment' in c));
    if (!kids.length) {
      parts.push(renderOpen(el, defaultXmlFormatOptions, true, true));
      return;
    }
    parts.push(renderOpen(el, defaultXmlFormatOptions, false));
    for (const child of kids) {
      if ('text' in child) parts.push(child.text.trim().replace(/\s+/g, ' '));
      else if ('cdata' in child) parts.push(`<![CDATA[${child.cdata}]]>`);
      else if ('comment' in child) parts.push(`<!--${child.comment}-->`);
      else walk(child);
    }
    parts.push(`</${el.name}>`);
  };
  if (doc.root) walk(doc.root);
  return parts.join('');
}

/* -------------------------------------------------------------------------- */
/* XML → JSON                                                                 */
/* -------------------------------------------------------------------------- */

export interface XmlToJsonOptions {
  attributePrefix: string;
  textKey: string;
  parseNumbers: boolean;
  compact: boolean;
}

export const defaultXmlToJsonOptions: XmlToJsonOptions = { attributePrefix: '@', textKey: '#text', parseNumbers: true, compact: true };

const ENTITY_MAP: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z_][\w.-]*);/g, (m, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITY_MAP[body] ?? m;
  });
}

function coerce(text: string, parseNumbers: boolean): unknown {
  const t = text.trim();
  if (!parseNumbers) return text;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t) && t.length < 16) return Number(t);
  return text;
}

function elementToJson(el: XmlElement, opts: XmlToJsonOptions): unknown {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of el.attrs) obj[`${opts.attributePrefix}${k}`] = coerce(decodeXmlEntities(v), opts.parseNumbers);
  let text = '';
  const childElements = el.children.filter((c): c is XmlElement => 'name' in c);
  for (const c of el.children) {
    if ('text' in c) text += decodeXmlEntities(c.text);
    else if ('cdata' in c) text += c.cdata;
  }
  const trimmed = text.trim();
  for (const child of childElements) {
    const value = elementToJson(child, opts);
    const existing = obj[child.name];
    if (existing === undefined) obj[child.name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else obj[child.name] = [existing, value];
  }
  if (trimmed) {
    if (!childElements.length && !el.attrs.length && opts.compact) return coerce(trimmed, opts.parseNumbers);
    obj[opts.textKey] = coerce(trimmed, opts.parseNumbers);
  }
  if (!Object.keys(obj).length) return opts.compact ? null : obj;
  return obj;
}

export function xmlToJson(src: string, options: Partial<XmlToJsonOptions> = {}): unknown {
  const opts = { ...defaultXmlToJsonOptions, ...options };
  const doc = parseXml(src);
  if (!doc.root) return null;
  return { [doc.root.name]: elementToJson(doc.root, opts) };
}

/* -------------------------------------------------------------------------- */
/* JSON → XML                                                                 */
/* -------------------------------------------------------------------------- */

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  return JSON.stringify(v);
}

function safeTag(name: string): string {
  let n = name.replace(/[^A-Za-z0-9_.:-]/g, '_');
  if (!n || !/^[A-Za-z_:]/.test(n)) n = `_${n}`;
  return n;
}

export function jsonToXml(value: unknown, options: { rootName?: string; indent?: string; attributePrefix?: string; textKey?: string; itemName?: string; declaration?: boolean } = {}): string {
  const rootName = options.rootName ?? 'root';
  const indent = options.indent ?? '  ';
  const attributePrefix = options.attributePrefix ?? '@';
  const textKey = options.textKey ?? '#text';
  const itemName = options.itemName ?? 'item';
  const lines: string[] = [];
  if (options.declaration !== false) lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  const render = (name: string, v: unknown, depth: number) => {
    const pad = indent.repeat(depth);
    const tag = safeTag(name);
    if (v === null || v === undefined) {
      lines.push(`${pad}<${tag} />`);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) render(tag, item, depth);
      return;
    }
    if (typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>);
      const attrs = entries.filter(([k]) => k.startsWith(attributePrefix) && k !== textKey);
      const text = entries.find(([k]) => k === textKey)?.[1];
      const children = entries.filter(([k]) => !k.startsWith(attributePrefix) && k !== textKey);
      const attrStr = attrs.map(([k, av]) => ` ${safeTag(k.slice(attributePrefix.length))}="${escapeXml(scalar(av))}"`).join('');
      if (!children.length && text === undefined) {
        lines.push(`${pad}<${tag}${attrStr} />`);
        return;
      }
      if (!children.length) {
        lines.push(`${pad}<${tag}${attrStr}>${escapeXml(scalar(text))}</${tag}>`);
        return;
      }
      lines.push(`${pad}<${tag}${attrStr}>`);
      if (text !== undefined) lines.push(`${indent.repeat(depth + 1)}${escapeXml(scalar(text))}`);
      for (const [k, cv] of children) {
        if (Array.isArray(cv)) for (const item of cv) render(k, item, depth + 1);
        else render(k, cv, depth + 1);
      }
      lines.push(`${pad}</${tag}>`);
      return;
    }
    lines.push(`${pad}<${tag}>${escapeXml(scalar(v))}</${tag}>`);
  };

  if (Array.isArray(value)) {
    lines.push(`<${safeTag(rootName)}>`);
    for (const item of value) render(itemName, item, 1);
    lines.push(`</${safeTag(rootName)}>`);
  } else if (value && typeof value === 'object' && Object.keys(value).length === 1 && !Array.isArray(Object.values(value)[0])) {
    const [k, v] = Object.entries(value)[0]!;
    render(k, v, 0);
  } else render(rootName, value, 0);
  return lines.join('\n');
}

export function xmlStats(src: string): { elements: number; attributes: number; depth: number; textNodes: number; comments: number } {
  const doc = parseXml(src);
  let elements = 0;
  let attributes = 0;
  let depth = 0;
  let textNodes = 0;
  let comments = 0;
  const walk = (el: XmlElement, d: number) => {
    elements++;
    attributes += el.attrs.length;
    depth = Math.max(depth, d);
    for (const c of el.children) {
      if ('name' in c) walk(c, d + 1);
      else if ('text' in c && c.text.trim()) textNodes++;
      else if ('comment' in c) comments++;
    }
  };
  if (doc.root) walk(doc.root, 1);
  return { elements, attributes, depth, textNodes, comments };
}
