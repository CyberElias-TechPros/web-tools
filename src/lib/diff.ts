/**
 * Text diffing.
 *
 * Uses Myers' O(ND) algorithm over a token array, with a linear-time common
 * prefix/suffix trim in front of it (huge win for the common "one edit in a
 * large file" case) and a hard work budget so pathological inputs degrade to a
 * simple replace instead of hanging the tab.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffChunk {
  op: DiffOp;
  value: string;
}

export interface DiffToken {
  op: DiffOp;
  tokens: string[];
}

const MAX_EDIT_DISTANCE = 4000;

/** Core Myers diff over arbitrary token arrays. */
export function diffTokens(a: string[], b: string[]): DiffToken[] {
  // Common prefix / suffix.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const prefix = a.slice(0, start);
  const suffix = a.slice(endA);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const result: DiffToken[] = [];
  if (prefix.length) result.push({ op: 'equal', tokens: prefix });

  if (midA.length === 0 && midB.length === 0) {
    // nothing in the middle
  } else if (midA.length === 0) {
    result.push({ op: 'insert', tokens: midB });
  } else if (midB.length === 0) {
    result.push({ op: 'delete', tokens: midA });
  } else if (midA.length + midB.length > MAX_EDIT_DISTANCE * 2) {
    result.push({ op: 'delete', tokens: midA });
    result.push({ op: 'insert', tokens: midB });
  } else {
    result.push(...myers(midA, midB));
  }

  if (suffix.length) result.push({ op: 'equal', tokens: suffix });
  return mergeAdjacent(result);
}

function myers(a: string[], b: string[]): DiffToken[] {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  const offset = max;
  const size = 2 * max + 1;
  const v = new Int32Array(size);
  const trace: Int32Array[] = [];

  let found = -1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const idx = k + offset;
      let x: number;
      if (k === -d || (k !== d && (v[idx - 1] ?? 0) < (v[idx + 1] ?? 0))) x = v[idx + 1] ?? 0;
      else x = (v[idx - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[idx] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }

  if (found < 0) {
    // Budget exhausted: fall back to replace-all rather than lie about the diff.
    return [
      { op: 'delete', tokens: a },
      { op: 'insert', tokens: b },
    ];
  }

  // Backtrack.
  const ops: DiffToken[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const vPrev = trace[d]!;
    const k = x - y;
    const idx = k + offset;
    let prevK: number;
    if (k === -d || (k !== d && (vPrev[idx - 1] ?? 0) < (vPrev[idx + 1] ?? 0))) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vPrev[prevK + offset] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ op: 'equal', tokens: [a[x - 1]!] });
      x--;
      y--;
    }
    if (x > prevX) {
      ops.push({ op: 'delete', tokens: [a[x - 1]!] });
      x--;
    } else if (y > prevY) {
      ops.push({ op: 'insert', tokens: [b[y - 1]!] });
      y--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push({ op: 'equal', tokens: [a[x - 1]!] });
    x--;
    y--;
  }
  while (x > 0) {
    ops.push({ op: 'delete', tokens: [a[--x]!] });
  }
  while (y > 0) {
    ops.push({ op: 'insert', tokens: [b[--y]!] });
  }

  ops.reverse();
  return mergeAdjacent(ops);
}

function mergeAdjacent(items: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const item of items) {
    if (item.tokens.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.op === item.op) last.tokens.push(...item.tokens);
    else out.push({ op: item.op, tokens: [...item.tokens] });
  }
  return out;
}

// --- tokenisers -------------------------------------------------------------

export function tokenizeWords(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

export function tokenizeChars(text: string): string[] {
  return [...text];
}

export function tokenizeLines(text: string): string[] {
  if (text === '') return [];
  return text.split('\n');
}

// --- normalisation ----------------------------------------------------------

export interface DiffOptions {
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
  ignoreTrailingWhitespace: boolean;
  ignoreBlankLines: boolean;
  /** Sort lines before comparing — useful for unordered lists like .env files. */
  sortLines: boolean;
  normalizeUnicode: boolean;
}

export const defaultDiffOptions: DiffOptions = {
  ignoreCase: false,
  ignoreWhitespace: false,
  ignoreTrailingWhitespace: true,
  ignoreBlankLines: false,
  sortLines: false,
  normalizeUnicode: false,
};

export function normalizeForCompare(line: string, opts: DiffOptions): string {
  let s = line;
  if (opts.normalizeUnicode) s = s.normalize('NFC');
  if (opts.ignoreWhitespace) s = s.replace(/\s+/g, '');
  else if (opts.ignoreTrailingWhitespace) s = s.replace(/[ \t]+$/, '');
  if (opts.ignoreCase) s = s.toLowerCase();
  return s;
}

// --- line diff with inline word detail ---------------------------------------

export interface DiffLine {
  op: DiffOp | 'replace';
  leftNumber: number | null;
  rightNumber: number | null;
  left: string;
  right: string;
  /** Word-level detail, present when op === 'replace'. */
  inlineLeft?: DiffChunk[];
  inlineRight?: DiffChunk[];
}

export interface DiffResult {
  lines: DiffLine[];
  stats: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    similarity: number; // 0..1
  };
}

/** Word-level diff of two strings, returned as display chunks. */
export function diffWords(a: string, b: string): { left: DiffChunk[]; right: DiffChunk[] } {
  const parts = diffTokens(tokenizeWords(a), tokenizeWords(b));
  const left: DiffChunk[] = [];
  const right: DiffChunk[] = [];
  for (const part of parts) {
    const value = part.tokens.join('');
    if (part.op === 'equal') {
      left.push({ op: 'equal', value });
      right.push({ op: 'equal', value });
    } else if (part.op === 'delete') {
      left.push({ op: 'delete', value });
    } else {
      right.push({ op: 'insert', value });
    }
  }
  return { left, right };
}

export function diffChars(a: string, b: string): DiffChunk[] {
  return diffTokens(tokenizeChars(a), tokenizeChars(b)).map((p) => ({
    op: p.op,
    value: p.tokens.join(''),
  }));
}

function similarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const parts = diffTokens(tokenizeWords(a), tokenizeWords(b));
  let common = 0;
  for (const p of parts) if (p.op === 'equal') common += p.tokens.join('').length;
  return (2 * common) / (a.length + b.length);
}

/**
 * Produce an aligned, side-by-side line diff. Adjacent delete/insert runs are
 * paired up when the lines are similar enough to be a "change" rather than an
 * unrelated removal + addition.
 */
export function diffLines(
  leftText: string,
  rightText: string,
  options: Partial<DiffOptions> = {},
): DiffResult {
  const opts = { ...defaultDiffOptions, ...options };

  let leftLines = tokenizeLines(leftText.replace(/\r\n?/g, '\n'));
  let rightLines = tokenizeLines(rightText.replace(/\r\n?/g, '\n'));

  if (opts.ignoreBlankLines) {
    leftLines = leftLines.filter((l) => l.trim() !== '');
    rightLines = rightLines.filter((l) => l.trim() !== '');
  }
  if (opts.sortLines) {
    leftLines = [...leftLines].sort();
    rightLines = [...rightLines].sort();
  }

  const leftKeys = leftLines.map((l) => normalizeForCompare(l, opts));
  const rightKeys = rightLines.map((l) => normalizeForCompare(l, opts));

  const parts = diffTokens(leftKeys, rightKeys);

  const lines: DiffLine[] = [];
  let li = 0;
  let ri = 0;
  const stats = { added: 0, removed: 0, changed: 0, unchanged: 0, similarity: 0 };

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]!;
    if (part.op === 'equal') {
      for (let k = 0; k < part.tokens.length; k++) {
        lines.push({
          op: 'equal',
          leftNumber: li + 1,
          rightNumber: ri + 1,
          left: leftLines[li] ?? '',
          right: rightLines[ri] ?? '',
        });
        li++;
        ri++;
        stats.unchanged++;
      }
      continue;
    }

    if (part.op === 'delete') {
      const nextPart = parts[p + 1];
      const deletions = part.tokens.length;
      const insertions = nextPart?.op === 'insert' ? nextPart.tokens.length : 0;
      const paired = Math.min(deletions, insertions);

      for (let k = 0; k < paired; k++) {
        const l = leftLines[li] ?? '';
        const r = rightLines[ri] ?? '';
        const ratio = similarityRatio(l, r);
        if (ratio >= 0.35) {
          const inline = diffWords(l, r);
          lines.push({
            op: 'replace',
            leftNumber: li + 1,
            rightNumber: ri + 1,
            left: l,
            right: r,
            inlineLeft: inline.left,
            inlineRight: inline.right,
          });
          stats.changed++;
        } else {
          lines.push({ op: 'delete', leftNumber: li + 1, rightNumber: null, left: l, right: '' });
          lines.push({ op: 'insert', leftNumber: null, rightNumber: ri + 1, left: '', right: r });
          stats.removed++;
          stats.added++;
        }
        li++;
        ri++;
      }
      for (let k = paired; k < deletions; k++) {
        lines.push({
          op: 'delete',
          leftNumber: li + 1,
          rightNumber: null,
          left: leftLines[li] ?? '',
          right: '',
        });
        li++;
        stats.removed++;
      }
      if (nextPart?.op === 'insert') {
        for (let k = paired; k < insertions; k++) {
          lines.push({
            op: 'insert',
            leftNumber: null,
            rightNumber: ri + 1,
            left: '',
            right: rightLines[ri] ?? '',
          });
          ri++;
          stats.added++;
        }
        p++; // consumed
      }
      continue;
    }

    // pure insert
    for (let k = 0; k < part.tokens.length; k++) {
      lines.push({
        op: 'insert',
        leftNumber: null,
        rightNumber: ri + 1,
        left: '',
        right: rightLines[ri] ?? '',
      });
      ri++;
      stats.added++;
    }
  }

  const total = stats.added + stats.removed + stats.changed + stats.unchanged;
  stats.similarity = total === 0 ? 1 : stats.unchanged / total;
  return { lines, stats };
}

/** Render a diff as a unified patch, suitable for `git apply`-style review. */
export function toUnifiedDiff(
  result: DiffResult,
  leftName = 'a',
  rightName = 'b',
  context = 3,
): string {
  const rows = result.lines;
  interface Hunk {
    leftStart: number;
    rightStart: number;
    leftCount: number;
    rightCount: number;
    body: string[];
  }
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let pending: Array<{ row: (typeof rows)[number]; index: number }> = [];

  const rowLines = (row: (typeof rows)[number]): string[] => {
    switch (row.op) {
      case 'equal':
        return [` ${row.left}`];
      case 'delete':
        return [`-${row.left}`];
      case 'insert':
        return [`+${row.right}`];
      case 'replace':
        return [`-${row.left}`, `+${row.right}`];
    }
  };

  const counts = (row: (typeof rows)[number]): [number, number] => {
    switch (row.op) {
      case 'equal':
        return [1, 1];
      case 'delete':
        return [1, 0];
      case 'insert':
        return [0, 1];
      case 'replace':
        return [1, 1];
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.op === 'equal') {
      if (current) {
        pending.push({ row, index: i });
        if (pending.length > context * 2) {
          // Close the hunk with `context` trailing lines.
          for (const p of pending.slice(0, context)) {
            current.body.push(...rowLines(p.row));
            current.leftCount++;
            current.rightCount++;
          }
          hunks.push(current);
          current = null;
          pending = [];
        }
      } else {
        pending.push({ row, index: i });
        if (pending.length > context) pending.shift();
      }
      continue;
    }

    if (!current) {
      const lead = pending.slice(-context);
      const first = lead[0] ?? { row, index: i };
      current = {
        leftStart: first.row.leftNumber ?? row.leftNumber ?? 1,
        rightStart: first.row.rightNumber ?? row.rightNumber ?? 1,
        leftCount: 0,
        rightCount: 0,
        body: [],
      };
      for (const p of lead) {
        current.body.push(...rowLines(p.row));
        current.leftCount++;
        current.rightCount++;
      }
      pending = [];
    } else if (pending.length) {
      for (const p of pending) {
        current.body.push(...rowLines(p.row));
        current.leftCount++;
        current.rightCount++;
      }
      pending = [];
    }

    current.body.push(...rowLines(row));
    const [lc, rc] = counts(row);
    current.leftCount += lc;
    current.rightCount += rc;
  }

  if (current) {
    for (const p of pending.slice(0, context)) {
      current.body.push(...rowLines(p.row));
      current.leftCount++;
      current.rightCount++;
    }
    hunks.push(current);
  }

  if (hunks.length === 0) return '';

  const out = [`--- ${leftName}`, `+++ ${rightName}`];
  for (const h of hunks) {
    out.push(`@@ -${h.leftStart},${h.leftCount} +${h.rightStart},${h.rightCount} @@`);
    out.push(...h.body);
  }
  return out.join('\n') + '\n';
}
