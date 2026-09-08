import { describe, expect, it } from 'vitest';
import {
  diffChars,
  diffLines,
  diffTokens,
  diffWords,
  tokenizeLines,
  tokenizeWords,
  toUnifiedDiff,
} from '@/lib/diff';

const apply = (a: string[], ops: ReturnType<typeof diffTokens>): string[] => {
  // Reconstruct side B from the diff to prove the ops are self-consistent.
  const out: string[] = [];
  for (const op of ops) {
    if (op.op === 'equal' || op.op === 'insert') out.push(...op.tokens);
  }
  void a;
  return out;
};

describe('diffTokens', () => {
  it('reports identical sequences as a single equal run', () => {
    const ops = diffTokens(['a', 'b'], ['a', 'b']);
    expect(ops).toEqual([{ op: 'equal', tokens: ['a', 'b'] }]);
  });

  it('detects a pure insertion', () => {
    const ops = diffTokens(['a'], ['a', 'b']);
    expect(ops).toEqual([
      { op: 'equal', tokens: ['a'] },
      { op: 'insert', tokens: ['b'] },
    ]);
  });

  it('detects a pure deletion', () => {
    const ops = diffTokens(['a', 'b'], ['a']);
    expect(ops).toEqual([
      { op: 'equal', tokens: ['a'] },
      { op: 'delete', tokens: ['b'] },
    ]);
  });

  it('handles an empty left side', () => {
    expect(diffTokens([], ['a'])).toEqual([{ op: 'insert', tokens: ['a'] }]);
  });

  it('handles an empty right side', () => {
    expect(diffTokens(['a'], [])).toEqual([{ op: 'delete', tokens: ['a'] }]);
  });

  it('handles two empty sides', () => {
    expect(diffTokens([], [])).toEqual([]);
  });

  it('produces ops that reconstruct the target exactly', () => {
    const cases: Array<[string[], string[]]> = [
      [['a', 'b', 'c'], ['a', 'x', 'c']],
      [['1', '2', '3', '4'], ['2', '3']],
      [[], ['a', 'b', 'c']],
      [['a', 'a', 'a'], ['a', 'a']],
      [['x'], ['y']],
      [['the', 'quick', 'brown'], ['the', 'slow', 'brown', 'fox']],
    ];
    for (const [a, b] of cases) {
      expect(apply(a, diffTokens(a, b))).toEqual(b);
    }
  });

  it('finds a minimal edit for a middle change', () => {
    const ops = diffTokens(['a', 'b', 'c'], ['a', 'x', 'c']);
    const equalCount = ops.filter((o) => o.op === 'equal').reduce((n, o) => n + o.tokens.length, 0);
    expect(equalCount).toBe(2);
  });

  it('does not hang on large inputs', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[2500] = 'changed';
    const started = Date.now();
    const ops = diffTokens(a, b);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(apply(a, ops)).toEqual(b);
  });
});

describe('tokenizers', () => {
  it('splits words while keeping whitespace as tokens', () => {
    expect(tokenizeWords('a b')).toEqual(['a', ' ', 'b']);
  });
  it('separates punctuation', () => {
    expect(tokenizeWords('a,b')).toEqual(['a', ',', 'b']);
  });
  it('splits lines without a trailing empty entry for empty input', () => {
    expect(tokenizeLines('')).toEqual([]);
    expect(tokenizeLines('a\nb')).toEqual(['a', 'b']);
  });
});

describe('diffWords', () => {
  it('marks only the differing word', () => {
    const { left, right } = diffWords('the quick fox', 'the slow fox');
    expect(left.filter((c) => c.op === 'delete').map((c) => c.value)).toEqual(['quick']);
    expect(right.filter((c) => c.op === 'insert').map((c) => c.value)).toEqual(['slow']);
  });

  it('reconstructs both sides from the chunks', () => {
    const a = 'hello beautiful world';
    const b = 'hello cruel world';
    const { left, right } = diffWords(a, b);
    expect(left.map((c) => c.value).join('')).toBe(a);
    expect(right.map((c) => c.value).join('')).toBe(b);
  });
});

describe('diffChars', () => {
  it('finds a single character change', () => {
    const chunks = diffChars('cat', 'cut');
    expect(chunks.filter((c) => c.op !== 'equal').map((c) => c.value).sort()).toEqual(['a', 'u']);
  });
});

describe('diffLines', () => {
  it('returns no changes for identical input', () => {
    const result = diffLines('a\nb', 'a\nb');
    expect(result.stats).toMatchObject({ added: 0, removed: 0, changed: 0, unchanged: 2 });
    expect(result.stats.similarity).toBe(1);
  });

  it('detects an added line', () => {
    const result = diffLines('a', 'a\nb');
    expect(result.stats.added).toBe(1);
  });

  it('detects a removed line', () => {
    const result = diffLines('a\nb', 'a');
    expect(result.stats.removed).toBe(1);
  });

  it('pairs similar lines as a modification with inline detail', () => {
    const result = diffLines('version: 1.0.0', 'version: 2.0.0');
    expect(result.stats.changed).toBe(1);
    const line = result.lines.find((l) => l.op === 'replace');
    expect(line?.inlineLeft).toBeDefined();
    expect(line?.inlineRight?.some((c) => c.op === 'insert')).toBe(true);
  });

  it('treats dissimilar lines as a separate delete and insert', () => {
    const result = diffLines('completely different content here', 'nothing alike whatsoever xyz');
    expect(result.stats.changed).toBe(0);
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(1);
  });

  it('numbers lines on both sides correctly', () => {
    const result = diffLines('a\nb\nc', 'a\nx\nc');
    const last = result.lines[result.lines.length - 1];
    expect(last?.leftNumber).toBe(3);
    expect(last?.rightNumber).toBe(3);
  });

  it('honours ignore case', () => {
    expect(diffLines('Hello', 'hello', { ignoreCase: true }).stats.unchanged).toBe(1);
    expect(diffLines('Hello', 'hello', { ignoreCase: false }).stats.unchanged).toBe(0);
  });

  it('honours ignore whitespace', () => {
    expect(diffLines('a b', 'ab', { ignoreWhitespace: true }).stats.unchanged).toBe(1);
  });

  it('honours ignore trailing whitespace by default', () => {
    expect(diffLines('a   ', 'a').stats.unchanged).toBe(1);
  });

  it('honours ignore blank lines', () => {
    expect(diffLines('a\n\n\nb', 'a\nb', { ignoreBlankLines: true }).stats.unchanged).toBe(2);
  });

  it('honours sort lines', () => {
    expect(diffLines('b\na', 'a\nb', { sortLines: true }).stats.unchanged).toBe(2);
  });

  it('normalises CRLF before comparing', () => {
    expect(diffLines('a\r\nb', 'a\nb').stats.unchanged).toBe(2);
  });

  it('computes a similarity ratio between 0 and 1', () => {
    const result = diffLines('a\nb\nc\nd', 'a\nb\nc\nX');
    expect(result.stats.similarity).toBeGreaterThan(0);
    expect(result.stats.similarity).toBeLessThan(1);
  });
});

describe('toUnifiedDiff', () => {
  it('produces a valid header and hunk', () => {
    const result = diffLines('a\nb\nc', 'a\nX\nc');
    const patch = toUnifiedDiff(result, 'old.txt', 'new.txt');
    expect(patch).toContain('--- old.txt');
    expect(patch).toContain('+++ new.txt');
    expect(patch).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(patch).toContain('-b');
    expect(patch).toContain('+X');
  });

  it('returns an empty patch when nothing changed', () => {
    expect(toUnifiedDiff(diffLines('a', 'a'))).toBe('');
  });

  it('includes context lines around a change', () => {
    const left = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
    const right = left.replace('line10', 'CHANGED');
    const patch = toUnifiedDiff(diffLines(left, right), 'a', 'b', 3);
    expect(patch).toContain(' line7');
    expect(patch).toContain(' line13');
    expect(patch).not.toContain(' line0\n');
  });
});
