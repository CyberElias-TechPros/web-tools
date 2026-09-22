/**
 * Line-oriented text operations: sort (natural, numeric, length, random),
 * dedupe, reverse, trim, number, filter, shuffle, prefix/suffix, wrap.
 */

export type SortMode = 'alpha' | 'alpha-ci' | 'natural' | 'numeric' | 'length' | 'random' | 'reverse';

export interface LineOptions {
  trim: boolean;
  removeEmpty: boolean;
  dedupe: boolean;
  dedupeCaseInsensitive: boolean;
  sort: SortMode | 'none';
  descending: boolean;
  reverse: boolean;
  prefix: string;
  suffix: string;
  numbering: 'none' | 'plain' | 'dot' | 'paren' | 'padded';
  filterInclude: string;
  filterExclude: string;
  filterRegex: boolean;
}

export const defaultLineOptions: LineOptions = {
  trim: false,
  removeEmpty: false,
  dedupe: false,
  dedupeCaseInsensitive: false,
  sort: 'none',
  descending: false,
  reverse: false,
  prefix: '',
  suffix: '',
  numbering: 'none',
  filterInclude: '',
  filterExclude: '',
  filterRegex: false,
};

export interface LineResult {
  text: string;
  inputLines: number;
  outputLines: number;
  removedDuplicates: number;
  error?: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function extractNumber(line: string): number {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(line);
  return m ? parseFloat(m[0].replace(/,/g, '')) : Number.POSITIVE_INFINITY;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  const rnd = new Uint32Array(arr.length);
  crypto.getRandomValues(rnd);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd[i]! % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function sortLines(lines: string[], mode: SortMode, descending = false): string[] {
  let out = [...lines];
  switch (mode) {
    case 'alpha':
      out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      break;
    case 'alpha-ci':
      out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      break;
    case 'natural':
      out.sort((a, b) => collator.compare(a, b));
      break;
    case 'numeric':
      out.sort((a, b) => extractNumber(a) - extractNumber(b) || collator.compare(a, b));
      break;
    case 'length':
      out.sort((a, b) => a.length - b.length || collator.compare(a, b));
      break;
    case 'random':
      out = shuffle(out);
      break;
    case 'reverse':
      out.reverse();
      break;
  }
  if (descending && mode !== 'random' && mode !== 'reverse') out.reverse();
  return out;
}

export function processLines(text: string, options: LineOptions): LineResult {
  let lines = text.split(/\r?\n/);
  const inputLines = lines.length;
  let removedDuplicates = 0;
  let error: string | undefined;

  if (options.trim) lines = lines.map((l) => l.trim());
  if (options.removeEmpty) lines = lines.filter((l) => l.trim() !== '');

  if (options.filterInclude || options.filterExclude) {
    try {
      const inc = options.filterInclude ? (options.filterRegex ? new RegExp(options.filterInclude, 'i') : null) : null;
      const exc = options.filterExclude ? (options.filterRegex ? new RegExp(options.filterExclude, 'i') : null) : null;
      lines = lines.filter((l) => {
        const lower = l.toLowerCase();
        if (options.filterInclude) {
          const ok = inc ? inc.test(l) : lower.includes(options.filterInclude.toLowerCase());
          if (!ok) return false;
        }
        if (options.filterExclude) {
          const hit = exc ? exc.test(l) : lower.includes(options.filterExclude.toLowerCase());
          if (hit) return false;
        }
        return true;
      });
    } catch (e) {
      error = e instanceof Error ? `Invalid filter pattern: ${e.message}` : 'Invalid filter pattern';
    }
  }

  if (options.dedupe) {
    const seen = new Set<string>();
    const before = lines.length;
    lines = lines.filter((l) => {
      const key = options.dedupeCaseInsensitive ? l.toLowerCase() : l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    removedDuplicates = before - lines.length;
  }

  if (options.sort !== 'none') lines = sortLines(lines, options.sort, options.descending);
  if (options.reverse) lines.reverse();

  if (options.prefix || options.suffix) lines = lines.map((l) => `${options.prefix}${l}${options.suffix}`);

  if (options.numbering !== 'none') {
    const width = String(lines.length).length;
    lines = lines.map((l, i) => {
      const n = i + 1;
      switch (options.numbering) {
        case 'dot':
          return `${n}. ${l}`;
        case 'paren':
          return `${n}) ${l}`;
        case 'padded':
          return `${String(n).padStart(width, '0')}  ${l}`;
        default:
          return `${n} ${l}`;
      }
    });
  }

  return { text: lines.join('\n'), inputLines, outputLines: lines.length, removedDuplicates, error };
}

export function countDuplicates(text: string, caseInsensitive = false): Array<{ line: string; count: number }> {
  const counts = new Map<string, { line: string; count: number }>();
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const key = caseInsensitive ? raw.toLowerCase() : raw;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { line: raw, count: 1 });
  }
  return Array.from(counts.values())
    .filter((e) => e.count > 1)
    .sort((a, b) => b.count - a.count);
}

/** Hard-wrap text at a column, respecting word boundaries and paragraphs. */
export function wrapText(text: string, width: number): string {
  if (width < 8) return text;
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const words = para.replace(/\s+/g, ' ').trim().split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        if (!current) current = word;
        else if (current.length + 1 + word.length <= width) current += ` ${word}`;
        else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function unwrapText(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.replace(/\s*\n\s*/g, ' ').trim())
    .join('\n\n');
}

export function stripBlankLines(text: string, collapse = true): string {
  return collapse ? text.replace(/\n{3,}/g, '\n\n') : text.replace(/^\s*$(?:\r?\n)?/gm, '');
}

export function extractColumn(text: string, delimiter: string, column: number): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(delimiter)[column] ?? '')
    .join('\n');
}

export function indentLines(text: string, spaces: number, useTabs = false): string {
  const pad = useTabs ? '\t'.repeat(Math.max(1, Math.round(spaces / 4))) : ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n');
}

export function dedentLines(text: string): string {
  const lines = text.split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(min, /^[ \t]*/.exec(l)![0].length))).join('\n');
}
