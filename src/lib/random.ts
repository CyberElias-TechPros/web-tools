/**
 * Cryptographically-seeded randomness for decisions: numbers, dice, coins,
 * list picks, shuffles, team splitting and weighted choices.
 */

export function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 4294967296;
}

export function randomInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  const range = hi - lo + 1;
  if (range <= 0) return lo;
  const limit = Math.floor(0x100000000 / range) * range;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return lo + (buf[0]! % range);
}

export function randomInts(count: number, min: number, max: number, unique = false): number[] {
  const n = Math.max(1, Math.min(10_000, Math.floor(count)));
  if (!unique) return Array.from({ length: n }, () => randomInt(min, max));
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  const range = hi - lo + 1;
  if (n > range) throw new Error(`Cannot pick ${n} unique numbers from a range of ${range}.`);
  if (range <= 100_000) {
    const pool = Array.from({ length: range }, (_, i) => lo + i);
    return shuffleArray(pool).slice(0, n);
  }
  const seen = new Set<number>();
  while (seen.size < n) seen.add(randomInt(lo, hi));
  return Array.from(seen);
}

export function shuffleArray<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function pickOne<T>(items: readonly T[]): T | undefined {
  if (!items.length) return undefined;
  return items[randomInt(0, items.length - 1)];
}

export function pickMany<T>(items: readonly T[], count: number): T[] {
  return shuffleArray(items).slice(0, Math.max(0, Math.min(count, items.length)));
}

export function weightedPick<T>(items: ReadonlyArray<{ value: T; weight: number }>): T | undefined {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return pickOne(items.map((i) => i.value));
  let r = secureRandom() * total;
  for (const item of items) {
    r -= Math.max(0, item.weight);
    if (r <= 0) return item.value;
  }
  return items[items.length - 1]?.value;
}

export interface DiceRoll {
  notation: string;
  rolls: Array<{ sides: number; values: number[]; kept: number[]; subtotal: number }>;
  modifier: number;
  total: number;
}

/** Roll dice notation like "2d6+3", "d20", "4d6kh3" (keep highest 3), "2d20kl1". */
export function rollDice(notation: string): DiceRoll {
  const clean = notation.replace(/\s+/g, '').toLowerCase();
  if (!clean) throw new Error('Enter dice notation such as 2d6+3.');
  const terms = clean.match(/[+-]?[^+-]+/g) ?? [];
  const rolls: DiceRoll['rolls'] = [];
  let modifier = 0;
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    const m = /^(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d+))?$/.exec(body);
    if (m) {
      const count = Math.min(1000, Math.max(1, m[1] ? parseInt(m[1], 10) : 1));
      const sides = m[2] === '%' ? 100 : parseInt(m[2]!, 10);
      if (sides < 1) throw new Error('Dice need at least one side.');
      const values = Array.from({ length: count }, () => randomInt(1, sides));
      let kept = [...values];
      if (m[3]) {
        const k = Math.min(count, parseInt(m[4]!, 10));
        const sorted = [...values].sort((a, b) => b - a);
        if (m[3] === 'kh') kept = sorted.slice(0, k);
        else if (m[3] === 'kl') kept = sorted.slice(-k);
        else if (m[3] === 'dh') kept = sorted.slice(k);
        else kept = sorted.slice(0, sorted.length - k);
      }
      const subtotal = kept.reduce((s, v) => s + v, 0) * sign;
      rolls.push({ sides, values, kept, subtotal });
      total += subtotal;
    } else if (/^\d+$/.test(body)) {
      modifier += sign * parseInt(body, 10);
      total += sign * parseInt(body, 10);
    } else throw new Error(`Cannot understand “${term}”. Use forms like 2d6, d20+5 or 4d6kh3.`);
  }
  return { notation: clean, rolls, modifier, total };
}

export function flipCoins(count: number): Array<'heads' | 'tails'> {
  return Array.from({ length: Math.max(1, Math.min(10_000, count)) }, () => (randomInt(0, 1) ? 'heads' : 'tails'));
}

export function splitTeams<T>(items: readonly T[], teams: number): T[][] {
  const n = Math.max(1, Math.min(teams, items.length || 1));
  const shuffled = shuffleArray(items);
  const out: T[][] = Array.from({ length: n }, () => []);
  shuffled.forEach((item, i) => out[i % n]!.push(item));
  return out;
}

export function randomString(length: number, alphabet: string): string {
  if (!alphabet) return '';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(0, alphabet.length - 1)];
  return out;
}

export function randomBytesHex(length: number): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function lotteryNumbers(pick: number, from: number, bonus?: { pick: number; from: number }): { main: number[]; bonus: number[] } {
  return {
    main: randomInts(pick, 1, from, true).sort((a, b) => a - b),
    bonus: bonus ? randomInts(bonus.pick, 1, bonus.from, true).sort((a, b) => a - b) : [],
  };
}
