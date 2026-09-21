/**
 * Timestamp parsing and formatting: Unix seconds/millis/micros/nanos,
 * ISO 8601, RFC 2822, natural dates, Excel serials, plus relative time.
 */

export interface ParsedTimestamp {
  date: Date;
  /** How the input was interpreted. */
  interpretation: string;
  /** Millisecond precision extra (e.g. nanosecond remainder), as a string. */
  fraction?: string;
}

const UNIX_LIMITS = {
  seconds: 1e11, // ~ year 5138
  millis: 1e14,
  micros: 1e17,
};

export function parseTimestamp(raw: string, now = new Date()): ParsedTimestamp | null {
  const input = raw.trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  if (lower === 'now') return { date: new Date(now.getTime()), interpretation: 'the current time' };
  if (lower === 'today') {
    const d = new Date(now.getTime());
    d.setHours(0, 0, 0, 0);
    return { date: d, interpretation: 'today at midnight (local)' };
  }
  if (lower === 'tomorrow' || lower === 'yesterday') {
    const d = new Date(now.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (lower === 'tomorrow' ? 1 : -1));
    return { date: d, interpretation: `${lower} at midnight (local)` };
  }

  // Relative: "in 3 days", "2 hours ago", "+90m", "-1w"
  const rel = /^(?:(in)\s+)?([+-]?\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|mo|months?|y|yrs?|years?)(?:\s+(ago))?$/i.exec(input);
  if (rel) {
    const [, , amountStr, unitRaw, agoWord] = rel;
    let amount = parseFloat(amountStr!);
    if (agoWord) amount = -amount; // bare "3 days" (no "ago") means "in 3 days"
    const d = new Date(now.getTime());
    const unit = unitRaw!.toLowerCase();
    if (unit.startsWith('ms') || unit.startsWith('milli')) d.setTime(d.getTime() + amount);
    else if (unit.startsWith('s')) d.setTime(d.getTime() + amount * 1000);
    else if (unit === 'm' || unit.startsWith('min')) d.setTime(d.getTime() + amount * 60_000);
    else if (unit.startsWith('h')) d.setTime(d.getTime() + amount * 3_600_000);
    else if (unit.startsWith('d')) d.setDate(d.getDate() + amount);
    else if (unit.startsWith('w')) d.setDate(d.getDate() + amount * 7);
    else if (unit.startsWith('mo')) d.setMonth(d.getMonth() + amount);
    else if (unit.startsWith('y')) d.setFullYear(d.getFullYear() + amount);
    return { date: d, interpretation: `relative to now (${amount >= 0 ? '+' : ''}${amount} ${unit})` };
  }

  // Pure number → Unix epoch in some unit.
  if (/^-?\d+(\.\d+)?$/.test(input)) {
    const n = Number(input);
    const abs = Math.abs(n);
    if (input.includes('.')) return { date: new Date(n * 1000), interpretation: 'Unix seconds with fractional part' };
    if (abs < UNIX_LIMITS.seconds) return { date: new Date(n * 1000), interpretation: 'Unix seconds' };
    if (abs < UNIX_LIMITS.millis) return { date: new Date(n), interpretation: 'Unix milliseconds' };
    if (abs < UNIX_LIMITS.micros) {
      const ms = Math.floor(n / 1000);
      return { date: new Date(ms), interpretation: 'Unix microseconds', fraction: input.slice(-3) };
    }
    // Nanoseconds — use BigInt to keep precision.
    const big = BigInt(input);
    const ms = Number(big / 1_000_000n);
    return { date: new Date(ms), interpretation: 'Unix nanoseconds', fraction: (big % 1_000_000n).toString().padStart(6, '0') };
  }

  // Hex epoch (e.g. 0x5F5E1000)
  if (/^0x[0-9a-f]+$/i.test(input)) {
    const n = parseInt(input, 16);
    return { date: new Date(n * (n < UNIX_LIMITS.seconds ? 1000 : 1)), interpretation: 'hexadecimal Unix timestamp' };
  }

  // Excel serial like "45123.5"? Only when prefixed to avoid ambiguity.
  const excel = /^excel[:\s]+(\d+(?:\.\d+)?)$/i.exec(input);
  if (excel) {
    const serial = parseFloat(excel[1]!);
    const ms = Math.round((serial - 25569) * 86400000);
    return { date: new Date(ms), interpretation: 'Excel serial date (1900 system)' };
  }

  // ISO 8601 with optional zone; JS Date handles most forms.
  const isoLike = /^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?\s*(Z|[+-]\d{2}:?\d{2}|UTC|GMT)?$/i;
  if (isoLike.test(input)) {
    let normalized = input.replace(' ', 'T').replace(/\s*(UTC|GMT)$/i, 'Z');
    // Trim fractional seconds beyond ms for Date parsing but keep the fraction for display.
    let fraction: string | undefined;
    normalized = normalized.replace(/(\.\d{3})(\d+)/, (_, keep: string, rest: string) => {
      fraction = rest;
      return keep;
    });
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const hasTime = normalized.includes('T');
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) {
      return {
        date,
        interpretation: `ISO 8601 (${hasZone ? 'explicit offset' : hasTime ? 'local time' : 'UTC date'})`,
        fraction,
      };
    }
  }

  // Generic JS Date parse (RFC 2822, "March 5 2024 10:00", etc).
  const generic = new Date(input);
  if (!Number.isNaN(generic.getTime())) return { date: generic, interpretation: 'natural-language date' };

  // dd/mm/yyyy or dd.mm.yyyy or mm/dd/yyyy heuristics.
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(input);
  if (dmy) {
    const a = parseInt(dmy[1]!, 10);
    const b = parseInt(dmy[2]!, 10);
    const year = parseInt(dmy[3]!, 10);
    const hour = dmy[4] ? parseInt(dmy[4], 10) : 0;
    const minute = dmy[5] ? parseInt(dmy[5], 10) : 0;
    const second = dmy[6] ? parseInt(dmy[6], 10) : 0;
    const dayFirst = a > 12 || input.includes('.');
    const day = dayFirst ? a : b;
    const month = dayFirst ? b : a;
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (!Number.isNaN(date.getTime())) return { date, interpretation: dayFirst ? 'day/month/year (local)' : 'month/day/year (local)' };
  }

  return null;
}

export interface TimestampFormats {
  unixSeconds: string;
  unixMillis: string;
  iso: string;
  isoLocal: string;
  rfc2822: string;
  utcHuman: string;
  localHuman: string;
  relative: string;
  dayOfYear: number;
  isoWeek: string;
  weekday: string;
  quarter: string;
  excelSerial: string;
  offsetMinutes: number;
  timezone: string;
}

export function pad(n: number, len = 2): string {
  return String(Math.abs(n)).padStart(len, '0');
}

export function formatOffset(minutes: number): string {
  const sign = minutes <= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function toLocalIso(date: Date): string {
  const off = date.getTimezoneOffset();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${formatOffset(off)}`;
}

export function relativeTime(date: Date, now = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [31557600000, 'year'],
    [2629800000, 'month'],
    [604800000, 'week'],
    [86400000, 'day'],
    [3600000, 'hour'],
    [60000, 'minute'],
    [1000, 'second'],
  ];
  for (const [size, unit] of units) {
    if (abs >= size || unit === 'second') {
      const value = Math.sign(diff) * Math.round(abs / size);
      if (rtf) return rtf.format(value, unit);
      const n = Math.abs(value);
      return `${n} ${unit}${n === 1 ? '' : 's'} ${value < 0 ? 'ago' : 'from now'}`;
    }
  }
  return 'now';
}

export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime() - (date.getTimezoneOffset() - start.getTimezoneOffset()) * 60000) / 86400000);
}

export function describeTimestamp(date: Date, now = new Date()): TimestampFormats {
  const week = isoWeek(date);
  const ms = date.getTime();
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'local';
  return {
    unixSeconds: Math.floor(ms / 1000).toString(),
    unixMillis: ms.toString(),
    iso: date.toISOString(),
    isoLocal: toLocalIso(date),
    rfc2822: date.toUTCString(),
    utcHuman: date.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' }),
    localHuman: date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' }),
    relative: relativeTime(date, now),
    dayOfYear: dayOfYear(date),
    isoWeek: `${week.year}-W${pad(week.week)}`,
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    quarter: `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`,
    excelSerial: (ms / 86400000 + 25569).toFixed(6),
    offsetMinutes: date.getTimezoneOffset(),
    timezone: tz,
  };
}

/** Format a date in a specific IANA zone. Falls back gracefully if unsupported. */
export function formatInZone(date: Date, timeZone: string): { text: string; offset: string } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return {
      text: `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`,
      offset: get('timeZoneName'),
    };
  } catch {
    return null;
  }
}

export const COMMON_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];
