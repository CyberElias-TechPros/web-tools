/**
 * JSON validation, formatting and repair.
 *
 * `JSON.parse` error messages differ per engine and rarely say *where* the
 * problem is in a way a human can act on. This module runs its own scanner so
 * every error carries a line, a column and a caret-able offset.
 */

export interface JsonError {
  message: string;
  line: number; // 1-based
  column: number; // 1-based
  offset: number; // 0-based index into the source
  /** Short, actionable suggestion shown under the error. */
  hint?: string;
}

export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: JsonError };

function posOf(src: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  const limit = Math.min(offset, src.length);
  for (let i = 0; i < limit; i++) {
    if (src.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: limit - lastBreak };
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

class Scanner {
  i = 0;
  constructor(readonly src: string) {}

  err(message: string, hint?: string, at = this.i): JsonError {
    const { line, column } = posOf(this.src, at);
    return { message, line, column, offset: at, ...(hint ? { hint } : {}) };
  }

  ws(): void {
    while (this.i < this.src.length) {
      const c = this.src.charCodeAt(this.i);
      if (c === 32 || c === 9 || c === 10 || c === 13) this.i++;
      else break;
    }
  }
}

class JsonSyntaxError extends Error {
  constructor(readonly detail: JsonError) {
    super(detail.message);
    this.name = 'JsonSyntaxError';
  }
}

function fail(s: Scanner, message: string, hint?: string, at?: number): never {
  throw new JsonSyntaxError(s.err(message, hint, at));
}

function parseValue(s: Scanner, depth: number): unknown {
  if (depth > 500) fail(s, 'Structure nested too deeply (over 500 levels).');
  s.ws();
  if (s.i >= s.src.length) fail(s, 'Unexpected end of input — a value was expected.');
  const c = s.src[s.i]!;

  switch (c) {
    case '{':
      return parseObject(s, depth);
    case '[':
      return parseArray(s, depth);
    case '"':
      return parseString(s);
    case 't':
      return parseLiteral(s, 'true', true);
    case 'f':
      return parseLiteral(s, 'false', false);
    case 'n':
      return parseLiteral(s, 'null', null);
    default:
      if (c === '-' || (c >= '0' && c <= '9')) return parseNumber(s);
      if (c === "'")
        fail(
          s,
          'Single-quoted string. JSON strings must use double quotes.',
          'Click “Repair” to convert quotes automatically.',
        );
      if (c === '+' || c === '.')
        fail(s, `Invalid number starting with “${c}”.`, 'JSON numbers cannot start with + or .');
      {
        const word = /^[A-Za-z_$][\w$]*/.exec(s.src.slice(s.i))?.[0];
        if (word) {
          if (/^(True|False|None|TRUE|FALSE|NULL|Null|NaN|Infinity|undefined)$/.test(word)) {
            fail(
              s,
              `“${word}” is not valid JSON.`,
              'Use lowercase true, false or null. Python’s True/False/None and JavaScript’s undefined and NaN are not valid JSON.',
            );
          }
          fail(
            s,
            `Unexpected bare word “${word}”.`,
            'Strings must be wrapped in double quotes.',
          );
        }
      }
      fail(s, `Unexpected character “${c}”.`);
  }
}

function parseLiteral<T>(s: Scanner, word: string, value: T): T {
  if (s.src.startsWith(word, s.i)) {
    s.i += word.length;
    return value;
  }
  const got = s.src.slice(s.i, s.i + word.length);
  if (/^(True|False|Null|TRUE|FALSE|NULL|None|undefined|NaN)/.test(s.src.slice(s.i))) {
    fail(
      s,
      `“${got}” is not valid JSON.`,
      'Use lowercase true, false or null. undefined and NaN are not valid JSON.',
    );
  }
  fail(s, `Expected “${word}” but found “${got}”.`);
}

function parseNumber(s: Scanner): number {
  const start = s.i;
  if (s.src[s.i] === '-') s.i++;
  if (s.src[s.i] === '0') {
    s.i++;
    if (/[0-9]/.test(s.src[s.i] ?? ''))
      fail(s, 'Numbers cannot have leading zeros.', 'Write 0.5 instead of 00.5.', start);
  } else {
    const digitsStart = s.i;
    while (/[0-9]/.test(s.src[s.i] ?? '')) s.i++;
    if (s.i === digitsStart) fail(s, 'Invalid number.', undefined, start);
  }
  if (s.src[s.i] === '.') {
    s.i++;
    const fracStart = s.i;
    while (/[0-9]/.test(s.src[s.i] ?? '')) s.i++;
    if (s.i === fracStart) fail(s, 'Missing digits after the decimal point.', undefined, start);
  }
  if (s.src[s.i] === 'e' || s.src[s.i] === 'E') {
    s.i++;
    if (s.src[s.i] === '+' || s.src[s.i] === '-') s.i++;
    const expStart = s.i;
    while (/[0-9]/.test(s.src[s.i] ?? '')) s.i++;
    if (s.i === expStart) fail(s, 'Missing digits in the exponent.', undefined, start);
  }
  return Number(s.src.slice(start, s.i));
}

function parseString(s: Scanner): string {
  const open = s.i;
  s.i++; // consume "
  let out = '';
  while (true) {
    if (s.i >= s.src.length)
      fail(s, 'Unterminated string — no closing quote found.', undefined, open);
    const ch = s.src[s.i]!;
    if (ch === '"') {
      s.i++;
      return out;
    }
    if (ch === '\\') {
      s.i++;
      const esc = s.src[s.i];
      if (esc === undefined) fail(s, 'Unterminated escape sequence.', undefined, open);
      if (esc === 'u') {
        const hex = s.src.slice(s.i + 1, s.i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex))
          fail(s, `Invalid \\u escape: “\\u${hex}”.`, 'It needs exactly four hex digits.');
        out += String.fromCharCode(parseInt(hex, 16));
        s.i += 5;
        continue;
      }
      const mapped = ESCAPES[esc];
      if (mapped === undefined)
        fail(
          s,
          `Invalid escape “\\${esc}”.`,
          'Valid escapes are \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.',
        );
      out += mapped;
      s.i++;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      const name = code === 10 ? 'newline' : code === 9 ? 'tab' : `control character 0x${code.toString(16)}`;
      fail(s, `Raw ${name} inside a string.`, 'Escape it as \\n or \\t.');
    }
    out += ch;
    s.i++;
  }
}

function parseArray(s: Scanner, depth: number): unknown[] {
  const open = s.i;
  s.i++; // [
  const arr: unknown[] = [];
  s.ws();
  if (s.src[s.i] === ']') {
    s.i++;
    return arr;
  }
  while (true) {
    s.ws();
    if (s.src[s.i] === ']')
      fail(s, 'Trailing comma before “]”.', 'JSON does not allow a comma after the last item.');
    arr.push(parseValue(s, depth + 1));
    s.ws();
    const ch = s.src[s.i];
    if (ch === ',') {
      s.i++;
      continue;
    }
    if (ch === ']') {
      s.i++;
      return arr;
    }
    if (ch === undefined) fail(s, 'Unterminated array — “]” is missing.', undefined, open);
    fail(s, `Expected “,” or “]” but found “${ch}”.`);
  }
}

function parseObject(s: Scanner, depth: number): Record<string, unknown> {
  const open = s.i;
  s.i++; // {
  const obj: Record<string, unknown> = {};
  s.ws();
  if (s.src[s.i] === '}') {
    s.i++;
    return obj;
  }
  while (true) {
    s.ws();
    if (s.src[s.i] === '}')
      fail(s, 'Trailing comma before “}”.', 'JSON does not allow a comma after the last property.');
    if (s.src[s.i] !== '"') {
      if (s.src[s.i] === "'")
        fail(s, 'Single-quoted key. JSON keys must use double quotes.', 'Try “Repair”.');
      if (/[A-Za-z_$]/.test(s.src[s.i] ?? ''))
        fail(s, 'Unquoted key. JSON object keys must be double-quoted strings.', 'Try “Repair”.');
      fail(s, `Expected a property name in double quotes but found “${s.src[s.i] ?? 'EOF'}”.`);
    }
    const key = parseString(s);
    s.ws();
    if (s.src[s.i] !== ':') fail(s, `Expected “:” after the property name “${key}”.`);
    s.i++;
    obj[key] = parseValue(s, depth + 1);
    s.ws();
    const ch = s.src[s.i];
    if (ch === ',') {
      s.i++;
      continue;
    }
    if (ch === '}') {
      s.i++;
      return obj;
    }
    if (ch === undefined) fail(s, 'Unterminated object — “}” is missing.', undefined, open);
    fail(s, `Expected “,” or “}” but found “${ch}”.`);
  }
}

/** Parse JSON strictly, returning a precise error location instead of throwing. */
export function parseJson(source: string): JsonParseResult {
  if (source.trim() === '') {
    return {
      ok: false,
      error: { message: 'Input is empty.', line: 1, column: 1, offset: 0 },
    };
  }
  // A BOM is legal in files but not in the JSON grammar; tolerate it silently.
  const src = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const s = new Scanner(src);
  try {
    const value = parseValue(s, 0);
    s.ws();
    if (s.i < s.src.length) {
      const rest = s.src.slice(s.i).trim();
      const hint = rest.startsWith('{') || rest.startsWith('[')
        ? 'Multiple top-level values found. Wrap them in an array, or use NDJSON mode.'
        : undefined;
      return { ok: false, error: s.err(`Unexpected content after the JSON value.`, hint) };
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof JsonSyntaxError) return { ok: false, error: e.detail };
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { message, line: 1, column: 1, offset: 0 } };
  }
}

/**
 * Best-effort repair of near-JSON: JS object literals, config files with
 * comments, trailing commas, single quotes, unquoted keys, Python literals.
 * Repair is deliberately conservative and always re-validated by the caller.
 */
export function repairJson(source: string): string {
  let s = source.trim();
  if (!s) return s;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  // Unwrap `export default {...}` / `module.exports = {...}` / `const x = {...}`
  s = s.replace(/^\s*(?:export\s+default|module\.exports\s*=|(?:const|let|var)\s+\w+\s*=)\s*/, '');
  s = s.replace(/;\s*$/, '');

  let out = '';
  let i = 0;
  let inString: '"' | "'" | '`' | null = null;

  while (i < s.length) {
    const ch = s[i]!;
    const next = s[i + 1];

    if (inString) {
      if (ch === '\\') {
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === inString) {
        out += '"';
        inString = null;
        i++;
        continue;
      }
      if (ch === '"') {
        out += '\\"'; // a double quote inside a single-quoted string
        i++;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        i++;
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    // comments
    if (ch === '/' && next === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '#' && /(^|\n)\s*$/.test(out.slice(-40))) {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += '"';
      i++;
      continue;
    }

    // Python / JS literals -> JSON literals
    const wordMatch = /^(True|False|None|NaN|Infinity|-Infinity|undefined|null|true|false)\b/.exec(
      s.slice(i),
    );
    if (wordMatch && !/[\w$]/.test(out.slice(-1))) {
      const w = wordMatch[1]!;
      const mapped =
        w === 'True' ? 'true'
        : w === 'False' ? 'false'
        : w === 'None' || w === 'undefined' || w === 'NaN' || w === 'Infinity' || w === '-Infinity' ? 'null'
        : w;
      out += mapped;
      i += w.length;
      continue;
    }

    // unquoted object key -> quoted
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(s.slice(i));
      const prev = out.replace(/\s+$/, '').slice(-1);
      if (m && (prev === '{' || prev === ',')) {
        out += `"${m[1]}"`;
        i += m[1]!.length;
        continue;
      }
    }

    out += ch;
    i++;
  }

  // trailing commas
  out = out.replace(/,(\s*[}\]])/g, '$1');
  // missing commas between adjacent values on separate lines
  out = out.replace(/([}\]"\d])(\s*\n\s*)(["{[])/g, '$1,$2$3');
  // trailing commas one more time (the previous rule can create some)
  out = out.replace(/,(\s*[}\]])/g, '$1');

  return out;
}

function sortValue(value: unknown, direction: 'asc' | 'desc'): unknown {
  if (Array.isArray(value)) return value.map((v) => sortValue(v, direction));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort((a, b) =>
      direction === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]),
    );
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) result[k] = sortValue(v, direction);
    return result;
  }
  return value;
}

export interface FormatOptions {
  /** Number of spaces, or 'tab', or 0 for minified. */
  indent: number | 'tab';
  sortKeys: 'none' | 'asc' | 'desc';
}

export function formatJson(value: unknown, options: FormatOptions): string {
  const prepared = options.sortKeys === 'none' ? value : sortValue(value, options.sortKeys);
  const indent = options.indent === 'tab' ? '\t' : options.indent;
  return JSON.stringify(prepared, null, indent);
}

export interface JsonStats {
  bytes: number;
  minifiedBytes: number;
  keys: number;
  uniqueKeys: number;
  values: number;
  arrays: number;
  objects: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  maxDepth: number;
}

export function jsonStats(value: unknown, source: string): JsonStats {
  const stats: JsonStats = {
    bytes: new TextEncoder().encode(source).length,
    minifiedBytes: new TextEncoder().encode(JSON.stringify(value)).length,
    keys: 0,
    uniqueKeys: 0,
    values: 0,
    arrays: 0,
    objects: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
    maxDepth: 0,
  };
  const unique = new Set<string>();

  const walk = (v: unknown, depth: number): void => {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    stats.values++;
    if (Array.isArray(v)) {
      stats.arrays++;
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (v === null) {
      stats.nulls++;
      return;
    }
    switch (typeof v) {
      case 'object': {
        stats.objects++;
        for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
          stats.keys++;
          unique.add(k);
          walk(item, depth + 1);
        }
        return;
      }
      case 'string':
        stats.strings++;
        return;
      case 'number':
        stats.numbers++;
        return;
      case 'boolean':
        stats.booleans++;
        return;
      default:
        return;
    }
  };
  walk(value, 1);
  stats.uniqueKeys = unique.size;
  return stats;
}

/** Flatten a nested value into dot/bracket paths — handy for grepping big blobs. */
export function flattenJson(value: unknown, prefix = ''): Array<[string, unknown]> {
  const rows: Array<[string, unknown]> = [];
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) rows.push([path || '$', []]);
      else v.forEach((item, idx) => walk(item, `${path}[${idx}]`));
      return;
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) rows.push([path || '$', {}]);
      else
        for (const [k, item] of entries) {
          const safe = /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `["${k}"]`;
          walk(item, path ? `${path}${safe}` : k);
        }
      return;
    }
    rows.push([path || '$', v]);
  };
  walk(value, prefix);
  return rows;
}

/**
 * Minimal, safe JSON path query: `a.b[0].c`, `items[*].name`, `$.x`.
 * Deliberately not a full JSONPath implementation — no filters, no eval.
 */
export function queryJson(value: unknown, path: string): unknown[] {
  const clean = path.trim().replace(/^\$\.?/, '');
  if (!clean) return [value];
  const tokens = clean.match(/[^.[\]]+|\[\*\]|\[\d+\]/g) ?? [];
  let current: unknown[] = [value];
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^\[|\]$/g, '');
    const next: unknown[] = [];
    for (const item of current) {
      if (item == null) continue;
      if (token === '*') {
        if (Array.isArray(item)) next.push(...item);
        else if (typeof item === 'object') next.push(...Object.values(item));
        continue;
      }
      if (/^\d+$/.test(token) && Array.isArray(item)) {
        const el = item[Number(token)];
        if (el !== undefined) next.push(el);
        continue;
      }
      if (typeof item === 'object' && !Array.isArray(item)) {
        // Only own, enumerable keys — never `constructor`, `__proto__`, or
        // anything else inherited from Object.prototype.
        if (!Object.prototype.hasOwnProperty.call(item, token)) continue;
        const el = (item as Record<string, unknown>)[token];
        if (el !== undefined) next.push(el);
      }
    }
    current = next;
  }
  return current;
}
