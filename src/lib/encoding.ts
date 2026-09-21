/**
 * Text encodings: Base64 (standard, URL-safe, binary), URL encoding/parsing
 * and HTML entities. All UTF-8 correct — `btoa` alone silently corrupts
 * anything outside Latin-1.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/* -------------------------------------------------------------------------- */
/* Base64                                                                     */
/* -------------------------------------------------------------------------- */

export function bytesToBase64(bytes: Uint8Array, urlSafe = false, padding = true): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  let out = btoa(binary);
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_');
  if (!padding) out = out.replace(/=+$/, '');
  return out;
}

export function base64ToBytes(input: string): Uint8Array {
  let clean = input.replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  // Strip a data-URI prefix if someone pasted one.
  const comma = clean.indexOf(',');
  if (/^data:/i.test(clean) && comma > 0) clean = clean.slice(comma + 1);
  if (!/^[A-Za-z0-9+/]*=*$/.test(clean)) {
    const bad = /[^A-Za-z0-9+/=]/.exec(clean);
    throw new Error(`Invalid Base64: unexpected character “${bad?.[0] ?? '?'}”.`);
  }
  while (clean.length % 4 !== 0) clean += '=';
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new Error('Invalid Base64: the input is truncated or mis-padded.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64(text: string, options: { urlSafe?: boolean; padding?: boolean; lineLength?: number } = {}): string {
  const out = bytesToBase64(encoder.encode(text), options.urlSafe, options.padding ?? true);
  if (options.lineLength && options.lineLength > 0) return out.replace(new RegExp(`(.{1,${options.lineLength}})`, 'g'), '$1\n').trim();
  return out;
}

export function decodeBase64(text: string): { text: string; bytes: Uint8Array; isText: boolean } {
  const bytes = base64ToBytes(text);
  const decoded = decoder.decode(bytes);
  // Heuristic: if decoding produced replacement characters or many control
  // characters, treat the payload as binary.
  // eslint-disable-next-line no-control-regex
  const suspicious = (decoded.match(/[\uFFFD\u0000-\u0008\u000E-\u001F]/g) ?? []).length;
  const isText = bytes.length === 0 || suspicious / Math.max(1, decoded.length) < 0.02;
  return { text: decoded, bytes, isText };
}

export function isLikelyBase64(text: string): boolean {
  const clean = text.replace(/\s+/g, '');
  return clean.length >= 4 && clean.length % 4 === 0 && /^[A-Za-z0-9+/_-]+=*$/.test(clean);
}

/* -------------------------------------------------------------------------- */
/* URL                                                                        */
/* -------------------------------------------------------------------------- */

export type UrlEncodeMode = 'component' | 'uri' | 'form';

export function urlEncode(text: string, mode: UrlEncodeMode = 'component'): string {
  if (mode === 'uri') return encodeURI(text);
  const encoded = encodeURIComponent(text);
  if (mode === 'form') return encoded.replace(/%20/g, '+').replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return encoded;
}

export function urlDecode(text: string, mode: UrlEncodeMode = 'component'): string {
  const source = mode === 'form' ? text.replace(/\+/g, ' ') : text;
  try {
    return decodeURIComponent(source);
  } catch {
    // Decode what we can, leaving malformed escapes intact.
    return source.replace(/(%[0-9A-Fa-f]{2})+/g, (m) => {
      try {
        return decodeURIComponent(m);
      } catch {
        return m;
      }
    });
  }
}

export interface ParsedUrl {
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  params: Array<{ key: string; value: string }>;
  pathSegments: string[];
}

export function parseUrl(input: string): ParsedUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
  const params: Array<{ key: string; value: string }> = [];
  url.searchParams.forEach((value, key) => params.push({ key, value }));
  return {
    href: url.href,
    protocol: url.protocol.replace(/:$/, ''),
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: url.origin,
    params,
    pathSegments: url.pathname.split('/').filter(Boolean).map((s) => urlDecode(s)),
  };
}

export function buildQueryString(params: Array<{ key: string; value: string }>): string {
  const sp = new URLSearchParams();
  for (const { key, value } of params) if (key) sp.append(key, value);
  return sp.toString();
}

/* -------------------------------------------------------------------------- */
/* HTML entities                                                              */
/* -------------------------------------------------------------------------- */

const NAMED: Record<string, string> = {
  '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos', '\u00a0': 'nbsp', '©': 'copy', '®': 'reg', '™': 'trade',
  '€': 'euro', '£': 'pound', '¥': 'yen', '¢': 'cent', '§': 'sect', '¶': 'para', '°': 'deg', '±': 'plusmn', '×': 'times',
  '÷': 'divide', '—': 'mdash', '–': 'ndash', '…': 'hellip', '“': 'ldquo', '”': 'rdquo', '‘': 'lsquo', '’': 'rsquo',
  '«': 'laquo', '»': 'raquo', '•': 'bull', '·': 'middot', '←': 'larr', '→': 'rarr', '↑': 'uarr', '↓': 'darr',
  '½': 'frac12', '¼': 'frac14', '¾': 'frac34', 'µ': 'micro', '¿': 'iquest', '¡': 'iexcl', '∞': 'infin', '≠': 'ne',
  '≤': 'le', '≥': 'ge', '√': 'radic', '∑': 'sum', 'π': 'pi', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta',
  'λ': 'lambda', 'μ': 'mu', 'Ω': 'Omega', 'ω': 'omega', 'θ': 'theta', 'σ': 'sigma', '♥': 'hearts', '♦': 'diams',
  '♣': 'clubs', '♠': 'spades', 'é': 'eacute', 'è': 'egrave', 'ê': 'ecirc', 'ë': 'euml', 'á': 'aacute', 'à': 'agrave',
  'â': 'acirc', 'ä': 'auml', 'ã': 'atilde', 'å': 'aring', 'ç': 'ccedil', 'í': 'iacute', 'ì': 'igrave', 'î': 'icirc',
  'ï': 'iuml', 'ñ': 'ntilde', 'ó': 'oacute', 'ò': 'ograve', 'ô': 'ocirc', 'ö': 'ouml', 'õ': 'otilde', 'ø': 'oslash',
  'ú': 'uacute', 'ù': 'ugrave', 'û': 'ucirc', 'ü': 'uuml', 'ý': 'yacute', 'ÿ': 'yuml', 'ß': 'szlig', 'æ': 'aelig',
  'É': 'Eacute', 'Ü': 'Uuml', 'Ö': 'Ouml', 'Ä': 'Auml', 'Ñ': 'Ntilde', 'Ç': 'Ccedil', 'Å': 'Aring', 'Ø': 'Oslash',
};
const NAMED_REVERSE: Record<string, string> = Object.fromEntries(Object.entries(NAMED).map(([ch, name]) => [name, ch]));
NAMED_REVERSE.QUOT = '"';
NAMED_REVERSE.AMP = '&';
NAMED_REVERSE.LT = '<';
NAMED_REVERSE.GT = '>';

export type EntityMode = 'minimal' | 'named' | 'numeric' | 'hex' | 'all-numeric';

export function encodeHtmlEntities(text: string, mode: EntityMode = 'named'): string {
  return Array.from(text)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      const minimal = ch === '&' || ch === '<' || ch === '>' || ch === '"' || ch === "'";
      if (mode === 'minimal') return minimal ? `&${NAMED[ch]};` : ch;
      if (mode === 'all-numeric') return cp > 0x7e || minimal ? `&#${cp};` : ch;
      if (cp < 0x7f && !minimal) return ch;
      if (mode === 'named' && NAMED[ch]) return `&${NAMED[ch]};`;
      if (mode === 'hex') return `&#x${cp.toString(16).toUpperCase()};`;
      if (mode === 'numeric' || !NAMED[ch]) return `&#${cp};`;
      return `&${NAMED[ch]};`;
    })
    .join('');
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = /^#x/i.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_REVERSE[body] ?? match;
  });
}

/* -------------------------------------------------------------------------- */
/* Misc text encodings                                                        */
/* -------------------------------------------------------------------------- */

export function bytesToHex(bytes: Uint8Array, separator = ''): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(separator);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '').replace(/[\s:,-]+/g, '');
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error('Hex input must contain an even number of hex digits.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function textToBinary(text: string, separator = ' '): string {
  return Array.from(encoder.encode(text), (b) => b.toString(2).padStart(8, '0')).join(separator);
}

export function binaryToText(binary: string): string {
  const groups = binary.trim().split(/[\s,]+/).filter(Boolean);
  const bytes = new Uint8Array(groups.length);
  groups.forEach((g, i) => {
    if (!/^[01]{1,8}$/.test(g)) throw new Error(`“${g}” is not a binary byte.`);
    bytes[i] = parseInt(g, 2);
  });
  return decoder.decode(bytes);
}

export function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....',
  '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.',
  '-': '-....-', '_': '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split(/\s+/)
    .map((word) => Array.from(word).map((ch) => MORSE[ch] ?? '').filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
}

export function morseToText(morse: string): string {
  return morse
    .trim()
    .split(/\s*\/\s*|\s{3,}/)
    .map((word) => word.trim().split(/\s+/).map((code) => MORSE_REVERSE[code] ?? (code ? '?' : '')).join(''))
    .join(' ');
}
