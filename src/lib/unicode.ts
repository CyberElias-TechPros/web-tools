/**
 * Unicode inspection and cleaning: per-character breakdown, escape formats,
 * normalisation, invisible/confusable character detection and smart-quote
 * straightening.
 */

export interface CharInfo {
  char: string;
  codePoint: number;
  hex: string;
  name: string;
  category: string;
  utf8: string;
  utf16: string;
  jsEscape: string;
  cssEscape: string;
  htmlEntity: string;
  isInvisible: boolean;
  isCombining: boolean;
  isEmoji: boolean;
  block: string;
}

const INVISIBLES: Record<number, string> = {
  0x00a0: 'NO-BREAK SPACE',
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x061c: 'ARABIC LETTER MARK',
  0x115f: 'HANGUL CHOSEONG FILLER',
  0x1160: 'HANGUL JUNGSEONG FILLER',
  0x17b4: 'KHMER VOWEL INHERENT AQ',
  0x17b5: 'KHMER VOWEL INHERENT AA',
  0x180e: 'MONGOLIAN VOWEL SEPARATOR',
  0x2000: 'EN QUAD',
  0x2001: 'EM QUAD',
  0x2002: 'EN SPACE',
  0x2003: 'EM SPACE',
  0x2004: 'THREE-PER-EM SPACE',
  0x2005: 'FOUR-PER-EM SPACE',
  0x2006: 'SIX-PER-EM SPACE',
  0x2007: 'FIGURE SPACE',
  0x2008: 'PUNCTUATION SPACE',
  0x2009: 'THIN SPACE',
  0x200a: 'HAIR SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x202f: 'NARROW NO-BREAK SPACE',
  0x205f: 'MEDIUM MATHEMATICAL SPACE',
  0x2060: 'WORD JOINER',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
  0x3000: 'IDEOGRAPHIC SPACE',
  0x3164: 'HANGUL FILLER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)',
  0xffa0: 'HALFWIDTH HANGUL FILLER',
  0x1d159: 'MUSICAL SYMBOL NULL NOTEHEAD',
  0xe0001: 'LANGUAGE TAG',
};

const ASCII_NAMES: Record<number, string> = {
  0: 'NULL', 1: 'START OF HEADING', 2: 'START OF TEXT', 3: 'END OF TEXT', 4: 'END OF TRANSMISSION', 5: 'ENQUIRY', 6: 'ACKNOWLEDGE',
  7: 'BELL', 8: 'BACKSPACE', 9: 'CHARACTER TABULATION (TAB)', 10: 'LINE FEED (LF)', 11: 'LINE TABULATION', 12: 'FORM FEED', 13: 'CARRIAGE RETURN (CR)',
  27: 'ESCAPE', 32: 'SPACE', 33: 'EXCLAMATION MARK', 34: 'QUOTATION MARK', 35: 'NUMBER SIGN', 36: 'DOLLAR SIGN', 37: 'PERCENT SIGN',
  38: 'AMPERSAND', 39: 'APOSTROPHE', 40: 'LEFT PARENTHESIS', 41: 'RIGHT PARENTHESIS', 42: 'ASTERISK', 43: 'PLUS SIGN', 44: 'COMMA',
  45: 'HYPHEN-MINUS', 46: 'FULL STOP', 47: 'SOLIDUS', 58: 'COLON', 59: 'SEMICOLON', 60: 'LESS-THAN SIGN', 61: 'EQUALS SIGN',
  62: 'GREATER-THAN SIGN', 63: 'QUESTION MARK', 64: 'COMMERCIAL AT', 91: 'LEFT SQUARE BRACKET', 92: 'REVERSE SOLIDUS',
  93: 'RIGHT SQUARE BRACKET', 94: 'CIRCUMFLEX ACCENT', 95: 'LOW LINE', 96: 'GRAVE ACCENT', 123: 'LEFT CURLY BRACKET',
  124: 'VERTICAL LINE', 125: 'RIGHT CURLY BRACKET', 126: 'TILDE', 127: 'DELETE',
};

const BLOCKS: Array<[number, number, string]> = [
  [0x0000, 0x007f, 'Basic Latin'],
  [0x0080, 0x00ff, 'Latin-1 Supplement'],
  [0x0100, 0x017f, 'Latin Extended-A'],
  [0x0180, 0x024f, 'Latin Extended-B'],
  [0x0250, 0x02af, 'IPA Extensions'],
  [0x02b0, 0x02ff, 'Spacing Modifier Letters'],
  [0x0300, 0x036f, 'Combining Diacritical Marks'],
  [0x0370, 0x03ff, 'Greek and Coptic'],
  [0x0400, 0x04ff, 'Cyrillic'],
  [0x0530, 0x058f, 'Armenian'],
  [0x0590, 0x05ff, 'Hebrew'],
  [0x0600, 0x06ff, 'Arabic'],
  [0x0900, 0x097f, 'Devanagari'],
  [0x0e00, 0x0e7f, 'Thai'],
  [0x10a0, 0x10ff, 'Georgian'],
  [0x1100, 0x11ff, 'Hangul Jamo'],
  [0x1e00, 0x1eff, 'Latin Extended Additional'],
  [0x2000, 0x206f, 'General Punctuation'],
  [0x2070, 0x209f, 'Superscripts and Subscripts'],
  [0x20a0, 0x20cf, 'Currency Symbols'],
  [0x2100, 0x214f, 'Letterlike Symbols'],
  [0x2150, 0x218f, 'Number Forms'],
  [0x2190, 0x21ff, 'Arrows'],
  [0x2200, 0x22ff, 'Mathematical Operators'],
  [0x2300, 0x23ff, 'Miscellaneous Technical'],
  [0x2400, 0x243f, 'Control Pictures'],
  [0x2500, 0x257f, 'Box Drawing'],
  [0x2580, 0x259f, 'Block Elements'],
  [0x25a0, 0x25ff, 'Geometric Shapes'],
  [0x2600, 0x26ff, 'Miscellaneous Symbols'],
  [0x2700, 0x27bf, 'Dingbats'],
  [0x2b00, 0x2bff, 'Misc Symbols and Arrows'],
  [0x3000, 0x303f, 'CJK Symbols and Punctuation'],
  [0x3040, 0x309f, 'Hiragana'],
  [0x30a0, 0x30ff, 'Katakana'],
  [0x4e00, 0x9fff, 'CJK Unified Ideographs'],
  [0xac00, 0xd7af, 'Hangul Syllables'],
  [0xd800, 0xdfff, 'Surrogates'],
  [0xe000, 0xf8ff, 'Private Use Area'],
  [0xfb00, 0xfb4f, 'Alphabetic Presentation Forms'],
  [0xfe00, 0xfe0f, 'Variation Selectors'],
  [0xfe70, 0xfeff, 'Arabic Presentation Forms-B'],
  [0xff00, 0xffef, 'Halfwidth and Fullwidth Forms'],
  [0xfff0, 0xffff, 'Specials'],
  [0x1f000, 0x1f02f, 'Mahjong Tiles'],
  [0x1f300, 0x1f5ff, 'Misc Symbols and Pictographs'],
  [0x1f600, 0x1f64f, 'Emoticons'],
  [0x1f680, 0x1f6ff, 'Transport and Map Symbols'],
  [0x1f900, 0x1f9ff, 'Supplemental Symbols and Pictographs'],
  [0x1fa70, 0x1faff, 'Symbols and Pictographs Extended-A'],
  [0xe0000, 0xe007f, 'Tags'],
];

function blockOf(cp: number): string {
  for (const [lo, hi, name] of BLOCKS) if (cp >= lo && cp <= hi) return name;
  return cp > 0xffff ? 'Supplementary plane' : 'Other';
}

function categoryOf(ch: string): string {
  const tests: Array<[RegExp, string]> = [
    [/\p{Lu}/u, 'Letter, uppercase'],
    [/\p{Ll}/u, 'Letter, lowercase'],
    [/\p{Lt}/u, 'Letter, titlecase'],
    [/\p{Lm}/u, 'Letter, modifier'],
    [/\p{Lo}/u, 'Letter, other'],
    [/\p{Mn}/u, 'Mark, nonspacing'],
    [/\p{Mc}/u, 'Mark, spacing'],
    [/\p{Me}/u, 'Mark, enclosing'],
    [/\p{Nd}/u, 'Number, decimal digit'],
    [/\p{Nl}/u, 'Number, letter'],
    [/\p{No}/u, 'Number, other'],
    [/\p{Pc}/u, 'Punctuation, connector'],
    [/\p{Pd}/u, 'Punctuation, dash'],
    [/\p{Ps}/u, 'Punctuation, open'],
    [/\p{Pe}/u, 'Punctuation, close'],
    [/\p{Pi}/u, 'Punctuation, initial quote'],
    [/\p{Pf}/u, 'Punctuation, final quote'],
    [/\p{Po}/u, 'Punctuation, other'],
    [/\p{Sm}/u, 'Symbol, math'],
    [/\p{Sc}/u, 'Symbol, currency'],
    [/\p{Sk}/u, 'Symbol, modifier'],
    [/\p{So}/u, 'Symbol, other'],
    [/\p{Zs}/u, 'Separator, space'],
    [/\p{Zl}/u, 'Separator, line'],
    [/\p{Zp}/u, 'Separator, paragraph'],
    [/\p{Cc}/u, 'Other, control'],
    [/\p{Cf}/u, 'Other, format'],
    [/\p{Cs}/u, 'Other, surrogate'],
    [/\p{Co}/u, 'Other, private use'],
  ];
  for (const [re, name] of tests) if (re.test(ch)) return name;
  return 'Other, not assigned';
}

function utf8Bytes(ch: string): string {
  return Array.from(new TextEncoder().encode(ch), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function utf16Units(ch: string): string {
  const units: string[] = [];
  for (let i = 0; i < ch.length; i++) units.push(ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
  return units.join(' ');
}

export function describeChar(ch: string): CharInfo {
  const cp = ch.codePointAt(0)!;
  const hex = cp.toString(16).toUpperCase().padStart(4, '0');
  const isInvisible = cp in INVISIBLES || (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
  const isCombining = /\p{M}/u.test(ch);
  const isEmoji = /\p{Extended_Pictographic}/u.test(ch);
  let name = INVISIBLES[cp] ?? ASCII_NAMES[cp];
  if (!name) {
    if (cp >= 0x30 && cp <= 0x39) name = `DIGIT ${['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][cp - 0x30]}`;
    else if (cp >= 0x41 && cp <= 0x5a) name = `LATIN CAPITAL LETTER ${ch}`;
    else if (cp >= 0x61 && cp <= 0x7a) name = `LATIN SMALL LETTER ${ch.toUpperCase()}`;
    else if (cp >= 0xfe00 && cp <= 0xfe0f) name = `VARIATION SELECTOR-${cp - 0xfe00 + 1}`;
    else if (isEmoji) name = 'EMOJI / PICTOGRAPH';
    else if (isCombining) name = 'COMBINING MARK';
    else name = `${blockOf(cp).toUpperCase()} CHARACTER`;
  }
  const units: string[] = [];
  for (let i = 0; i < ch.length; i++) units.push(`\\u${ch.charCodeAt(i).toString(16).padStart(4, '0')}`);
  return {
    char: ch,
    codePoint: cp,
    hex: `U+${hex}`,
    name,
    category: categoryOf(ch),
    utf8: utf8Bytes(ch),
    utf16: utf16Units(ch),
    jsEscape: cp > 0xffff ? `\\u{${cp.toString(16)}}` : units[0]!,
    cssEscape: `\\${cp.toString(16)}`,
    htmlEntity: `&#x${cp.toString(16)};`,
    isInvisible,
    isCombining,
    isEmoji,
    block: blockOf(cp),
  };
}

export function inspectText(text: string, limit = 2000): { chars: CharInfo[]; truncated: boolean; graphemes: number; codePoints: number; utf8Bytes: number; utf16Units: number } {
  const all = Array.from(text);
  const chars = all.slice(0, limit).map(describeChar);
  let graphemes = all.length;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new (Intl as unknown as { Segmenter: new (loc?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter(undefined, { granularity: 'grapheme' });
    graphemes = Array.from(seg.segment(text)).length;
  }
  return {
    chars,
    truncated: all.length > limit,
    graphemes,
    codePoints: all.length,
    utf8Bytes: new TextEncoder().encode(text).length,
    utf16Units: text.length,
  };
}

export interface InvisibleHit {
  index: number;
  char: string;
  codePoint: number;
  name: string;
  line: number;
  column: number;
}

export function findInvisibles(text: string): InvisibleHit[] {
  const hits: InvisibleHit[] = [];
  let line = 1;
  let col = 1;
  let index = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === '\n') {
      line++;
      col = 1;
      index += ch.length;
      continue;
    }
    const info = describeChar(ch);
    if (info.isInvisible && ch !== '\t' && ch !== '\r') hits.push({ index, char: ch, codePoint: cp, name: info.name, line, column: col });
    col++;
    index += ch.length;
  }
  return hits;
}

export interface CleanOptions {
  removeZeroWidth: boolean;
  normalizeSpaces: boolean;
  straightenQuotes: boolean;
  normalizeDashes: boolean;
  normalizeForm: 'none' | 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
  removeControl: boolean;
  trimLines: boolean;
  collapseBlankLines: boolean;
  removeBom: boolean;
}

export const defaultCleanOptions: CleanOptions = {
  removeZeroWidth: true,
  normalizeSpaces: true,
  straightenQuotes: false,
  normalizeDashes: false,
  normalizeForm: 'NFC',
  removeControl: true,
  trimLines: false,
  collapseBlankLines: false,
  removeBom: true,
};

export function cleanText(text: string, options: CleanOptions): { text: string; changes: number } {
  let out = text;
  const before = out;
  if (options.removeBom) out = out.replace(/^\uFEFF/, '').replace(/\uFEFF/g, '');
  if (options.removeZeroWidth) out = out.replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\u180E\u00AD]|\u034F|\uFE0F|[\uFE00-\uFE0E]/g, '');
  if (options.normalizeSpaces) out = out.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  if (options.straightenQuotes) out = out.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"');
  if (options.normalizeDashes) out = out.replace(/[\u2013\u2014\u2015\u2212]/g, '-').replace(/\u2026/g, '...');
  // eslint-disable-next-line no-control-regex
  if (options.removeControl) out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  if (options.normalizeForm !== 'none') out = out.normalize(options.normalizeForm);
  if (options.trimLines) out = out.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n');
  if (options.collapseBlankLines) out = out.replace(/\n{3,}/g, '\n\n');
  const a = Array.from(before);
  const b = Array.from(out);
  let changes = Math.abs(a.length - b.length);
  if (changes === 0) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changes++;
  return { text: out, changes };
}

export type EscapeFormat = 'js' | 'css' | 'html-dec' | 'html-hex' | 'python' | 'json' | 'url' | 'codepoint';

export function escapeText(text: string, format: EscapeFormat, onlyNonAscii = true): string {
  return Array.from(text)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (onlyNonAscii && cp < 0x80 && cp >= 0x20) return ch;
      const hex4 = cp.toString(16).padStart(4, '0');
      switch (format) {
        case 'js':
          return cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${hex4}`;
        case 'json': {
          if (cp > 0xffff) {
            const hi = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
            const lo = ((cp - 0x10000) % 0x400) + 0xdc00;
            return `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
          }
          return `\\u${hex4}`;
        }
        case 'python':
          return cp > 0xffff ? `\\U${cp.toString(16).padStart(8, '0')}` : `\\u${hex4}`;
        case 'css':
          return `\\${cp.toString(16)} `;
        case 'html-dec':
          return `&#${cp};`;
        case 'html-hex':
          return `&#x${cp.toString(16)};`;
        case 'url':
          return encodeURIComponent(ch);
        case 'codepoint':
          return `U+${hex4.toUpperCase()} `;
        default:
          return ch;
      }
    })
    .join('');
}

export function unescapeText(text: string): string {
  return text
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\U([0-9a-fA-F]{8})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/U\+([0-9a-fA-F]{4,6})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

/** Fancy Unicode "fonts" for social bios (mathematical alphanumerics). */
export const UNICODE_STYLES: Array<{ id: string; label: string; upper: number; lower: number; digits?: number }> = [
  { id: 'bold', label: '𝐁𝐨𝐥𝐝', upper: 0x1d400, lower: 0x1d41a, digits: 0x1d7ce },
  { id: 'italic', label: '𝐼𝑡𝑎𝑙𝑖𝑐', upper: 0x1d434, lower: 0x1d44e },
  { id: 'bold-italic', label: '𝑩𝒐𝒍𝒅 𝒊𝒕𝒂𝒍𝒊𝒄', upper: 0x1d468, lower: 0x1d482 },
  { id: 'script', label: '𝒮𝒸𝓇𝒾𝓅𝓉', upper: 0x1d49c, lower: 0x1d4b6 },
  { id: 'bold-script', label: '𝓑𝓸𝓵𝓭 𝓼𝓬𝓻𝓲𝓹𝓽', upper: 0x1d4d0, lower: 0x1d4ea },
  { id: 'fraktur', label: '𝔉𝔯𝔞𝔨𝔱𝔲𝔯', upper: 0x1d504, lower: 0x1d51e },
  { id: 'double-struck', label: '𝔻𝕠𝕦𝕓𝕝𝕖', upper: 0x1d538, lower: 0x1d552, digits: 0x1d7d8 },
  { id: 'sans', label: '𝖲𝖺𝗇𝗌', upper: 0x1d5a0, lower: 0x1d5ba, digits: 0x1d7e2 },
  { id: 'sans-bold', label: '𝗦𝗮𝗻𝘀 𝗯𝗼𝗹𝗱', upper: 0x1d5d4, lower: 0x1d5ee, digits: 0x1d7ec },
  { id: 'sans-italic', label: '𝘚𝘢𝘯𝘴 𝘪𝘵𝘢𝘭𝘪𝘤', upper: 0x1d608, lower: 0x1d622 },
  { id: 'monospace', label: '𝙼𝚘𝚗𝚘', upper: 0x1d670, lower: 0x1d68a, digits: 0x1d7f6 },
  { id: 'circled', label: 'Ⓒⓘⓡⓒⓛⓔⓓ', upper: 0x24b6, lower: 0x24d0 },
  { id: 'fullwidth', label: 'Ｆｕｌｌｗｉｄｔｈ', upper: 0xff21, lower: 0xff41, digits: 0xff10 },
];

// A few mathematical letters are missing from the contiguous blocks and live elsewhere.
const HOLES: Record<number, string> = {
  0x1d455: 'ℎ', 0x1d49d: 'ℬ', 0x1d4a0: 'ℰ', 0x1d4a1: 'ℱ', 0x1d4a3: 'ℋ', 0x1d4a4: 'ℐ', 0x1d4a7: 'ℒ', 0x1d4a8: 'ℳ', 0x1d4ad: 'ℛ',
  0x1d4ba: 'ℯ', 0x1d4bc: 'ℊ', 0x1d4c4: 'ℴ', 0x1d506: 'ℭ', 0x1d50b: 'ℌ', 0x1d50c: 'ℑ', 0x1d515: 'ℜ', 0x1d51d: 'ℨ', 0x1d53a: 'ℂ',
  0x1d53f: 'ℍ', 0x1d545: 'ℕ', 0x1d547: 'ℙ', 0x1d548: 'ℚ', 0x1d549: 'ℝ', 0x1d551: 'ℤ',
};

export function styleText(text: string, styleId: string): string {
  const style = UNICODE_STYLES.find((s) => s.id === styleId);
  if (!style) return text;
  return Array.from(text)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      let target: number | null = null;
      if (cp >= 0x41 && cp <= 0x5a) target = style.upper + (cp - 0x41);
      else if (cp >= 0x61 && cp <= 0x7a) target = style.lower + (cp - 0x61);
      else if (cp >= 0x30 && cp <= 0x39 && style.digits) target = style.digits + (cp - 0x30);
      if (target === null) return ch;
      return HOLES[target] ?? String.fromCodePoint(target);
    })
    .join('');
}
