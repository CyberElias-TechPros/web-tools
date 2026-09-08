import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS,
  assessStrength,
  buildAlphabet,
  defaultPasswordOptions,
  formatCrackTime,
  generatePassphrase,
  generatePassword,
  generatePin,
  observedPoolSize,
  randomInt,
  secureShuffle,
} from '@/lib/password';
import { WORDLIST, WORDLIST_SIZE } from '@/lib/wordlist';

describe('wordlist', () => {
  it('is large enough for meaningful entropy', () => {
    expect(WORDLIST_SIZE).toBeGreaterThanOrEqual(1024);
    expect(Math.log2(WORDLIST_SIZE)).toBeGreaterThan(10);
  });

  it('contains no duplicates', () => {
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
  });

  it('contains only short lowercase ASCII words', () => {
    for (const word of WORDLIST) {
      expect(word).toMatch(/^[a-z]{2,9}$/);
    }
  });
});

describe('randomInt', () => {
  it('always returns a value inside the range', () => {
    for (let i = 0; i < 500; i++) {
      const value = randomInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });

  it('returns 0 for a range of 1', () => {
    expect(randomInt(1)).toBe(0);
  });

  it('rejects a non-positive range', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
  });

  it('covers the whole range over many draws', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) seen.add(randomInt(6));
    expect(seen.size).toBe(6);
  });

  it('is reasonably uniform', () => {
    const counts = new Array<number>(4).fill(0);
    const draws = 8000;
    for (let i = 0; i < draws; i++) counts[randomInt(4)]!++;
    for (const count of counts) {
      // Each bucket should be within 20% of the expected 25%.
      expect(count).toBeGreaterThan(draws * 0.2);
      expect(count).toBeLessThan(draws * 0.3);
    }
  });
});

describe('secureShuffle', () => {
  it('preserves every element', () => {
    const input = [1, 2, 3, 4, 5];
    const shuffled = secureShuffle(input);
    expect(shuffled.sort()).toEqual(input);
  });

  it('does not mutate its argument', () => {
    const input = [1, 2, 3];
    secureShuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('buildAlphabet', () => {
  it('includes every enabled class', () => {
    const { pool } = buildAlphabet(defaultPasswordOptions);
    expect(pool).toMatch(/[a-z]/);
    expect(pool).toMatch(/[A-Z]/);
    expect(pool).toMatch(/[0-9]/);
  });

  it('removes ambiguous characters when asked', () => {
    const { pool } = buildAlphabet({ ...defaultPasswordOptions, excludeAmbiguous: true });
    for (const char of pool) expect(AMBIGUOUS.has(char)).toBe(false);
  });

  it('deduplicates custom characters', () => {
    const { pool } = buildAlphabet({
      ...defaultPasswordOptions,
      lowercase: false,
      uppercase: false,
      digits: false,
      symbols: false,
      customCharacters: 'aaabbb',
    });
    expect(pool).toBe('ab');
  });
});

describe('generatePassword', () => {
  it('honours the requested length', () => {
    for (const length of [4, 12, 20, 64, 128]) {
      expect(generatePassword({ length }).value).toHaveLength(length);
    }
  });

  it('clamps absurd lengths instead of hanging', () => {
    expect(generatePassword({ length: 9999 }).value.length).toBe(256);
  });

  it('includes at least one character from each enabled class', () => {
    for (let i = 0; i < 30; i++) {
      const { value } = generatePassword({ length: 8, requireEachClass: true });
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('only uses the selected classes', () => {
    const { value } = generatePassword({
      length: 40,
      lowercase: true,
      uppercase: false,
      digits: false,
      symbols: false,
    });
    expect(value).toMatch(/^[a-z]+$/);
  });

  it('avoids repeated adjacent characters when asked', () => {
    for (let i = 0; i < 20; i++) {
      const { value } = generatePassword({ length: 30, noRepeats: true });
      expect(value).not.toMatch(/(.)\1/);
    }
  });

  it('rejects an empty alphabet with a helpful error', () => {
    expect(() =>
      generatePassword({
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
        customCharacters: '',
      }),
    ).toThrow(/at least one/i);
  });

  it('rejects a length too short to satisfy the class requirement', () => {
    expect(() => generatePassword({ length: 2, requireEachClass: true })).toThrow(/too short/i);
  });

  it('reports entropy consistent with the pool size', () => {
    const result = generatePassword({ length: 20 });
    expect(result.entropyBits).toBeCloseTo(20 * Math.log2(result.poolSize), 5);
  });

  it('produces different values on successive calls', () => {
    const values = new Set(Array.from({ length: 50 }, () => generatePassword().value));
    expect(values.size).toBe(50);
  });
});

describe('generatePassphrase', () => {
  it('produces the requested number of words', () => {
    const { value } = generatePassphrase({ wordCount: 5, separator: '-', includeNumber: false });
    expect(value.split('-')).toHaveLength(5);
  });

  it('applies the requested capitalisation', () => {
    const { value } = generatePassphrase({
      wordCount: 4,
      wordCase: 'title',
      includeNumber: false,
      separator: '-',
    });
    for (const word of value.split('-')) expect(word[0]).toMatch(/[A-Z]/);
  });

  it('appends a digit when asked', () => {
    const { value } = generatePassphrase({ wordCount: 4, includeNumber: true });
    expect(value).toMatch(/\d/);
  });

  it('appends a symbol when asked', () => {
    const { value } = generatePassphrase({ wordCount: 4, includeSymbol: true });
    expect(value).toMatch(/[!@#$%&*?]/);
  });

  it('clamps the word count to a sane range', () => {
    expect(generatePassphrase({ wordCount: 1, separator: '-', includeNumber: false }).value.split('-')).toHaveLength(2);
    expect(generatePassphrase({ wordCount: 99, separator: '-', includeNumber: false }).value.split('-')).toHaveLength(24);
  });

  it('respects the maximum word length', () => {
    const { value } = generatePassphrase({
      wordCount: 8,
      maxWordLength: 5,
      separator: '-',
      includeNumber: false,
    });
    for (const word of value.split('-')) expect(word.length).toBeLessThanOrEqual(5);
  });

  it('reports entropy derived from the real wordlist size', () => {
    const result = generatePassphrase({ wordCount: 6, includeNumber: false, includeSymbol: false, wordCase: 'lower' });
    expect(result.entropyBits).toBeCloseTo(6 * Math.log2(result.poolSize), 5);
    expect(result.entropyBits).toBeGreaterThan(60);
  });
});

describe('generatePin', () => {
  it('produces only digits of the requested length', () => {
    const { value } = generatePin(6);
    expect(value).toMatch(/^\d{6}$/);
  });

  it('clamps out-of-range lengths', () => {
    expect(generatePin(1).value).toHaveLength(3);
    expect(generatePin(999).value).toHaveLength(32);
  });
});

describe('observedPoolSize', () => {
  it('sums the classes present', () => {
    expect(observedPoolSize('abc')).toBe(26);
    expect(observedPoolSize('abcABC')).toBe(52);
    expect(observedPoolSize('abc123')).toBe(36);
    expect(observedPoolSize('abc!')).toBe(59);
  });
});

describe('assessStrength', () => {
  it('flags an empty password', () => {
    expect(assessStrength('').level).toBe('critical');
  });

  it('flags well-known passwords', () => {
    const result = assessStrength('password');
    expect(result.level).toBe('critical');
    expect(result.warnings.join(' ')).toMatch(/breached/i);
  });

  it('flags keyboard runs', () => {
    expect(assessStrength('qwertyuiop').warnings.join(' ')).toMatch(/keyboard/i);
  });

  it('flags repeated characters', () => {
    expect(assessStrength('aaaaaaaaaaaa').warnings.join(' ')).toMatch(/repeated|same/i);
  });

  it('flags years', () => {
    expect(assessStrength('Tr0ub4dor1995!').warnings.join(' ')).toMatch(/year/i);
  });

  it('flags short passwords', () => {
    expect(assessStrength('Ab1!xy').warnings.join(' ')).toMatch(/12 characters/i);
  });

  it('rates a long random password highly', () => {
    const result = assessStrength('7Kq#zP2wLm!9vRt$XbN4');
    expect(['strong', 'excellent']).toContain(result.level);
    expect(result.warnings).toHaveLength(0);
  });

  it('uses the known entropy when we generated the value', () => {
    const generated = generatePassword({ length: 24 });
    const assessment = assessStrength(generated.value, generated.entropyBits);
    expect(assessment.entropyBits).toBeCloseTo(generated.entropyBits, 0);
    expect(assessment.warnings).toHaveLength(0);
  });

  it('never returns a score outside 0-100', () => {
    for (const password of ['', 'a', 'password', generatePassword({ length: 128 }).value]) {
      const { score } = assessStrength(password);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('formatCrackTime', () => {
  it('describes very small durations as instant', () => {
    expect(formatCrackTime(0.0001)).toBe('instantly');
  });
  it('scales through the units', () => {
    expect(formatCrackTime(30)).toMatch(/seconds/);
    expect(formatCrackTime(300)).toMatch(/minutes/);
    expect(formatCrackTime(7200)).toMatch(/hours/);
    expect(formatCrackTime(200000)).toMatch(/days/);
    expect(formatCrackTime(1e7)).toMatch(/months/);
    expect(formatCrackTime(1e9)).toMatch(/years/);
  });
  it('caps absurd durations', () => {
    expect(formatCrackTime(Number.POSITIVE_INFINITY)).toMatch(/forever/);
    expect(formatCrackTime(1e40)).toMatch(/forever/);
  });
});
