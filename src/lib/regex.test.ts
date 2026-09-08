import { describe, expect, it } from 'vitest';
import {
  explainRegex,
  lintRegex,
  parseRegex,
  runRegex,
  runReplace,
} from '@/lib/regex';

const ast = (pattern: string) => {
  const result = parseRegex(pattern);
  expect(result.error).toBeNull();
  return result.ast!;
};

describe('parseRegex', () => {
  it('parses literals into a sequence', () => {
    const node = ast('abc');
    expect(node.type).toBe('sequence');
  });

  it('parses character classes with ranges', () => {
    const node = ast('[a-z0-9_]');
    expect(node.type).toBe('sequence');
  });

  it('parses negated character classes', () => {
    const result = parseRegex('[^abc]');
    expect(result.error).toBeNull();
  });

  it('counts capture groups', () => {
    expect(parseRegex('(a)(b)(?:c)').groupCount).toBe(2);
  });

  it('records named groups', () => {
    const result = parseRegex('(?<year>\\d{4})-(?<month>\\d{2})');
    expect(result.groupNames).toEqual(['year', 'month']);
  });

  it('parses every lookaround form', () => {
    for (const pattern of ['(?=a)', '(?!a)', '(?<=a)', '(?<!a)']) {
      expect(parseRegex(pattern).error).toBeNull();
    }
  });

  it('parses quantifiers including lazy ones', () => {
    for (const pattern of ['a*', 'a+', 'a?', 'a{2}', 'a{2,}', 'a{2,5}', 'a*?', 'a+?']) {
      expect(parseRegex(pattern).error).toBeNull();
    }
  });

  it('parses alternation', () => {
    const node = ast('a|b|c');
    expect(node.type).toBe('alternation');
  });

  it('parses escapes and shorthands', () => {
    for (const pattern of ['\\d', '\\w', '\\s', '\\b', '\\.', '\\\\', '\\u0041', '\\x41', '\\n']) {
      expect(parseRegex(pattern).error).toBeNull();
    }
  });

  it('parses backreferences', () => {
    expect(parseRegex('(a)\\1').error).toBeNull();
    expect(parseRegex('(?<x>a)\\k<x>').error).toBeNull();
  });

  it('reports an unmatched opening parenthesis', () => {
    const result = parseRegex('(abc');
    expect(result.error?.message).toMatch(/unmatched opening/i);
  });

  it('reports an unmatched closing parenthesis', () => {
    expect(parseRegex('abc)').error?.message).toMatch(/unmatched closing/i);
  });

  it('reports an unterminated character class', () => {
    expect(parseRegex('[abc').error?.message).toMatch(/unterminated character class/i);
  });

  it('reports an empty character class', () => {
    expect(parseRegex('[]').error?.message).toMatch(/empty character class/i);
  });

  it('reports a reversed character range', () => {
    expect(parseRegex('[z-a]').error?.message).toMatch(/out of order/i);
  });

  it('reports a dangling backslash', () => {
    expect(parseRegex('abc\\').error?.message).toMatch(/dangling backslash/i);
  });

  it('reports nothing-to-repeat', () => {
    expect(parseRegex('*abc').error?.message).toMatch(/nothing to repeat/i);
  });

  it('reports a backwards quantifier range', () => {
    expect(parseRegex('a{5,2}').error?.message).toMatch(/lower than its minimum/i);
  });

  it('reports an error index inside the pattern', () => {
    const result = parseRegex('ab[cd');
    expect(result.error?.index).toBeGreaterThan(1);
  });

  it('accepts every preset pattern used by the UI', () => {
    const patterns = [
      "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
      'https?://[\\w.-]+(?:/[\\w./?%&=~+-]*)?',
      '(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])',
      '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\b',
      '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b',
      '\\b(\\w+)\\s+\\1\\b',
      '^(?<level>ERROR|WARN|INFO)\\s+\\[(?<time>[^\\]]+)\\]\\s+(?<message>.*)$',
    ];
    for (const pattern of patterns) {
      expect(parseRegex(pattern).error, pattern).toBeNull();
      // The browser must also accept everything our parser accepts.
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});

describe('explainRegex', () => {
  it('describes shorthand classes in plain English', () => {
    const lines = explainRegex(ast('\\d'));
    expect(lines[0]?.text).toMatch(/digit/);
  });

  it('collapses adjacent literals into one phrase', () => {
    const lines = explainRegex(ast('abc'));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toContain('abc');
  });

  it('describes quantifiers', () => {
    expect(explainRegex(ast('a+'))[0]?.text).toMatch(/one or more/);
    expect(explainRegex(ast('a*'))[0]?.text).toMatch(/zero or more/);
    expect(explainRegex(ast('a{3}'))[0]?.text).toMatch(/exactly 3/);
    expect(explainRegex(ast('a{2,5}'))[0]?.text).toMatch(/between 2 and 5/);
    expect(explainRegex(ast('a+?'))[0]?.text).toMatch(/as few as possible/);
  });

  it('describes anchors', () => {
    expect(explainRegex(ast('^'))[0]?.text).toMatch(/start of the string/);
    expect(explainRegex(ast('\\b'))[0]?.text).toMatch(/word boundary/);
  });

  it('describes named groups', () => {
    const text = explainRegex(ast('(?<year>\\d{4})')).map((l) => l.text).join(' ');
    expect(text).toMatch(/capture group “year”/);
  });

  it('describes lookaheads', () => {
    const text = explainRegex(ast('(?!x)')).map((l) => l.text).join(' ');
    expect(text).toMatch(/negative lookahead/i);
  });

  it('describes alternation options', () => {
    const text = explainRegex(ast('a|b')).map((l) => l.text).join(' ');
    expect(text).toMatch(/alternatives/);
    expect(text).toMatch(/option 1/);
  });

  it('produces a line for every node with a valid source span', () => {
    const lines = explainRegex(ast('^(?<a>\\d+)-[a-z]{2}$'));
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      expect(line.end).toBeGreaterThanOrEqual(line.start);
    }
  });
});

describe('lintRegex', () => {
  it('warns about nested unbounded quantifiers', () => {
    const warnings = lintRegex(ast('(a+)+'), '(a+)+', '');
    expect(warnings.some((w) => /backtracking/i.test(w.message))).toBe(true);
  });

  it('warns about adjacent wildcards', () => {
    const warnings = lintRegex(ast('.*.*'), '.*.*', '');
    expect(warnings.some((w) => /redundant/i.test(w.message))).toBe(true);
  });

  it('errors when \\p is used without the u flag', () => {
    const result = parseRegex('\\p{L}');
    const warnings = lintRegex(result.ast!, '\\p{L}', '');
    expect(warnings.some((w) => w.severity === 'error')).toBe(true);
  });

  it('stays quiet on a well-behaved pattern', () => {
    const warnings = lintRegex(ast('^\\d{4}-\\d{2}$'), '^\\d{4}-\\d{2}$', 'g');
    expect(warnings).toHaveLength(0);
  });
});

describe('runRegex', () => {
  it('finds all matches with the g flag', () => {
    const result = runRegex('\\d+', 'g', 'a1 b22 c333');
    expect(result.matches.map((m) => m.value)).toEqual(['1', '22', '333']);
    expect(result.error).toBeNull();
  });

  it('records the index and length of each match', () => {
    const result = runRegex('b', 'g', 'abc');
    expect(result.matches[0]).toMatchObject({ index: 1, length: 1 });
  });

  it('exposes numbered and named groups', () => {
    const result = runRegex('(?<y>\\d{4})-(\\d{2})', 'g', '2024-11');
    const names = result.matches[0]?.groups.map((g) => g.name);
    expect(names).toContain('y');
    expect(names).toContain('1');
  });

  it('returns an error for an invalid pattern instead of throwing', () => {
    const result = runRegex('([', 'g', 'x');
    expect(result.error).toBeTruthy();
    expect(result.matches).toHaveLength(0);
  });

  it('does not loop forever on an empty match', () => {
    const result = runRegex('a*', 'g', 'bbb');
    expect(result.matches.length).toBeLessThan(10);
  });

  it('caps the number of matches', () => {
    const result = runRegex('a', 'g', 'a'.repeat(20000));
    expect(result.truncated).toBe(true);
    expect(result.matches.length).toBeLessThanOrEqual(5000);
  });

  it('respects the multiline flag', () => {
    expect(runRegex('^b', 'gm', 'a\nb').matches).toHaveLength(1);
    expect(runRegex('^b', 'g', 'a\nb').matches).toHaveLength(0);
  });

  it('respects the case-insensitive flag', () => {
    expect(runRegex('abc', 'gi', 'ABC').matches).toHaveLength(1);
  });
});

describe('runReplace', () => {
  it('replaces with a whole-match reference', () => {
    expect(runReplace('\\d+', 'g', 'a1b2', '[$&]').output).toBe('a[1]b[2]');
  });

  it('replaces with capture group references', () => {
    expect(runReplace('(\\w+)@(\\w+)', 'g', 'me@here', '$2:$1').output).toBe('here:me');
  });

  it('returns an error for an invalid pattern', () => {
    expect(runReplace('([', 'g', 'x', 'y').error).toBeTruthy();
  });
});
