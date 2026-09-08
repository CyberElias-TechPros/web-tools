/**
 * Time zone maths built entirely on the Intl API.
 *
 * The rule that keeps this correct: never do arithmetic on wall-clock numbers.
 * Everything converts to a UTC instant first, then formats back out in the
 * target zone, so DST transitions are handled by the platform rather than by
 * hand-rolled offset tables that go stale twice a year.
 */

export interface ZoneInfo {
  id: string;
  city: string;
  region: string;
  /** Current UTC offset in minutes, e.g. -300 for New York in winter. */
  offsetMinutes: number;
  abbreviation: string;
}

let cachedZones: string[] | null = null;

/** All IANA zones the runtime knows about, with a curated fallback. */
/**
 * `Intl.supportedValuesOf('timeZone')` omits the `UTC` alias in several
 * engines, so it is added explicitly — people reach for it constantly.
 */
function withUtc(zones: string[]): string[] {
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}

export function listTimeZones(): string[] {
  if (cachedZones) return cachedZones;
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supported === 'function') {
    try {
      cachedZones = withUtc(supported('timeZone'));
      return cachedZones;
    } catch {
      /* fall through to the curated list */
    }
  }
  cachedZones = withUtc([...FALLBACK_ZONES]);
  return cachedZones;
}

const FALLBACK_ZONES = [
  'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Stockholm',
  'Europe/Warsaw', 'Europe/Athens', 'Europe/Kyiv', 'Europe/Istanbul', 'Europe/Moscow',
  'Africa/Lagos', 'Africa/Cairo', 'Africa/Nairobi', 'Africa/Johannesburg', 'Asia/Dubai',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
  'Pacific/Auckland', 'Pacific/Honolulu',
];

/** A short list of the zones most teams actually schedule across. */
export const POPULAR_ZONES = [
  'America/Los_Angeles', 'America/New_York', 'America/Chicago', 'Europe/London',
  'Europe/Berlin', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * The offset of `timeZone` from UTC at `date`, in minutes.
 * Derived by formatting the instant in the target zone and comparing.
 */
export function getOffsetMinutes(timeZone: string, date: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function getAbbreviation(timeZone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function describeZone(id: string, at: Date = new Date()): ZoneInfo {
  const segments = id.split('/');
  const city = (segments[segments.length - 1] ?? id).replace(/_/g, ' ');
  const region = segments.length > 1 ? (segments[0] ?? '').replace(/_/g, ' ') : 'UTC';
  return {
    id,
    city,
    region,
    offsetMinutes: getOffsetMinutes(id, at),
    abbreviation: getAbbreviation(id, at),
  };
}

/**
 * Convert a wall-clock time in a given zone into the corresponding UTC instant.
 * Uses a two-pass correction, which resolves offsets correctly even when the
 * requested time is near a DST boundary.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = new Date(naive - getOffsetMinutes(timeZone, new Date(naive)) * 60000);
  // Second pass: recompute using the offset that actually applies at the guess.
  guess = new Date(naive - getOffsetMinutes(timeZone, guess) * 60000);
  return guess;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  /** Day offset relative to the reference zone: -1, 0 or +1. */
  dayName: string;
}

export function utcToZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    weekday: get('weekday'),
    dayName: `${get('weekday')} ${get('month')}/${get('day')}`,
  };
}

export function formatInZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, ...options }).format(date);
  } catch {
    return date.toISOString();
  }
}

// --- meeting scoring --------------------------------------------------------------

export interface WorkingHours {
  start: number; // hour, 0-23
  end: number; // hour, 1-24
}

export const defaultWorkingHours: WorkingHours = { start: 9, end: 17 };

export type SlotQuality = 'ideal' | 'acceptable' | 'awkward' | 'unreasonable';

export interface ParticipantSlot {
  zone: string;
  hour: number;
  minute: number;
  dayLabel: string;
  isWeekend: boolean;
  quality: SlotQuality;
  /** Day offset relative to the reference zone's day. */
  dayShift: number;
}

export interface MeetingSlot {
  /** The instant the meeting starts. */
  utc: Date;
  participants: ParticipantSlot[];
  /** 0..100 — how workable this slot is for the whole group. */
  score: number;
  /** How many participants are inside their working hours. */
  workableCount: number;
  worstQuality: SlotQuality;
}

const QUALITY_WEIGHT: Record<SlotQuality, number> = {
  ideal: 1,
  acceptable: 0.65,
  awkward: 0.25,
  unreasonable: 0,
};

export function classifyHour(
  hour: number,
  working: WorkingHours,
  isWeekend: boolean,
  allowWeekends: boolean,
): SlotQuality {
  if (isWeekend && !allowWeekends) return 'unreasonable';
  if (hour >= working.start && hour < working.end) return 'ideal';
  // One hour either side of the working day is a normal ask.
  if (hour >= working.start - 1 && hour < working.end + 1) return 'acceptable';
  // Anything from 07:00-22:00 is unpleasant but possible.
  if (hour >= 7 && hour < 22) return 'awkward';
  return 'unreasonable';
}

export interface FindSlotsOptions {
  zones: string[];
  /** The calendar day (in the reference zone) to search. */
  date: { year: number; month: number; day: number };
  referenceZone: string;
  working: WorkingHours;
  allowWeekends: boolean;
  /** Minutes between candidate slots. */
  stepMinutes: 15 | 30 | 60;
  durationMinutes: number;
}

/** Score every candidate start time across a day and return them in order. */
export function findMeetingSlots(options: FindSlotsOptions): MeetingSlot[] {
  const { zones, date, referenceZone, working, allowWeekends, stepMinutes } = options;
  if (zones.length === 0) return [];

  const slots: MeetingSlot[] = [];
  const perDay = Math.floor((24 * 60) / stepMinutes);

  for (let i = 0; i < perDay; i++) {
    const totalMinutes = i * stepMinutes;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const utc = zonedTimeToUtc(referenceZone, date.year, date.month, date.day, hour, minute);
    const referenceParts = utcToZonedParts(utc, referenceZone);

    const participants: ParticipantSlot[] = zones.map((zone) => {
      const parts = utcToZonedParts(utc, zone);
      const isWeekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
      const dayShift = compareDates(parts, referenceParts);
      return {
        zone,
        hour: parts.hour,
        minute: parts.minute,
        dayLabel: parts.dayName,
        isWeekend,
        quality: classifyHour(parts.hour, working, isWeekend, allowWeekends),
        dayShift,
      };
    });

    const weightSum = participants.reduce((sum, p) => sum + QUALITY_WEIGHT[p.quality], 0);
    const score = Math.round((weightSum / participants.length) * 100);
    const worst = participants.reduce<SlotQuality>((worstSoFar, p) => {
      return QUALITY_WEIGHT[p.quality] < QUALITY_WEIGHT[worstSoFar] ? p.quality : worstSoFar;
    }, 'ideal');

    slots.push({
      utc,
      participants,
      score,
      workableCount: participants.filter((p) => p.quality === 'ideal').length,
      worstQuality: worst,
    });
  }

  return slots;
}

function compareDates(a: ZonedParts, b: ZonedParts): number {
  const aDay = Date.UTC(a.year, a.month - 1, a.day);
  const bDay = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((aDay - bDay) / 86400000);
}

// --- sharing ----------------------------------------------------------------------

export function buildIcs(params: {
  start: Date;
  durationMinutes: number;
  title: string;
  description: string;
  zones: string[];
}): string {
  const { start, durationMinutes, title, description, zones } = params;
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // RFC 5545 requires long lines to be folded and text to be escaped.
  const escape = (s: string): string =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fold = (line: string): string => {
    if (line.length <= 73) return line;
    const chunks: string[] = [line.slice(0, 73)];
    let rest = line.slice(73);
    while (rest.length > 72) {
      chunks.push(' ' + rest.slice(0, 72));
      rest = rest.slice(72);
    }
    if (rest) chunks.push(' ' + rest);
    return chunks.join('\r\n');
  };

  const localLines = zones
    .map((z) => `${z}: ${formatInZone(start, z, { dateStyle: 'medium', timeStyle: 'short' })}`)
    .join('\n');

  const uid = `${stamp(start)}-${Math.random().toString(36).slice(2, 10)}@web-tools`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Web Tools//Time Zone Meeting Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    fold(`SUMMARY:${escape(title)}`),
    fold(`DESCRIPTION:${escape(`${description}\n\n${localLines}`)}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

export function buildShareText(slot: MeetingSlot, durationMinutes: number, title: string): string {
  const rows = slot.participants.map((p) => {
    const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    const shift = p.dayShift === 0 ? '' : p.dayShift > 0 ? ' (next day)' : ' (previous day)';
    const city = (p.zone.split('/').pop() ?? p.zone).replace(/_/g, ' ');
    return `${city.padEnd(16)} ${time}${shift}`;
  });
  return [
    title,
    `Duration: ${durationMinutes} minutes`,
    `UTC: ${slot.utc.toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    ...rows,
  ].join('\n');
}
