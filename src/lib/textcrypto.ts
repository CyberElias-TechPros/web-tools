/**
 * Password-based encryption for text and files: AES-256-GCM with a key
 * derived by PBKDF2-SHA-256 (600k iterations). Output is a compact
 * self-describing envelope so it can be decrypted later by this tool.
 */
import { base64ToBytes, bytesToBase64 } from './encoding';

const MAGIC = 'WT1'; // version tag
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const saltCopy = new Uint8Array(salt.byteLength);
  saltCopy.set(salt);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltCopy, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface EncryptedEnvelope {
  /** Base64 text envelope: WT1.<iterations>.<salt>.<iv>.<ciphertext> */
  text: string;
  bytes: Uint8Array;
}

/** Encrypt bytes → binary envelope (magic + iterations + salt + iv + ciphertext). */
export async function encryptBytes(data: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('Choose a password first.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const dataCopy = new Uint8Array(data.byteLength);
  dataCopy.set(data);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataCopy));
  const header = encoder.encode(MAGIC);
  const out = new Uint8Array(header.length + 4 + 16 + 12 + cipher.length);
  let o = 0;
  out.set(header, o);
  o += header.length;
  new DataView(out.buffer).setUint32(o, ITERATIONS);
  o += 4;
  out.set(salt, o);
  o += 16;
  out.set(iv, o);
  o += 12;
  out.set(cipher, o);
  return out;
}

export async function decryptBytes(envelope: Uint8Array, password: string): Promise<Uint8Array> {
  if (envelope.length < 3 + 4 + 16 + 12 + 16) throw new Error('This does not look like an encrypted payload from this tool.');
  const magic = decoder.decode(envelope.subarray(0, 3));
  if (magic !== MAGIC) throw new Error('Unrecognised format — the data was not encrypted by this tool.');
  const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
  const iterations = view.getUint32(3);
  const salt = envelope.subarray(7, 23);
  const iv = envelope.subarray(23, 35);
  const cipher = envelope.subarray(35);
  const key = await deriveKey(password, salt, iterations);
  const ivCopy = new Uint8Array(iv);
  const cipherCopy = new Uint8Array(cipher);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivCopy }, key, cipherCopy));
  } catch {
    throw new Error('Decryption failed — wrong password or the data was modified.');
  }
}

export async function encryptText(plain: string, password: string): Promise<string> {
  const bytes = await encryptBytes(encoder.encode(plain), password);
  const b64 = bytesToBase64(bytes);
  return b64.replace(/(.{76})/g, '$1\n').trim();
}

export async function decryptText(envelopeText: string, password: string): Promise<string> {
  const clean = envelopeText.replace(/\s+/g, '');
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(clean);
  } catch {
    throw new Error('The ciphertext is not valid Base64.');
  }
  const plain = await decryptBytes(bytes, password);
  return decoder.decode(plain);
}

export function isEncryptedEnvelope(text: string): boolean {
  try {
    const bytes = base64ToBytes(text.replace(/\s+/g, ''));
    return bytes.length > 3 && decoder.decode(bytes.subarray(0, 3)) === MAGIC;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Password strength                                                          */
/* -------------------------------------------------------------------------- */

export interface StrengthReport {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  entropyBits: number;
  crackTime: string;
  suggestions: string[];
  poolSize: number;
}

const COMMON = new Set(['password', '123456', '12345678', 'qwerty', 'abc123', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'passw0rd', 'master', 'login', '111111', '000000', 'password1', 'qwerty123']);

export function passwordStrength(password: string): StrengthReport {
  const suggestions: string[] = [];
  if (!password) return { score: 0, label: 'Empty', entropyBits: 0, crackTime: 'instantly', suggestions: ['Type a password to analyse it.'], poolSize: 0 };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  if (/[^\x20-\x7e]/.test(password)) pool += 100;
  let entropy = password.length * Math.log2(Math.max(2, pool));

  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.replace(/\d+$/, ''))) {
    entropy = Math.min(entropy, 10);
    suggestions.push('This is one of the most common passwords — avoid it entirely.');
  }
  if (/^(.)\1+$/.test(password)) {
    entropy = Math.min(entropy, 6);
    suggestions.push('Repeating a single character adds no security.');
  }
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(password)) {
    entropy -= 10;
    suggestions.push('Avoid keyboard walks and sequences like 1234 or qwerty.');
  }
  if (/(.{2,})\1/.test(password)) {
    entropy -= 8;
    suggestions.push('Repeated chunks reduce entropy.');
  }
  if (/^(19|20)\d{2}$/.test(password) || /(19|20)\d{2}/.test(password)) suggestions.push('Years are easy to guess.');
  if (password.length < 12) suggestions.push('Use at least 12 characters — length beats complexity.');
  if (pool <= 26) suggestions.push('Mix in uppercase letters, digits or symbols.');
  if (!suggestions.length && password.length < 16) suggestions.push('Strong. A passphrase of 4+ random words would be even stronger.');
  entropy = Math.max(0, entropy);

  // 10 billion guesses/second offline attack.
  const seconds = 2 ** entropy / 1e10;
  const score: StrengthReport['score'] = entropy < 28 ? 0 : entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4;
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;
  return { score, label: labels[score], entropyBits: Math.round(entropy), crackTime: humanTime(seconds), suggestions, poolSize: pool };
}

function humanTime(seconds: number): string {
  if (seconds < 1) return 'instantly';
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = hours / 24;
  if (days < 365) return `${Math.round(days)} days`;
  const years = days / 365.25;
  if (years < 1e3) return `${Math.round(years)} years`;
  if (years < 1e6) return `${Math.round(years / 1e3)} thousand years`;
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`;
  if (years < 1e12) return `${Math.round(years / 1e9)} billion years`;
  return 'longer than the universe has existed';
}

/* -------------------------------------------------------------------------- */
/* Password / passphrase generation                                          */
/* -------------------------------------------------------------------------- */

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
  customSymbols?: string;
}

export const defaultPasswordOptions: PasswordOptions = { length: 20, lowercase: true, uppercase: true, digits: true, symbols: true, excludeAmbiguous: true };

const AMBIGUOUS = new Set('0O1lI|`\'"{}[]()<>;:,.');

export function generatePassword(options: PasswordOptions): string {
  const sets: string[] = [];
  const filter = (s: string) => (options.excludeAmbiguous ? Array.from(s).filter((c) => !AMBIGUOUS.has(c)).join('') : s);
  if (options.lowercase) sets.push(filter('abcdefghijklmnopqrstuvwxyz'));
  if (options.uppercase) sets.push(filter('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  if (options.digits) sets.push(filter('0123456789'));
  if (options.symbols) sets.push(filter(options.customSymbols?.trim() || '!@#$%^&*-_=+?~'));
  const usable = sets.filter((s) => s.length > 0);
  if (!usable.length) throw new Error('Enable at least one character set.');
  const all = usable.join('');
  const length = Math.max(4, Math.min(256, options.length));
  const chars: string[] = [];
  // Guarantee one from each set, then fill randomly, then shuffle.
  for (const set of usable) chars.push(randomFrom(set));
  while (chars.length < length) chars.push(randomFrom(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.slice(0, length).join('');
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % maxExclusive;
}

function randomFrom(set: string): string {
  return set[randomInt(set.length)]!;
}

const WORDLIST = `able acid aged also area army away baby back ball band bank base bath bear beat been beer bell belt best bill bird blow blue boat body bomb bond bone book boom born boss both bowl bulk burn bush busy call calm came camp card care case cash cast cell chat chip city club coal coat code cold come cook cool cope copy core cost crew crop dark data date dawn days dead deal dean dear debt deep deny desk dial diet dirt disc disk does done door dose down draw drew drop drug dual duke dust duty each earn ease east easy edge else even ever evil exit face fact fail fair fall farm fast fate fear feed feel feet fell felt file fill film find fine fire firm fish five flat flow food foot ford form fort four free from fuel full fund gain game gate gave gear gene gift girl give glad goal goes gold golf gone good gray grew grey grow gulf hair half hall hand hang hard harm hate have head hear heat held hell help here hero high hill hire hold hole holy home hope host hour huge hung hunt hurt idea inch into iron item jack jane jean john join jump jury just keen keep kent kept kick kill kind king knee knew know lack lady laid lake land lane last late lead left less life lift like line link list live load loan lock logo long look lord lose loss lost love luck made mail main make male many mark mass matt meal mean meat meet menu mere mike mile milk mill mind mine miss mode mood moon more most move much must name navy near neck need news next nice nick nine none nose note okay once only onto open oral over pace pack page paid pain pair palm park part pass past path peak pick pink pipe plan play plot plug plus poll pool poor port post pull pure push race rail rain rank rare rate read real rear rely rent rest rice rich ride ring rise risk road rock role roll roof room root rose rule rush ruth safe said sake sale salt same sand save seat seed seek seem seen self sell send sent sept ship shop shot show shut sick side sign site size skin slip slow snow soft soil sold sole some song soon sort soul spot star stay step stop such suit sure take tale talk tall tank tape task team tech tell tend term test text than that them then they thin this thus till time tiny told toll tone tony took tool tour town tree trip true tune turn twin type unit upon used user vary vast very vice view vote wage wait wake walk wall want ward warm wash wave ways weak wear week well went were west what when whom wide wife wild will wind wine wing wire wise wish with wood word wore work yard yeah year your zero zone amber anvil apple arrow atlas badge bagel baker basil beach berry bison blaze bloom brave brick brook cabin cactus camel candy canoe cargo cedar chalk cherry chess cider cliff cloud clover cobalt comet coral crane crisp daisy delta denim dune eagle ember fable falcon fern fjord flame flint forest fossil galaxy garnet ginger glade globe grape harbor hazel heron honey igloo iris ivory jade jasper jungle kayak kernel lagoon lantern lemon lilac linen lotus lunar maple marble meadow mellow mint mosaic nectar noble nutmeg oasis olive onyx opal orbit orchid otter oyster panda pebble pepper pilot pine pixel plum polar poppy prism quartz quill radar raven reef ridge river robin rocket saffron sage salmon sapphire scarlet shadow silver sketch slate solar sonic spark spruce summit sunny tango terra thunder tiger topaz torch trail tulip tundra umber velvet violet walnut willow winter yonder zephyr zinnia`.split(/\s+/);

export function generatePassphrase(words = 5, separator = '-', capitalize = false, addNumber = false): string {
  const picked: string[] = [];
  for (let i = 0; i < Math.max(2, Math.min(12, words)); i++) {
    const w = WORDLIST[randomInt(WORDLIST.length)]!;
    picked.push(capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w);
  }
  if (addNumber) picked.push(String(randomInt(100)));
  return picked.join(separator);
}

export const PASSPHRASE_WORDLIST_SIZE = WORDLIST.length;
