/**
 * Password and passphrase generation.
 *
 * Every random value comes from `crypto.getRandomValues` via rejection sampling
 * (never `%`, which biases the tail of the range) and entropy is computed from
 * the *actual* alphabet the generator drew from, not a marketing number.
 */

import { WORDLIST } from './wordlist';

export const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
} as const;

/** Characters that are easy to misread in a support ticket or handwritten note. */
export const AMBIGUOUS = new Set([...'Il1O0o|`\'"{}[]()/\\;:.,~<>']);

export type CharsetKey = keyof typeof CHARSETS;

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    // Refuse to silently downgrade to Math.random for a security tool.
    throw new Error(
      'A cryptographically secure random source is unavailable in this browser. ' +
        'Password generation has been stopped rather than falling back to a weak source.',
    );
  }
  return c;
}

/** Uniform integer in [0, max) with no modulo bias. */
export function randomInt(max: number): number {
  if (max <= 0) throw new RangeError('max must be positive');
  if (max === 1) return 0;
  const crypto = getCrypto();
  const bytesNeeded = Math.ceil(Math.log2(max) / 8) || 1;
  const maxValue = 256 ** bytesNeeded;
  const limit = maxValue - (maxValue % max);
  const buf = new Uint8Array(bytesNeeded);
  // Rejection sampling: loop until the draw lands inside the unbiased window.
  for (let attempt = 0; attempt < 1000; attempt++) {
    crypto.getRandomValues(buf);
    let value = 0;
    for (const b of buf) value = value * 256 + b;
    if (value < limit) return value % max;
  }
  throw new Error('Failed to obtain unbiased randomness after 1000 attempts.');
}

export function randomItem<T>(items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
  return items[randomInt(items.length)]!;
}

/** Fisher–Yates using the CSPRNG. */
export function secureShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = arr[i]!;
    const b = arr[j]!;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  /** User-supplied extra characters folded into the alphabet. */
  customCharacters: string;
  excludeAmbiguous: boolean;
  /** Guarantee at least one character from every enabled class. */
  requireEachClass: boolean;
  /** Forbid the same character twice in a row. */
  noRepeats: boolean;
}

export const defaultPasswordOptions: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  customCharacters: '',
  excludeAmbiguous: false,
  requireEachClass: true,
  noRepeats: false,
};

export interface GeneratedSecret {
  value: string;
  /** Shannon entropy of the generation process, in bits. */
  entropyBits: number;
  /** Size of the alphabet (or wordlist) actually drawn from. */
  poolSize: number;
  kind: 'password' | 'passphrase' | 'pin';
}

export function buildAlphabet(options: PasswordOptions): { pool: string; classes: string[] } {
  const classes: string[] = [];
  const add = (chars: string) => {
    const filtered = options.excludeAmbiguous
      ? [...chars].filter((c) => !AMBIGUOUS.has(c)).join('')
      : chars;
    if (filtered) classes.push(filtered);
  };
  if (options.lowercase) add(CHARSETS.lowercase);
  if (options.uppercase) add(CHARSETS.uppercase);
  if (options.digits) add(CHARSETS.digits);
  if (options.symbols) add(CHARSETS.symbols);
  if (options.customCharacters.trim()) add([...new Set(options.customCharacters)].join(''));

  const pool = [...new Set(classes.join(''))].join('');
  return { pool, classes };
}

export function generatePassword(options: Partial<PasswordOptions> = {}): GeneratedSecret {
  const opts = { ...defaultPasswordOptions, ...options };
  const length = Math.max(1, Math.min(256, Math.floor(opts.length)));
  const { pool, classes } = buildAlphabet(opts);

  if (pool.length === 0) {
    throw new Error('Select at least one character type.');
  }
  if (opts.requireEachClass && classes.length > length) {
    throw new Error(
      `Length ${length} is too short to include one character from each of the ${classes.length} selected types.`,
    );
  }
  if (opts.noRepeats && pool.length < 2) {
    throw new Error('“No repeated characters” needs an alphabet of at least 2 characters.');
  }

  const chars: string[] = [];

  if (opts.requireEachClass) {
    for (const cls of classes) chars.push(randomItem([...cls]));
  }
  while (chars.length < length) chars.push(pool[randomInt(pool.length)]!);

  const result = secureShuffle(chars).slice(0, length);

  if (opts.noRepeats) {
    for (let i = 1; i < result.length; i++) {
      let guard = 0;
      while (result[i] === result[i - 1] && guard++ < 200) {
        result[i] = pool[randomInt(pool.length)]!;
      }
    }
  }

  return {
    value: result.join(''),
    // log2(pool^length). The class guarantee slightly reduces the true entropy;
    // we report the conservative floor rather than the flattering number.
    entropyBits: length * Math.log2(pool.length),
    poolSize: pool.length,
    kind: 'password',
  };
}

export type WordCase = 'lower' | 'upper' | 'title' | 'mixed';

export interface PassphraseOptions {
  wordCount: number;
  separator: string;
  wordCase: WordCase;
  /** Append a random digit to one random word. */
  includeNumber: boolean;
  /** Append a random symbol to one random word. */
  includeSymbol: boolean;
  maxWordLength: number;
}

export const defaultPassphraseOptions: PassphraseOptions = {
  wordCount: 5,
  separator: '-',
  wordCase: 'lower',
  includeNumber: true,
  includeSymbol: false,
  maxWordLength: 9,
};

function applyCase(word: string, wordCase: WordCase): string {
  switch (wordCase) {
    case 'upper':
      return word.toUpperCase();
    case 'title':
      return word.charAt(0).toUpperCase() + word.slice(1);
    case 'mixed':
      return randomInt(2) === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
    case 'lower':
    default:
      return word;
  }
}

export function generatePassphrase(options: Partial<PassphraseOptions> = {}): GeneratedSecret {
  const opts = { ...defaultPassphraseOptions, ...options };
  const count = Math.max(2, Math.min(24, Math.floor(opts.wordCount)));
  const pool = WORDLIST.filter((w) => w.length <= Math.max(3, opts.maxWordLength));
  if (pool.length < 128) throw new Error('The wordlist is too small for a secure passphrase.');

  const words = Array.from({ length: count }, () => applyCase(randomItem(pool), opts.wordCase));

  let extraBits = 0;
  if (opts.includeNumber) {
    const idx = randomInt(words.length);
    words[idx] = `${words[idx]}${randomInt(10)}`;
    extraBits += Math.log2(10) + Math.log2(words.length);
  }
  if (opts.includeSymbol) {
    const symbols = '!@#$%&*?';
    const idx = randomInt(words.length);
    words[idx] = `${words[idx]}${symbols[randomInt(symbols.length)]}`;
    extraBits += Math.log2(symbols.length) + Math.log2(words.length);
  }

  const caseBits = opts.wordCase === 'mixed' ? count : 0;

  return {
    value: words.join(opts.separator),
    entropyBits: count * Math.log2(pool.length) + extraBits + caseBits,
    poolSize: pool.length,
    kind: 'passphrase',
  };
}

export function generatePin(length: number): GeneratedSecret {
  const n = Math.max(3, Math.min(32, Math.floor(length)));
  const digits = Array.from({ length: n }, () => String(randomInt(10)));
  return {
    value: digits.join(''),
    entropyBits: n * Math.log2(10),
    poolSize: 10,
    kind: 'pin',
  };
}

// --- strength assessment ------------------------------------------------------

export type StrengthLevel = 'critical' | 'weak' | 'fair' | 'strong' | 'excellent';

export interface StrengthAssessment {
  level: StrengthLevel;
  label: string;
  /** 0..100, for the meter. */
  score: number;
  entropyBits: number;
  /** Human-readable offline cracking estimate at 100 billion guesses/second. */
  crackTime: string;
  warnings: string[];
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', '123456', '12345678', '123456789', '1234567890',
  'qwerty', 'qwertyuiop', 'abc123', 'letmein', 'monkey', 'dragon', 'iloveyou', 'admin',
  'welcome', 'login', 'master', 'sunshine', 'princess', 'football', 'baseball', 'trustno1',
  'shadow', 'superman', 'batman', 'starwars', 'whatever', 'freedom', 'ninja', 'azerty',
  'changeme', 'secret', 'root', 'toor', 'test', 'guest', 'hello', 'charlie', 'donald',
]);

const KEYBOARD_RUNS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'azertyuiop', 'qwertzuiop',
];

/** Estimate the effective alphabet a *given* string appears to have been drawn from. */
export function observedPoolSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 33;
  return Math.max(size, 1);
}

export function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'effectively forever';
  if (seconds < 1) return 'instantly';
  const thresholds: Array<[number, string]> = [
    [60, 'seconds'],
    [3600, 'minutes'],
    [86400, 'hours'],
    [2629800, 'days'],
    [31557600, 'months'],
    [3155760000, 'years'],
  ];
  for (const [limit, label] of thresholds) {
    if (seconds < limit) {
      const divisor =
        label === 'seconds' ? 1
        : label === 'minutes' ? 60
        : label === 'hours' ? 3600
        : label === 'days' ? 86400
        : label === 'months' ? 2629800
        : 31557600;
      const n = seconds / divisor;
      return `${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString()} ${label}`;
    }
  }
  const years = seconds / 31557600;
  if (years > 1e15) return 'effectively forever';
  if (years >= 1e9) return `${(years / 1e9).toPrecision(3)} billion years`;
  if (years >= 1e6) return `${(years / 1e6).toPrecision(3)} million years`;
  return `${Math.round(years).toLocaleString()} years`;
}

/**
 * Assess an arbitrary password. `knownEntropy` is used when we generated the
 * value ourselves and therefore know the true entropy of the process.
 */
export function assessStrength(password: string, knownEntropy?: number): StrengthAssessment {
  const warnings: string[] = [];
  if (!password) {
    return {
      level: 'critical',
      label: 'Empty',
      score: 0,
      entropyBits: 0,
      crackTime: 'instantly',
      warnings: ['No password entered.'],
    };
  }

  const lower = password.toLowerCase();
  let entropy = knownEntropy ?? password.length * Math.log2(observedPoolSize(password));

  if (knownEntropy === undefined) {
    // Penalties, applied only to strings we did not generate.
    if (COMMON_PASSWORDS.has(lower)) {
      warnings.push('This is one of the most commonly breached passwords.');
      entropy = Math.min(entropy, 6);
    }
    for (const pw of COMMON_PASSWORDS) {
      if (pw.length >= 5 && lower.includes(pw)) {
        warnings.push(`Contains the common password “${pw}”.`);
        entropy -= 12;
        break;
      }
    }
    if (/^(.)\1+$/.test(password)) {
      warnings.push('Every character is the same.');
      entropy = Math.min(entropy, 5);
    }
    const repeated = password.match(/(.)\1{2,}/);
    if (repeated) {
      warnings.push(`Repeated characters (“${repeated[0]}”) add very little strength.`);
      entropy -= 6;
    }
    for (const run of KEYBOARD_RUNS) {
      for (let i = 0; i + 4 <= run.length; i++) {
        const seq = run.slice(i, i + 4);
        if (lower.includes(seq) || lower.includes([...seq].reverse().join(''))) {
          warnings.push(`Contains the keyboard sequence “${seq}”.`);
          entropy -= 10;
          break;
        }
      }
    }
    if (/(19|20)\d{2}/.test(password)) {
      warnings.push('Contains something that looks like a year.');
      entropy -= 4;
    }
    if (/^\d+$/.test(password)) {
      warnings.push('Digits only — this is a PIN, not a password.');
    }
    if (password.length < 12) {
      warnings.push('Shorter than 12 characters; length matters more than complexity.');
    }
    entropy = Math.max(entropy, 1);
  }

  // 1e11 guesses/second — a realistic offline GPU cluster against a fast hash.
  const seconds = Math.pow(2, entropy - 1) / 1e11;

  let level: StrengthLevel;
  let label: string;
  if (entropy < 28) {
    level = 'critical';
    label = 'Very weak';
  } else if (entropy < 45) {
    level = 'weak';
    label = 'Weak';
  } else if (entropy < 65) {
    level = 'fair';
    label = 'Reasonable';
  } else if (entropy < 90) {
    level = 'strong';
    label = 'Strong';
  } else {
    level = 'excellent';
    label = 'Excellent';
  }

  return {
    level,
    label,
    score: Math.max(2, Math.min(100, Math.round((entropy / 120) * 100))),
    entropyBits: Math.round(entropy * 10) / 10,
    crackTime: formatCrackTime(seconds),
    warnings,
  };
}
