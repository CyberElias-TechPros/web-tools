/**
 * Calendar maths: differences between dates, business days, add/subtract,
 * age calculation, countdowns, week numbers and recurring-date helpers.
 */

export interface DateDiff {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  businessDays: number;
  weekends: number;
  negative: boolean;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  const max = daysInMonth(out.getFullYear(), out.getMonth());
  out.setDate(Math.min(day, max));
  return out;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function dateDiff(from: Date, to: Date, holidays: Date[] = []): DateDiff {
  let a = startOfDay(from);
  let b = startOfDay(to);
  const negative = b < a;
  if (negative) [a, b] = [b, a];

  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  let anchor = addMonths(a, months);
  if (anchor > b) {
    months -= 1;
    anchor = addMonths(a, months);
  }
  const days = Math.round((b.getTime() - anchor.getTime()) / 86400000);
  const years = Math.floor(months / 12);
  months %= 12;
  const totalMs = b.getTime() - a.getTime();
  const totalDays = Math.round(totalMs / 86400000);
  const holidaySet = new Set(holidays.map((h) => startOfDay(h).getTime()));
  let businessDays = 0;
  let weekends = 0;
  const cursor = new Date(a.getTime());
  for (let i = 0; i < totalDays; i++) {
    if (isWeekend(cursor)) weekends++;
    else if (!holidaySet.has(cursor.getTime())) businessDays++;
    cursor.setDate(cursor.getDate() + 1);
  }
  const exactMs = Math.abs(to.getTime() - from.getTime());
  return {
    years,
    months,
    days,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalHours: Math.floor(exactMs / 3600000),
    totalMinutes: Math.floor(exactMs / 60000),
    totalSeconds: Math.floor(exactMs / 1000),
    businessDays,
    weekends,
    negative,
  };
}

export function addBusinessDays(from: Date, n: number, holidays: Date[] = []): Date {
  const holidaySet = new Set(holidays.map((h) => startOfDay(h).getTime()));
  const cursor = startOfDay(from);
  let remaining = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + step);
    if (!isWeekend(cursor) && !holidaySet.has(cursor.getTime())) remaining--;
  }
  return cursor;
}

export interface AgeReport {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  nextBirthday: Date;
  daysUntilBirthday: number;
  dayOfWeekBorn: string;
  zodiac: string;
  chineseZodiac: string;
  generation: string;
}

const ZODIAC: Array<[number, number, string]> = [
  [1, 20, 'Capricorn'], [2, 19, 'Aquarius'], [3, 21, 'Pisces'], [4, 20, 'Aries'], [5, 21, 'Taurus'], [6, 21, 'Gemini'],
  [7, 23, 'Cancer'], [8, 23, 'Leo'], [9, 23, 'Virgo'], [10, 23, 'Libra'], [11, 22, 'Scorpio'], [12, 22, 'Sagittarius'], [12, 32, 'Capricorn'],
];
const CHINESE = ['Monkey', 'Rooster', 'Dog', 'Pig', 'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat'];

export function zodiacSign(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  for (const [zm, zd, name] of ZODIAC) if (m < zm || (m === zm && day < zd)) return name;
  return 'Capricorn';
}

export function generationFor(year: number): string {
  if (year >= 2025) return 'Generation Beta';
  if (year >= 2013) return 'Generation Alpha';
  if (year >= 1997) return 'Generation Z';
  if (year >= 1981) return 'Millennial';
  if (year >= 1965) return 'Generation X';
  if (year >= 1946) return 'Baby Boomer';
  if (year >= 1928) return 'Silent Generation';
  return 'Greatest Generation';
}

export function ageReport(birth: Date, on = new Date()): AgeReport {
  const diff = dateDiff(birth, on);
  const thisYear = new Date(on.getFullYear(), birth.getMonth(), Math.min(birth.getDate(), daysInMonth(on.getFullYear(), birth.getMonth())));
  const next = startOfDay(thisYear) >= startOfDay(on) ? thisYear : new Date(on.getFullYear() + 1, birth.getMonth(), Math.min(birth.getDate(), daysInMonth(on.getFullYear() + 1, birth.getMonth())));
  return {
    years: diff.years,
    months: diff.months,
    days: diff.days,
    totalDays: diff.totalDays,
    nextBirthday: next,
    daysUntilBirthday: Math.round((startOfDay(next).getTime() - startOfDay(on).getTime()) / 86400000),
    dayOfWeekBorn: birth.toLocaleDateString('en-US', { weekday: 'long' }),
    zodiac: zodiacSign(birth),
    chineseZodiac: CHINESE[((birth.getFullYear() % 12) + 12) % 12]!,
    generation: generationFor(birth.getFullYear()),
  };
}

export function formatDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function humanizeDiff(diff: DateDiff): string {
  const parts: string[] = [];
  if (diff.years) parts.push(`${diff.years} year${diff.years === 1 ? '' : 's'}`);
  if (diff.months) parts.push(`${diff.months} month${diff.months === 1 ? '' : 's'}`);
  if (diff.days || !parts.length) parts.push(`${diff.days} day${diff.days === 1 ? '' : 's'}`);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Common fixed-date holidays (Gregorian) for business-day calculations. */
export function fixedHolidays(year: number, region: 'us' | 'uk' | 'none' = 'none'): Date[] {
  if (region === 'none') return [];
  const list: Date[] = [new Date(year, 0, 1), new Date(year, 11, 25)];
  if (region === 'us') {
    list.push(new Date(year, 6, 4), new Date(year, 10, 11), nthWeekday(year, 0, 1, 3), nthWeekday(year, 1, 1, 3), lastWeekday(year, 4, 1), nthWeekday(year, 8, 1, 1), nthWeekday(year, 9, 1, 2), nthWeekday(year, 10, 4, 4), new Date(year, 5, 19));
  } else if (region === 'uk') {
    list.push(new Date(year, 11, 26), nthWeekday(year, 4, 1, 1), lastWeekday(year, 4, 1), lastWeekday(year, 7, 1));
    const easter = easterSunday(year);
    list.push(addDays(easter, -2), addDays(easter, 1));
  }
  return list;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}
