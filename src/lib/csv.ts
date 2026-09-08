/**
 * RFC 4180-compatible CSV parsing and serialisation, plus JSON <-> CSV mapping.
 *
 * Written as a character scanner rather than `split(',')` because real
 * spreadsheets contain quoted commas, embedded newlines and doubled quotes,
 * which is precisely the pain this tool exists to remove.
 */

export type Delimiter = ',' | ';' | '\t' | '|';

export interface CsvParseOptions {
  delimiter: Delimiter | 'auto';
  hasHeader: boolean;
  trimFields: boolean;
  skipEmptyLines: boolean;
  /** Convert "123", "true", "null" into real JSON types. */
  inferTypes: boolean;
  /** Comment lines starting with this prefix are ignored ('' disables). */
  comment: string;
}

export const defaultCsvOptions: CsvParseOptions = {
  delimiter: 'auto',
  hasHeader: true,
  trimFields: true,
  skipEmptyLines: true,
  inferTypes: true,
  comment: '',
};

export interface CsvParseWarning {
  row: number;
  message: string;
}

export interface CsvTable {
  header: string[];
  rows: string[][];
  delimiter: Delimiter;
  warnings: CsvParseWarning[];
}

const DELIMITERS: Delimiter[] = [',', ';', '\t', '|'];

/** Guess the delimiter by finding which candidate yields the most consistent column count. */
export function detectDelimiter(sample: string): Delimiter {
  const lines = sample.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length === 0) return ',';

  let best: Delimiter = ',';
  let bestScore = -Infinity;

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const mean = total / counts.length;
    const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length;
    // Prefer many columns and low variance across rows.
    const score = mean * 2 - variance * 4;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

/** Parse CSV text into a header + rows table. Never throws on malformed input. */
export function parseCsv(input: string, options: Partial<CsvParseOptions> = {}): CsvTable {
  const opts = { ...defaultCsvOptions, ...options };
  const src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter: Delimiter = opts.delimiter === 'auto' ? detectDelimiter(src) : opts.delimiter;
  const warnings: CsvParseWarning[] = [];

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  let sawQuote = false;

  const pushField = () => {
    let v = field;
    if (opts.trimFields && !sawQuote) v = v.trim();
    record.push(v);
    field = '';
    sawQuote = false;
  };
  const pushRecord = () => {
    pushField();
    const isEmpty = record.length === 1 && record[0] === '';
    if (!(opts.skipEmptyLines && isEmpty)) records.push(record);
    record = [];
  };

  while (i < src.length) {
    const ch = src[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      if (field.trim() === '') {
        field = '';
        inQuotes = true;
        sawQuote = true;
      } else {
        // A quote in the middle of a bare field: treat it literally but warn.
        warnings.push({
          row: records.length + 1,
          message: 'Quote character found in the middle of an unquoted field; kept literally.',
        });
        field += ch;
      }
      i++;
      continue;
    }

    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      pushRecord();
      if (ch === '\r' && src[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (inQuotes) {
    warnings.push({
      row: records.length + 1,
      message: 'Input ends inside a quoted field — a closing quote is missing.',
    });
  }
  if (field !== '' || record.length > 0) pushRecord();

  // Drop comment rows.
  let dataRecords = records;
  if (opts.comment) {
    dataRecords = records.filter((r) => !(r[0] ?? '').startsWith(opts.comment));
  }

  let header: string[];
  let rows: string[][];
  if (opts.hasHeader && dataRecords.length > 0) {
    header = dedupeHeader((dataRecords[0] ?? []).map((h, idx) => h.trim() || `column_${idx + 1}`));
    rows = dataRecords.slice(1);
  } else {
    const width = dataRecords.reduce((max, r) => Math.max(max, r.length), 0);
    header = Array.from({ length: width }, (_, idx) => `column_${idx + 1}`);
    rows = dataRecords;
  }

  // Normalise ragged rows to the header width, warning as we go.
  rows = rows.map((r, idx) => {
    if (r.length === header.length) return r;
    warnings.push({
      row: idx + (opts.hasHeader ? 2 : 1),
      message: `Row has ${r.length} field${r.length === 1 ? '' : 's'} but the header has ${header.length}.`,
    });
    const copy = r.slice(0, header.length);
    while (copy.length < header.length) copy.push('');
    return copy;
  });

  return { header, rows, delimiter, warnings };
}

function dedupeHeader(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

const TRUE_VALUES = new Set(['true', 'yes', 'y']);
const FALSE_VALUES = new Set(['false', 'no', 'n']);

/** Convert a CSV cell into a JSON scalar. Conservative: only unambiguous cases. */
export function inferValue(raw: string): string | number | boolean | null {
  const v = raw.trim();
  if (v === '') return '';
  const lower = v.toLowerCase();
  if (lower === 'null' || lower === 'nil') return null;
  if (TRUE_VALUES.has(lower)) return true;
  if (FALSE_VALUES.has(lower)) return false;
  // Numbers: no leading zeros (preserves zip codes / IDs), no thousands separators.
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n) && String(n) === v) return n;
    if (Number.isFinite(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) return n;
  }
  return raw;
}

export interface CsvToJsonOptions {
  inferTypes: boolean;
  /** Expand `a.b` / `a[0]` header names into nested structures. */
  expandDotPaths: boolean;
  /** Omit properties whose cell is empty. */
  omitEmpty: boolean;
}

function assignPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const tokens = path.match(/[^.[\]]+|\[\d+\]/g) ?? [path];
  let node: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < tokens.length; i++) {
    const rawToken = tokens[i]!;
    const key = rawToken.replace(/^\[|\]$/g, '');
    const last = i === tokens.length - 1;
    if (last) {
      if (Array.isArray(node)) node[Number(key)] = value;
      else (node)[key] = value;
      return;
    }
    const nextToken = tokens[i + 1]!;
    const nextIsIndex = /^\[\d+\]$/.test(nextToken);
    if (Array.isArray(node)) {
      const idx = Number(key);
      if (node[idx] === undefined) node[idx] = nextIsIndex ? [] : {};
      node = node[idx] as Record<string, unknown> | unknown[];
    } else {
      const obj = node;
      if (obj[key] === undefined) obj[key] = nextIsIndex ? [] : {};
      node = obj[key] as Record<string, unknown> | unknown[];
    }
  }
}

export function csvTableToObjects(
  table: CsvTable,
  options: Partial<CsvToJsonOptions> = {},
): Array<Record<string, unknown>> {
  const opts: CsvToJsonOptions = {
    inferTypes: true,
    expandDotPaths: false,
    omitEmpty: false,
    ...options,
  };
  return table.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    table.header.forEach((key, idx) => {
      const raw = row[idx] ?? '';
      if (opts.omitEmpty && raw.trim() === '') return;
      const value = opts.inferTypes ? inferValue(raw) : raw;
      if (opts.expandDotPaths && /[.[]/.test(key)) assignPath(obj, key, value);
      else obj[key] = value;
    });
    return obj;
  });
}

export interface JsonToCsvOptions {
  delimiter: Delimiter;
  /** Flatten nested objects into `a.b` columns instead of JSON-stringifying them. */
  flatten: boolean;
  /** Line ending to emit. */
  newline: '\n' | '\r\n';
  /** Prefix formula-triggering cells with an apostrophe (CSV injection defence). */
  escapeFormulas: boolean;
  /** Quote every field rather than only when required. */
  quoteAll: boolean;
  includeHeader: boolean;
}

export const defaultJsonToCsvOptions: JsonToCsvOptions = {
  delimiter: ',',
  flatten: true,
  newline: '\n',
  escapeFormulas: true,
  quoteAll: false,
  includeHeader: true,
};

function flattenRecord(
  value: unknown,
  prefix: string,
  out: Record<string, unknown>,
  flatten: boolean,
): void {
  if (value === null || typeof value !== 'object') {
    out[prefix] = value;
    return;
  }
  if (Array.isArray(value)) {
    if (!flatten) {
      out[prefix] = JSON.stringify(value);
      return;
    }
    if (value.length === 0) {
      out[prefix] = '';
      return;
    }
    // Arrays of scalars become a single joined cell; arrays of objects expand.
    if (value.every((v) => v === null || typeof v !== 'object')) {
      out[prefix] = value.join('; ');
      return;
    }
    value.forEach((item, idx) => flattenRecord(item, `${prefix}[${idx}]`, out, flatten));
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    out[prefix] = '';
    return;
  }
  for (const [k, v] of entries) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!flatten) {
      out[path] = v === null || typeof v !== 'object' ? v : JSON.stringify(v);
    } else {
      flattenRecord(v, path, out, flatten);
    }
  }
}

/** Turn any JSON value into tabular rows. Non-array input is wrapped. */
export function jsonToTable(
  value: unknown,
  options: Partial<JsonToCsvOptions> = {},
): { header: string[]; rows: string[][] } {
  const opts = { ...defaultJsonToCsvOptions, ...options };
  let items: unknown[];
  if (Array.isArray(value)) items = value;
  else if (value && typeof value === 'object') {
    // {"a": {...}, "b": {...}} -> rows keyed by the outer key
    const entries = Object.entries(value as Record<string, unknown>);
    const allObjects = entries.length > 0 && entries.every(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
    items = allObjects
      ? entries.map(([k, v]) => ({ key: k, ...(v as Record<string, unknown>) }))
      : [value];
  } else items = [value];

  const flattened = items.map((item) => {
    const out: Record<string, unknown> = {};
    if (item === null || typeof item !== 'object') out['value'] = item;
    else flattenRecord(item, '', out, opts.flatten);
    return out;
  });

  const header: string[] = [];
  const seen = new Set<string>();
  for (const row of flattened) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
      }
    }
  }

  const rows = flattened.map((row) =>
    header.map((key) => {
      const v = row[key];
      if (v === undefined || v === null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
        return String(v);
      }
      if (typeof v === 'object') return JSON.stringify(v);
      // Symbols and functions cannot appear in parsed JSON; render them empty
      // rather than leaking "[object Object]" or throwing.
      return '';
    }),
  );

  return { header, rows };
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvField(
  raw: string,
  delimiter: string,
  opts: { escapeFormulas: boolean; quoteAll: boolean },
): string {
  let value = raw;
  // Defence against CSV injection when the file is opened in a spreadsheet.
  if (opts.escapeFormulas && FORMULA_START.test(value)) value = `'${value}`;
  const mustQuote =
    opts.quoteAll ||
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value !== value.trim();
  if (!mustQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function tableToCsv(
  header: string[],
  rows: string[][],
  options: Partial<JsonToCsvOptions> = {},
): string {
  const opts = { ...defaultJsonToCsvOptions, ...options };
  const lines: string[] = [];
  if (opts.includeHeader) {
    lines.push(header.map((h) => escapeCsvField(h, opts.delimiter, opts)).join(opts.delimiter));
  }
  for (const row of rows) {
    lines.push(
      header
        .map((_, idx) => escapeCsvField(row[idx] ?? '', opts.delimiter, opts))
        .join(opts.delimiter),
    );
  }
  return lines.join(opts.newline);
}

export function jsonToCsv(value: unknown, options: Partial<JsonToCsvOptions> = {}): string {
  const { header, rows } = jsonToTable(value, options);
  return tableToCsv(header, rows, options);
}

/** Column type summary used by the preview panel. */
export type ColumnType = 'string' | 'number' | 'boolean' | 'null' | 'mixed' | 'empty';

export function inferColumnTypes(table: CsvTable): ColumnType[] {
  return table.header.map((_, idx) => {
    const types = new Set<string>();
    for (const row of table.rows) {
      const raw = (row[idx] ?? '').trim();
      if (raw === '') continue;
      const v = inferValue(raw);
      types.add(v === null ? 'null' : typeof v);
    }
    if (types.size === 0) return 'empty';
    if (types.size === 1) return [...types][0] as ColumnType;
    return 'mixed';
  });
}
