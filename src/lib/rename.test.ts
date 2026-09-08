import { describe, expect, it } from 'vitest';
import {
  applyCase,
  applyRules,
  buildRenamePreview,
  deduplicateNames,
  defaultRenameRules,
  joinName,
  slugifyName,
  splitName,
  splitWords,
  stripAccents,
  validateFilename,
} from '@/lib/rename';

const rules = defaultRenameRules;
const at = (index: number, overrides: Partial<typeof rules> = {}, name = 'file.txt'): string =>
  applyRules(name, { ...rules, ...overrides }, index, new Date(2025, 0, 15)).result;

describe('splitName', () => {
  it('separates the extension', () => {
    expect(splitName('photo.jpg')).toEqual({ base: 'photo', extension: 'jpg' });
  });
  it('uses only the final dot', () => {
    expect(splitName('archive.tar.gz')).toEqual({ base: 'archive.tar', extension: 'gz' });
  });
  it('treats a dotfile as having no extension', () => {
    expect(splitName('.gitignore')).toEqual({ base: '.gitignore', extension: '' });
  });
  it('handles names without a dot', () => {
    expect(splitName('README')).toEqual({ base: 'README', extension: '' });
  });
  it('round-trips through joinName', () => {
    for (const name of ['a.txt', '.env', 'no-ext', 'a.b.c']) {
      expect(joinName(splitName(name))).toBe(name);
    }
  });
});

describe('splitWords', () => {
  it('splits camelCase', () => {
    expect(splitWords('myFileName')).toEqual(['my', 'File', 'Name']);
  });
  it('splits consecutive capitals correctly', () => {
    expect(splitWords('HTTPServer')).toEqual(['HTTP', 'Server']);
  });
  it('splits on separators', () => {
    expect(splitWords('my_file-name.here')).toEqual(['my', 'file', 'name', 'here']);
  });
});

describe('applyCase', () => {
  it('leaves text alone in none mode', () => {
    expect(applyCase('My File', 'none')).toBe('My File');
  });
  it('applies each case mode', () => {
    expect(applyCase('my file name', 'upper')).toBe('MY FILE NAME');
    expect(applyCase('MY FILE', 'lower')).toBe('my file');
    expect(applyCase('my file', 'title')).toBe('My File');
    expect(applyCase('my file name', 'camel')).toBe('myFileName');
    expect(applyCase('my file name', 'pascal')).toBe('MyFileName');
    expect(applyCase('my file name', 'snake')).toBe('my_file_name');
    expect(applyCase('my file name', 'kebab')).toBe('my-file-name');
    expect(applyCase('my file name', 'sentence')).toBe('My file name');
  });
});

describe('stripAccents & slugifyName', () => {
  it('removes diacritics', () => {
    expect(stripAccents('Résumé Ünïcode')).toBe('Resume Unicode');
  });
  it('produces url-safe slugs', () => {
    expect(slugifyName('Final Report (v2) — DRAFT')).toBe('final-report-v2-draft');
  });
  it('collapses and trims separators', () => {
    expect(slugifyName('  a   b  ')).toBe('a-b');
  });
});

describe('applyRules', () => {
  it('is a no-op with default rules', () => {
    expect(at(0)).toBe('file.txt');
  });

  it('applies find and replace to the base name only', () => {
    expect(at(0, { find: 'file', replace: 'doc' })).toBe('doc.txt');
    expect(at(0, { find: 'txt', replace: 'md' })).toBe('file.txt');
  });

  it('is case-insensitive by default', () => {
    expect(at(0, { find: 'FILE', replace: 'x' })).toBe('x.txt');
  });

  it('honours case sensitivity', () => {
    expect(at(0, { find: 'FILE', replace: 'x', caseSensitive: true })).toBe('file.txt');
  });

  it('supports regex with capture groups', () => {
    const result = applyRules(
      'IMG_1234.jpg',
      { ...rules, useRegex: true, find: '^IMG_(\\d+)$', replace: 'photo-$1' },
      0,
    );
    expect(result.result).toBe('photo-1234.jpg');
  });

  it('reports an invalid regex instead of throwing', () => {
    const result = applyRules('a.txt', { ...rules, useRegex: true, find: '([' }, 0);
    expect(result.errors[0]).toMatch(/invalid regex/i);
  });

  it('escapes regex metacharacters in plain mode', () => {
    expect(applyRules('a.b.txt', { ...rules, find: '.', replace: '-' }, 0).result).toBe('a-b.txt');
  });

  it('adds prefixes and suffixes', () => {
    expect(at(0, { prefix: 'pre-', suffix: '-post' })).toBe('pre-file-post.txt');
  });

  it('numbers files sequentially with padding', () => {
    expect(at(0, { numbering: true, numberStart: 1, numberPadding: 3 })).toBe('file-001.txt');
    expect(at(9, { numbering: true, numberStart: 1, numberPadding: 3 })).toBe('file-010.txt');
  });

  it('numbers as a prefix when requested', () => {
    expect(at(0, { numbering: true, numberPosition: 'prefix', numberPadding: 2 })).toBe('01-file.txt');
  });

  it('changes the extension', () => {
    expect(at(0, { extensionMode: 'replace', newExtension: 'md' })).toBe('file.md');
    expect(at(0, { extensionMode: 'replace', newExtension: '.md' })).toBe('file.md');
  });

  it('normalises extension case', () => {
    expect(applyRules('a.JPEG', { ...rules, extensionMode: 'lower' }, 0).result).toBe('a.jpeg');
    expect(applyRules('a.jpeg', { ...rules, extensionMode: 'upper' }, 0).result).toBe('a.JPEG');
  });

  it('removes the extension', () => {
    expect(at(0, { extensionMode: 'remove' })).toBe('file');
  });

  it('trims characters from either end', () => {
    expect(applyRules('prefix_name.txt', { ...rules, trimStart: 7 }, 0).result).toBe('name.txt');
    expect(applyRules('name_suffix.txt', { ...rules, trimEnd: 7 }, 0).result).toBe('name.txt');
  });

  it('slugifies', () => {
    expect(applyRules('Final Report (v2).docx', { ...rules, slugify: true }, 0).result).toBe(
      'final-report-v2.docx',
    );
  });

  it('adds the date', () => {
    expect(at(0, { includeDate: true })).toBe('2025-01-15-file.txt');
    expect(at(0, { includeDate: true, datePosition: 'suffix' })).toBe('file-2025-01-15.txt');
  });

  it('tidies repeated separators', () => {
    expect(applyRules('a--b__c.txt', { ...rules, tidySeparators: true }, 0).result).toBe('a-b_c.txt');
  });

  it('applies rules in a stable order', () => {
    const result = applyRules(
      'Photo Ünïcode.JPEG',
      {
        ...rules,
        removeAccents: true,
        caseMode: 'kebab',
        prefix: 'x-',
        numbering: true,
        numberPadding: 2,
        extensionMode: 'lower',
      },
      0,
    );
    expect(result.result).toBe('x-photo-unicode-01.jpeg');
  });
});

describe('validateFilename', () => {
  it('accepts a normal name', () => {
    expect(validateFilename('report.pdf').errors).toHaveLength(0);
  });

  it('rejects an empty name', () => {
    expect(validateFilename('   ').errors[0]).toMatch(/empty/i);
  });

  it('rejects path separators', () => {
    expect(validateFilename('a/b.txt').errors.join(' ')).toMatch(/path separator/i);
    expect(validateFilename('a\\b.txt').errors.join(' ')).toMatch(/path separator|illegal/i);
  });

  it('rejects dot and dot-dot', () => {
    expect(validateFilename('..').errors.length).toBeGreaterThan(0);
  });

  it('rejects Windows-illegal characters', () => {
    expect(validateFilename('a:b.txt').errors.join(' ')).toMatch(/illegal/i);
    expect(validateFilename('a?b.txt').errors.join(' ')).toMatch(/illegal/i);
  });

  it('rejects Windows reserved device names', () => {
    expect(validateFilename('CON.txt').errors.join(' ')).toMatch(/reserved/i);
    expect(validateFilename('lpt1.log').errors.join(' ')).toMatch(/reserved/i);
  });

  it('rejects names over 255 bytes', () => {
    expect(validateFilename('a'.repeat(300)).errors.join(' ')).toMatch(/255 bytes/);
  });

  it('warns about trailing dots and spaces', () => {
    expect(validateFilename('name.').warnings.join(' ')).toMatch(/trailing/i);
  });

  it('warns about hidden files', () => {
    expect(validateFilename('.hidden').warnings.join(' ')).toMatch(/hidden/i);
  });

  it('warns about non-ASCII characters', () => {
    expect(validateFilename('café.txt').warnings.join(' ')).toMatch(/non-ascii/i);
  });
});

describe('buildRenamePreview', () => {
  const files = [
    { id: '1', name: 'a.txt' },
    { id: '2', name: 'b.txt' },
  ];

  it('marks unchanged files', () => {
    const preview = buildRenamePreview(files, rules);
    expect(preview.every((item) => !item.changed)).toBe(true);
  });

  it('detects collisions between results', () => {
    const preview = buildRenamePreview(files, { ...rules, find: '[ab]', replace: 'same', useRegex: true });
    expect(preview.every((item) => item.errors.some((e) => /same name/i.test(e)))).toBe(true);
  });

  it('treats collisions case-insensitively', () => {
    const preview = buildRenamePreview(
      [
        { id: '1', name: 'A.txt' },
        { id: '2', name: 'a.txt' },
      ],
      { ...rules, caseMode: 'lower' },
    );
    expect(preview[0]?.errors.some((e) => /same name/i.test(e))).toBe(true);
  });

  it('numbers each file by its index', () => {
    const preview = buildRenamePreview(files, { ...rules, numbering: true, numberPadding: 1 });
    expect(preview.map((item) => item.result)).toEqual(['a-1.txt', 'b-2.txt']);
  });
});

describe('deduplicateNames', () => {
  it('appends a counter and clears the collision error', () => {
    const preview = buildRenamePreview(
      [
        { id: '1', name: 'a.txt' },
        { id: '2', name: 'b.txt' },
      ],
      { ...rules, find: '[ab]', replace: 'same', useRegex: true },
    );
    const deduped = deduplicateNames(preview);
    expect(deduped.map((item) => item.result)).toEqual(['same.txt', 'same (2).txt']);
    expect(deduped.every((item) => item.errors.length === 0)).toBe(true);
  });

  it('produces globally unique names for a large batch', () => {
    const files = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `f${i}.txt` }));
    const preview = buildRenamePreview(files, { ...rules, find: '\\d+', replace: '', useRegex: true });
    const deduped = deduplicateNames(preview);
    expect(new Set(deduped.map((item) => item.result.toLowerCase())).size).toBe(50);
  });
});
