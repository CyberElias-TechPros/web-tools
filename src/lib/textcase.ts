/**
 * Case conversion, slugging and word splitting that copes with camelCase,
 * snake_case, kebab-case, acronyms (HTMLParser → HTML Parser) and Unicode.
 */

export type CaseId =
  | 'lower'
  | 'upper'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'screaming-snake'
  | 'kebab'
  | 'train'
  | 'dot'
  | 'path'
  | 'constant'
  | 'alternating'
  | 'inverse'
  | 'capitalize-words'
  | 'slug';

export const CASES: Array<{ id: CaseId; label: string; example: string }> = [
  { id: 'lower', label: 'lower case', example: 'the quick brown fox' },
  { id: 'upper', label: 'UPPER CASE', example: 'THE QUICK BROWN FOX' },
  { id: 'title', label: 'Title Case', example: 'The Quick Brown Fox' },
  { id: 'sentence', label: 'Sentence case', example: 'The quick brown fox' },
  { id: 'capitalize-words', label: 'Capitalize Each Word', example: 'The Quick Brown Fox' },
  { id: 'camel', label: 'camelCase', example: 'theQuickBrownFox' },
  { id: 'pascal', label: 'PascalCase', example: 'TheQuickBrownFox' },
  { id: 'snake', label: 'snake_case', example: 'the_quick_brown_fox' },
  { id: 'screaming-snake', label: 'SCREAMING_SNAKE', example: 'THE_QUICK_BROWN_FOX' },
  { id: 'kebab', label: 'kebab-case', example: 'the-quick-brown-fox' },
  { id: 'train', label: 'Train-Case', example: 'The-Quick-Brown-Fox' },
  { id: 'dot', label: 'dot.case', example: 'the.quick.brown.fox' },
  { id: 'path', label: 'path/case', example: 'the/quick/brown/fox' },
  { id: 'slug', label: 'url-slug', example: 'the-quick-brown-fox' },
  { id: 'alternating', label: 'aLtErNaTiNg', example: 'tHe QuIcK bRoWn FoX' },
  { id: 'inverse', label: 'iNVERSE', example: 'tHE qUICK bROWN fOX' },
];

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'via', 'vs', 'yet']);

/** Split any identifier or phrase into lowercase words. */
export function splitWords(input: string): string[] {
  return input
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2') // camelCase → camel Case
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2') // HTMLParser → HTML Parser
    .replace(/([\p{L}])(\d)/gu, '$1 $2')
    .replace(/(\d)([\p{L}])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);

export function toTitleCase(text: string): string {
  const words = text.split(/(\s+)/);
  let wordIndex = 0;
  const total = words.filter((w) => w.trim()).length;
  return words
    .map((w) => {
      if (!w.trim()) return w;
      wordIndex++;
      const lower = w.toLowerCase();
      const isEdge = wordIndex === 1 || wordIndex === total;
      if (!isEdge && SMALL_WORDS.has(lower)) return lower;
      // Preserve ALL-CAPS acronyms.
      if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      return w
        .split('-')
        .map((part) => cap(part.toLowerCase()))
        .join('-');
    })
    .join('');
}

export function toSentenceCase(text: string): string {
  const lowered = text.toLowerCase();
  return lowered.replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase()).replace(/\bi\b/g, 'I');
}

export function slugify(text: string, separator = '-'): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'o')
    .replace(/œ/gi, 'oe')
    .replace(/[^a-zA-Z0-9\s_-]+/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, separator)
    .replace(new RegExp(`^${escapeRe(separator)}+|${escapeRe(separator)}+$`, 'g'), '');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function convertCase(text: string, target: CaseId): string {
  // Multi-line input: convert each line independently so lists stay lists.
  if (text.includes('\n') && !['lower', 'upper', 'sentence', 'title', 'alternating', 'inverse', 'capitalize-words'].includes(target)) {
    return text
      .split('\n')
      .map((line) => (line.trim() ? convertCase(line, target) : line))
      .join('\n');
  }
  const words = splitWords(text);
  switch (target) {
    case 'lower':
      return text.toLowerCase();
    case 'upper':
      return text.toUpperCase();
    case 'title':
      return toTitleCase(text);
    case 'sentence':
      return toSentenceCase(text);
    case 'capitalize-words':
      return text.replace(/\p{L}[\p{L}\p{N}']*/gu, (w) => cap(w.toLowerCase()));
    case 'camel':
      return words.map((w, i) => (i === 0 ? w : cap(w))).join('');
    case 'pascal':
      return words.map(cap).join('');
    case 'snake':
      return words.join('_');
    case 'screaming-snake':
    case 'constant':
      return words.join('_').toUpperCase();
    case 'kebab':
      return words.join('-');
    case 'train':
      return words.map(cap).join('-');
    case 'dot':
      return words.join('.');
    case 'path':
      return words.join('/');
    case 'slug':
      return slugify(text);
    case 'alternating':
      return alternate(text, true);
    case 'inverse':
      return Array.from(text)
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join('');
    default:
      return text;
  }
}

function alternate(text: string, startLower: boolean): string {
  let upper = !startLower;
  return Array.from(text)
    .map((c) => {
      if (!/\p{L}/u.test(c)) return c;
      const out = upper ? c.toUpperCase() : c.toLowerCase();
      upper = !upper;
      return out;
    })
    .join('');
}

export function detectCase(text: string): CaseId | null {
  const t = text.trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(t)) return 'camel';
  if (/^(?:[A-Z][a-z0-9]*){2,}$/.test(t)) return 'pascal';
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(t)) return 'snake';
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(t)) return 'screaming-snake';
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(t)) return 'kebab';
  if (/^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(t)) return 'dot';
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) return 'upper';
  if (t === t.toLowerCase() && /[a-z]/.test(t)) return 'lower';
  if (/^(?:[A-Z][a-z']*\s*)+$/.test(t)) return 'title';
  return null;
}
