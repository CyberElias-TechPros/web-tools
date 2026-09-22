/**
 * Cron expression parsing, English description and next-run computation.
 * Supports the standard 5-field syntax plus optional seconds (6 fields),
 * `@` shortcuts, ranges, steps, lists, names (JAN, MON) and `L`/`?` basics.
 */

export interface CronField {
  name: string;
  values: number[];
  raw: string;
  any: boolean;
}

export interface ParsedCron {
  fields: { second: CronField; minute: CronField; hour: CronField; dayOfMonth: CronField; month: CronField; dayOfWeek: CronField };
  hasSeconds: boolean;
  description: string;
  lastDayOfMonth: boolean;
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
}

const SHORTCUTS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
}

const SPECS: Record<'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek', FieldSpec> = {
  second: { name: 'second', min: 0, max: 59 },
  minute: { name: 'minute', min: 0, max: 59 },
  hour: { name: 'hour', min: 0, max: 23 },
  dayOfMonth: { name: 'day-of-month', min: 1, max: 31 },
  month: { name: 'month', min: 1, max: 12, names: MONTHS },
  dayOfWeek: { name: 'day-of-week', min: 0, max: 7, names: DAYS },
};

function parseValue(token: string, spec: FieldSpec): number {
  const upper = token.toUpperCase();
  if (spec.names) {
    const idx = spec.names.indexOf(upper);
    if (idx >= 0) return spec.min === 0 ? idx : idx + 1;
  }
  if (!/^\d+$/.test(token)) throw new Error(`“${token}” is not a valid ${spec.name} value.`);
  const n = parseInt(token, 10);
  if (n < spec.min || n > spec.max) throw new Error(`${spec.name} value ${n} is out of range (${spec.min}–${spec.max}).`);
  return n;
}

function parseField(raw: string, spec: FieldSpec): CronField {
  const values = new Set<number>();
  const trimmed = raw.trim();
  if (trimmed === '' ) throw new Error(`Missing ${spec.name} field.`);
  const any = trimmed === '*' || trimmed === '?';
  for (const part of trimmed.split(',')) {
    let body = part;
    let step = 1;
    const stepIdx = part.indexOf('/');
    if (stepIdx >= 0) {
      body = part.slice(0, stepIdx);
      const stepStr = part.slice(stepIdx + 1);
      if (!/^\d+$/.test(stepStr) || parseInt(stepStr, 10) <= 0) throw new Error(`Invalid step “${stepStr}” in ${spec.name}.`);
      step = parseInt(stepStr, 10);
    }
    let start: number;
    let end: number;
    if (body === '*' || body === '?') {
      start = spec.min;
      end = spec.name === 'day-of-week' ? 6 : spec.max;
    } else if (body === 'L' && spec.name === 'day-of-month') {
      values.add(-1);
      continue;
    } else if (body.includes('-')) {
      const [a, b] = body.split('-');
      if (!a || !b) throw new Error(`Invalid range “${body}” in ${spec.name}.`);
      start = parseValue(a, spec);
      end = parseValue(b, spec);
      if (end < start) throw new Error(`Range “${body}” in ${spec.name} runs backwards.`);
    } else {
      start = parseValue(body, spec);
      end = stepIdx >= 0 ? (spec.name === 'day-of-week' ? 6 : spec.max) : start;
    }
    for (let v = start; v <= end; v += step) values.add(spec.name === 'day-of-week' && v === 7 ? 0 : v);
  }
  return { name: spec.name, values: Array.from(values).sort((a, b) => a - b), raw: trimmed, any };
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describeNumeric(field: CronField, label: string, plural: string): string | null {
  if (field.any) return null;
  const raw = field.raw;
  const stepMatch = /^\*\/(\d+)$/.exec(raw);
  if (stepMatch) return `every ${stepMatch[1]} ${plural}`;
  const rangeStep = /^(\d+)-(\d+)\/(\d+)$/.exec(raw);
  if (rangeStep) return `every ${rangeStep[3]} ${plural} from ${rangeStep[1]} through ${rangeStep[2]}`;
  const range = /^(\d+)-(\d+)$/.exec(raw);
  if (range) return `every ${label} from ${range[1]} through ${range[2]}`;
  if (field.values.length > 6) return `at ${field.values.length} specific ${plural}`;
  return `at ${label} ${listWords(field.values.map(String))}`;
}

function formatTime(hour: number, minute: number, second?: number): string {
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return second !== undefined ? `${h}:${m}:${String(second).padStart(2, '0')}` : `${h}:${m}`;
}

function buildDescription(p: ParsedCron): string {
  const { second, minute, hour, dayOfMonth, month, dayOfWeek } = p.fields;
  const parts: string[] = [];

  // Time portion.
  const singleMinute = minute.values.length === 1 && !minute.any;
  const singleHour = hour.values.length === 1 && !hour.any;
  const singleSecond = !p.hasSeconds || (second.values.length === 1 && !second.any);
  if (singleMinute && singleHour && singleSecond) {
    parts.push(`At ${formatTime(hour.values[0]!, minute.values[0]!, p.hasSeconds && second.values[0] !== 0 ? second.values[0] : undefined)}`);
  } else if (singleMinute && hour.any && singleSecond) {
    parts.push(minute.values[0] === 0 ? 'Every hour, on the hour' : `At minute ${minute.values[0]} past every hour`);
  } else {
    const bits: string[] = [];
    if (p.hasSeconds) {
      if (second.any) bits.push('every second');
      else bits.push(describeNumeric(second, 'second', 'seconds')!);
    }
    if (minute.any) {
      if (!p.hasSeconds) bits.push('every minute');
    } else bits.push(describeNumeric(minute, 'minute', 'minutes')!);
    if (!hour.any) {
      const desc = describeNumeric(hour, 'hour', 'hours')!;
      bits.push(hour.values.length === 1 ? `past hour ${hour.values[0]}` : desc.startsWith('every') ? desc : desc.replace(/^at hour/, 'past hours'));
    }
    const first = bits.shift() ?? 'every minute';
    parts.push(first.charAt(0).toUpperCase() + first.slice(1) + (bits.length ? `, ${bits.join(', ')}` : ''));
  }

  // Day portion.
  const domDesc = p.lastDayOfMonth
    ? 'on the last day of the month'
    : dayOfMonth.any
      ? null
      : dayOfMonth.values.length > 6
        ? `on ${dayOfMonth.values.length} days of the month`
        : `on day ${listWords(dayOfMonth.values.map(String))} of the month`;
  const dowDesc = dayOfWeek.any
    ? null
    : dayOfWeek.values.length === 5 && dayOfWeek.values.join() === '1,2,3,4,5'
      ? 'on weekdays'
      : dayOfWeek.values.length === 2 && dayOfWeek.values.join() === '0,6'
        ? 'on weekends'
        : `on ${listWords(dayOfWeek.values.map((d) => DAY_NAMES[d]!))}`;
  if (domDesc && dowDesc) parts.push(`${domDesc} and ${dowDesc}`);
  else if (domDesc) parts.push(domDesc);
  else if (dowDesc) parts.push(dowDesc);

  if (!month.any) {
    const stepMatch = /^\*\/(\d+)$/.exec(month.raw);
    if (stepMatch) parts.push(`every ${stepMatch[1]} months`);
    else parts.push(`in ${listWords(month.values.map((m) => MONTH_NAMES[m - 1]!))}`);
  }
  return `${parts.join(', ')}.`;
}

export function parseCron(expression: string): ParsedCron {
  let expr = expression.trim().replace(/\s+/g, ' ');
  if (!expr) throw new Error('Enter a cron expression.');
  const lower = expr.toLowerCase();
  if (lower === '@reboot') throw new Error('@reboot runs once at startup and has no schedule to describe.');
  if (SHORTCUTS[lower]) expr = SHORTCUTS[lower]!;
  const tokens = expr.split(' ');
  if (tokens.length !== 5 && tokens.length !== 6) {
    throw new Error(`Expected 5 fields (or 6 with seconds) but found ${tokens.length}.`);
  }
  const hasSeconds = tokens.length === 6;
  const [s, mi, h, dom, mo, dow] = hasSeconds ? (tokens as [string, string, string, string, string, string]) : ['0', ...tokens] as [string, string, string, string, string, string];
  const second = hasSeconds ? parseField(s, SPECS.second) : { name: 'second', values: [0], raw: '0', any: false };
  const minute = parseField(mi, SPECS.minute);
  const hour = parseField(h, SPECS.hour);
  const dayOfMonth = parseField(dom, SPECS.dayOfMonth);
  const month = parseField(mo, SPECS.month);
  const dayOfWeek = parseField(dow, SPECS.dayOfWeek);
  const lastDayOfMonth = dayOfMonth.values.includes(-1);
  const parsed: ParsedCron = {
    fields: { second, minute, hour, dayOfMonth, month, dayOfWeek },
    hasSeconds,
    description: '',
    lastDayOfMonth,
    dayOfMonthRestricted: !dayOfMonth.any,
    dayOfWeekRestricted: !dayOfWeek.any,
  };
  parsed.description = buildDescription(parsed);
  return parsed;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dayMatches(p: ParsedCron, date: Date): boolean {
  const dom = date.getDate();
  const dow = date.getDay();
  const domOk = p.lastDayOfMonth ? dom === daysInMonth(date.getFullYear(), date.getMonth()) || p.fields.dayOfMonth.values.includes(dom) : p.fields.dayOfMonth.values.includes(dom);
  const dowOk = p.fields.dayOfWeek.values.includes(dow);
  // Vixie cron: if both fields are restricted, match either.
  if (p.dayOfMonthRestricted && p.dayOfWeekRestricted) return domOk || dowOk;
  if (p.dayOfMonthRestricted) return domOk;
  if (p.dayOfWeekRestricted) return dowOk;
  return true;
}

/** Compute the next `count` run times after `from` (local time). */
export function nextRuns(p: ParsedCron, count = 5, from = new Date()): Date[] {
  const runs: Date[] = [];
  const cursor = new Date(from.getTime());
  cursor.setMilliseconds(0);
  if (p.hasSeconds) cursor.setSeconds(cursor.getSeconds() + 1);
  else {
    cursor.setSeconds(0);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  const limit = new Date(from.getTime());
  limit.setFullYear(limit.getFullYear() + 5);
  const { second, minute, hour, month } = p.fields;

  let guard = 0;
  while (runs.length < count && cursor <= limit && guard++ < 2_000_000) {
    if (!month.values.includes(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(p, cursor)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hour.values.includes(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minute.values.includes(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      continue;
    }
    if (p.hasSeconds && !second.values.includes(cursor.getSeconds())) {
      cursor.setSeconds(cursor.getSeconds() + 1, 0);
      continue;
    }
    runs.push(new Date(cursor.getTime()));
    if (p.hasSeconds) cursor.setSeconds(cursor.getSeconds() + 1);
    else cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}

export const CRON_PRESETS: Array<{ label: string; expression: string }> = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Hourly', expression: '0 * * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Weekdays at 9:00', expression: '0 9 * * 1-5' },
  { label: 'Every Monday 08:30', expression: '30 8 * * MON' },
  { label: 'First of the month', expression: '0 0 1 * *' },
  { label: 'Quarterly', expression: '0 0 1 */3 *' },
  { label: 'Last day of month', expression: '0 23 L * *' },
];

/** Build a cron expression from structured parts (for the visual builder). */
export function buildCron(parts: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string }): string {
  const clean = (s: string) => (s.trim() === '' ? '*' : s.trim());
  return [clean(parts.minute), clean(parts.hour), clean(parts.dayOfMonth), clean(parts.month), clean(parts.dayOfWeek)].join(' ');
}
