/**
 * JSON Web Token decoding, inspection and HMAC verification (HS256/384/512).
 * Never sends anything anywhere — verification runs in WebCrypto.
 */
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './encoding';

export interface JwtClaimInfo {
  key: string;
  label: string;
  value: unknown;
  display: string;
  status?: 'ok' | 'warn' | 'error';
  note?: string;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  raw: { header: string; payload: string; signature: string };
  claims: JwtClaimInfo[];
  issues: string[];
  algorithm: string;
  expired: boolean | null;
  notYetValid: boolean | null;
}

const KNOWN_CLAIMS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires at',
  nbf: 'Not before',
  iat: 'Issued at',
  jti: 'JWT ID',
  scope: 'Scope',
  scp: 'Scopes',
  azp: 'Authorised party',
  nonce: 'Nonce',
  email: 'Email',
  name: 'Name',
  preferred_username: 'Preferred username',
  roles: 'Roles',
  sid: 'Session ID',
  auth_time: 'Authentication time',
};

function decodeSegment(segment: string, what: string): Record<string, unknown> {
  let text: string;
  try {
    text = utf8Decode(base64ToBytes(segment));
  } catch {
    throw new Error(`The ${what} is not valid Base64url.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The ${what} is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`The ${what} must be a JSON object.`);
  return parsed as Record<string, unknown>;
}

function formatTimestamp(seconds: number, now: number): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return String(seconds);
  const diff = seconds - now;
  const abs = Math.abs(diff);
  const units: Array<[number, string]> = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  let rel = 'now';
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      rel = `${n} ${name}${n === 1 ? '' : 's'} ${diff < 0 ? 'ago' : 'from now'}`;
      break;
    }
  }
  return `${date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')} (${rel})`;
}

export function decodeJwt(token: string, now = Math.floor(Date.now() / 1000)): DecodedJwt {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  if (!trimmed) throw new Error('Paste a token to decode it.');
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    throw new Error(`A JWT has three dot-separated parts; this input has ${parts.length}.${parts.length === 5 ? ' Five parts means it is a JWE (encrypted) token, which cannot be decoded without the key.' : ''}`);
  }
  const [h, p, s] = parts as [string, string, string];
  const header = decodeSegment(h, 'header');
  const payload = decodeSegment(p, 'payload');
  const issues: string[] = [];
  const algorithm = typeof header.alg === 'string' ? header.alg : 'unknown';

  if (algorithm === 'none') issues.push('The header declares alg "none" — this token is unsigned and must not be trusted.');
  if (!header.typ) issues.push('Header has no "typ" claim (usually "JWT").');
  if (!s) issues.push('The signature segment is empty.');

  const claims: JwtClaimInfo[] = [];
  let expired: boolean | null = null;
  let notYetValid: boolean | null = null;
  for (const [key, value] of Object.entries(payload)) {
    const info: JwtClaimInfo = { key, label: KNOWN_CLAIMS[key] ?? key, value, display: typeof value === 'string' ? value : JSON.stringify(value) };
    if ((key === 'exp' || key === 'nbf' || key === 'iat' || key === 'auth_time') && typeof value === 'number') {
      info.display = formatTimestamp(value, now);
      if (key === 'exp') {
        expired = value <= now;
        info.status = expired ? 'error' : 'ok';
        info.note = expired ? 'Token has expired.' : 'Token is still valid.';
      }
      if (key === 'nbf') {
        notYetValid = value > now;
        info.status = notYetValid ? 'warn' : 'ok';
        if (notYetValid) info.note = 'Token is not valid yet.';
      }
      if (key === 'iat' && value > now + 300) {
        info.status = 'warn';
        info.note = 'Issued in the future — check clock skew.';
      }
    }
    claims.push(info);
  }
  if (payload.exp === undefined) issues.push('No "exp" claim — the token never expires.');
  if (expired) issues.push('The token expired.');
  if (notYetValid) issues.push('The token is not valid yet (nbf is in the future).');

  return { header, payload, signature: s, raw: { header: h, payload: p, signature: s }, claims, issues, algorithm, expired, notYetValid };
}

const HMAC_ALGS: Record<string, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

export function supportsVerification(alg: string): boolean {
  return alg in HMAC_ALGS;
}

/** Verify an HS256/384/512 signature with a shared secret. */
export async function verifyJwtHmac(token: string, secret: string, secretIsBase64 = false): Promise<boolean> {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;
  const [h, p, s] = parts as [string, string, string];
  const header = decodeSegment(h, 'header');
  const alg = typeof header.alg === 'string' ? header.alg : '';
  const hash = HMAC_ALGS[alg];
  if (!hash) throw new Error(`Only HS256/HS384/HS512 can be verified with a secret; this token uses ${alg || 'an unknown algorithm'}.`);
  const keyBytes = secretIsBase64 ? base64ToBytes(secret) : utf8Encode(secret);
  const keyCopy = new Uint8Array(keyBytes.byteLength);
  keyCopy.set(keyBytes);
  const key = await crypto.subtle.importKey('raw', keyCopy, { name: 'HMAC', hash }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8Encode(`${h}.${p}`)));
  const expected = bytesToBase64(sig, true, false);
  return expected === s.replace(/=+$/, '');
}

/** Create a signed HS256/384/512 token (handy for testing APIs locally). */
export async function signJwtHmac(header: Record<string, unknown>, payload: Record<string, unknown>, secret: string): Promise<string> {
  const alg = typeof header.alg === 'string' ? header.alg : 'HS256';
  const hash = HMAC_ALGS[alg];
  if (!hash) throw new Error(`Cannot sign with ${alg}; choose HS256, HS384 or HS512.`);
  const enc = (obj: unknown) => bytesToBase64(utf8Encode(JSON.stringify(obj)), true, false);
  const signingInput = `${enc({ typ: 'JWT', ...header, alg })}.${enc(payload)}`;
  const key = await crypto.subtle.importKey('raw', utf8Encode(secret), { name: 'HMAC', hash }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8Encode(signingInput)));
  return `${signingInput}.${bytesToBase64(sig, true, false)}`;
}
