import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  buildShareText,
  classifyHour,
  describeZone,
  findMeetingSlots,
  formatOffset,
  getLocalTimeZone,
  getOffsetMinutes,
  listTimeZones,
  utcToZonedParts,
  zonedTimeToUtc,
} from '@/lib/timezone';

describe('listTimeZones', () => {
  it('returns a non-trivial list including UTC', () => {
    const zones = listTimeZones();
    expect(zones.length).toBeGreaterThan(20);
    expect(zones).toContain('UTC');
  });
});

describe('getLocalTimeZone', () => {
  it('returns a usable IANA identifier', () => {
    const zone = getLocalTimeZone();
    expect(typeof zone).toBe('string');
    expect(() => new Intl.DateTimeFormat('en', { timeZone: zone })).not.toThrow();
  });
});

describe('getOffsetMinutes', () => {
  it('reports zero for UTC', () => {
    expect(getOffsetMinutes('UTC', new Date('2025-01-15T12:00:00Z'))).toBe(0);
  });

  it('reports New York as -5 hours in winter', () => {
    expect(getOffsetMinutes('America/New_York', new Date('2025-01-15T12:00:00Z'))).toBe(-300);
  });

  it('reports New York as -4 hours in summer, proving DST is handled', () => {
    expect(getOffsetMinutes('America/New_York', new Date('2025-07-15T12:00:00Z'))).toBe(-240);
  });

  it('reports India as +5:30, proving half-hour zones work', () => {
    expect(getOffsetMinutes('Asia/Kolkata', new Date('2025-01-15T12:00:00Z'))).toBe(330);
  });

  it('reports Nepal as +5:45, proving quarter-hour zones work', () => {
    expect(getOffsetMinutes('Asia/Kathmandu', new Date('2025-01-15T12:00:00Z'))).toBe(345);
  });

  it('reports Sydney as ahead of UTC', () => {
    expect(getOffsetMinutes('Australia/Sydney', new Date('2025-01-15T12:00:00Z'))).toBe(660);
  });

  it('returns 0 rather than throwing for an unknown zone', () => {
    expect(getOffsetMinutes('Not/AZone', new Date())).toBe(0);
  });
});

describe('formatOffset', () => {
  it('formats positive, negative and fractional offsets', () => {
    expect(formatOffset(0)).toBe('UTC+00:00');
    expect(formatOffset(330)).toBe('UTC+05:30');
    expect(formatOffset(-300)).toBe('UTC-05:00');
    expect(formatOffset(-210)).toBe('UTC-03:30');
  });
});

describe('zonedTimeToUtc', () => {
  it('round-trips a wall-clock time through UTC', () => {
    const utc = zonedTimeToUtc('America/New_York', 2025, 6, 15, 14, 30);
    const parts = utcToZonedParts(utc, 'America/New_York');
    expect(parts).toMatchObject({ year: 2025, month: 6, day: 15, hour: 14, minute: 30 });
  });

  it('round-trips across many zones and dates', () => {
    const zones = ['UTC', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Pacific/Auckland'];
    const dates: Array<[number, number, number, number]> = [
      [2025, 1, 15, 9],
      [2025, 3, 30, 13],
      [2025, 7, 4, 23],
      [2025, 11, 2, 1],
    ];
    for (const zone of zones) {
      for (const [y, m, d, h] of dates) {
        const utc = zonedTimeToUtc(zone, y, m, d, h, 0);
        const parts = utcToZonedParts(utc, zone);
        expect(`${zone} ${y}-${m}-${d} ${h}`).toBe(`${zone} ${y}-${m}-${d} ${h}`);
        expect(parts.hour).toBe(h);
        expect(parts.day).toBe(d);
      }
    }
  });

  it('produces the correct UTC instant for a known winter time', () => {
    // 09:00 in New York in January is 14:00 UTC.
    const utc = zonedTimeToUtc('America/New_York', 2025, 1, 15, 9, 0);
    expect(utc.toISOString()).toBe('2025-01-15T14:00:00.000Z');
  });

  it('produces the correct UTC instant for a known summer time', () => {
    // 09:00 in New York in July is 13:00 UTC.
    const utc = zonedTimeToUtc('America/New_York', 2025, 7, 15, 9, 0);
    expect(utc.toISOString()).toBe('2025-07-15T13:00:00.000Z');
  });
});

describe('utcToZonedParts', () => {
  it('converts midnight UTC into the previous day in the Americas', () => {
    const parts = utcToZonedParts(new Date('2025-01-15T02:00:00Z'), 'America/Los_Angeles');
    expect(parts.day).toBe(14);
    expect(parts.hour).toBe(18);
  });

  it('renders hour 24 as 0', () => {
    const parts = utcToZonedParts(new Date('2025-01-15T00:00:00Z'), 'UTC');
    expect(parts.hour).toBe(0);
  });
});

describe('describeZone', () => {
  it('extracts a readable city and region', () => {
    const info = describeZone('America/New_York');
    expect(info.city).toBe('New York');
    expect(info.region).toBe('America');
  });
});

describe('classifyHour', () => {
  const working = { start: 9, end: 17 };

  it('rates working hours as ideal', () => {
    expect(classifyHour(10, working, false, false)).toBe('ideal');
    expect(classifyHour(9, working, false, false)).toBe('ideal');
    expect(classifyHour(16, working, false, false)).toBe('ideal');
  });

  it('rates the hour either side as acceptable', () => {
    expect(classifyHour(8, working, false, false)).toBe('acceptable');
    expect(classifyHour(17, working, false, false)).toBe('acceptable');
  });

  it('rates early and late hours as awkward', () => {
    expect(classifyHour(7, working, false, false)).toBe('awkward');
    expect(classifyHour(21, working, false, false)).toBe('awkward');
  });

  it('rates the middle of the night as unreasonable', () => {
    expect(classifyHour(3, working, false, false)).toBe('unreasonable');
    expect(classifyHour(23, working, false, false)).toBe('unreasonable');
  });

  it('rates weekends as unreasonable unless allowed', () => {
    expect(classifyHour(10, working, true, false)).toBe('unreasonable');
    expect(classifyHour(10, working, true, true)).toBe('ideal');
  });
});

describe('findMeetingSlots', () => {
  const base = {
    date: { year: 2025, month: 6, day: 17 }, // a Tuesday
    referenceZone: 'UTC',
    working: { start: 9, end: 17 },
    allowWeekends: false,
    stepMinutes: 60 as const,
    durationMinutes: 30,
  };

  it('returns one slot per step across the day', () => {
    const slots = findMeetingSlots({ ...base, zones: ['UTC'] });
    expect(slots).toHaveLength(24);
  });

  it('returns 48 slots at half-hour granularity', () => {
    expect(findMeetingSlots({ ...base, zones: ['UTC'], stepMinutes: 30 })).toHaveLength(48);
  });

  it('returns nothing when there are no participants', () => {
    expect(findMeetingSlots({ ...base, zones: [] })).toHaveLength(0);
  });

  it('scores a single-zone working hour at 100', () => {
    const slots = findMeetingSlots({ ...base, zones: ['UTC'] });
    const tenAm = slots.find((s) => s.participants[0]?.hour === 10);
    expect(tenAm?.score).toBe(100);
  });

  it('scores the middle of the night at 0', () => {
    const slots = findMeetingSlots({ ...base, zones: ['UTC'] });
    const threeAm = slots.find((s) => s.participants[0]?.hour === 3);
    expect(threeAm?.score).toBe(0);
  });

  it('finds a genuine overlap between distant zones', () => {
    const slots = findMeetingSlots({
      ...base,
      zones: ['America/Los_Angeles', 'Europe/London'],
    });
    const best = slots.reduce((a, b) => (b.score > a.score ? b : a));
    expect(best.score).toBeGreaterThan(50);
    // 16:00-17:00 UTC is 09:00 LA and 17:00 London.
    const laHour = best.participants[0]!.hour;
    expect(laHour).toBeGreaterThanOrEqual(8);
    expect(laHour).toBeLessThanOrEqual(11);
  });

  it('reports a day shift for zones on the other side of the date line', () => {
    const slots = findMeetingSlots({ ...base, zones: ['UTC', 'Pacific/Auckland'] });
    const lateSlot = slots.find((s) => s.participants[0]?.hour === 23);
    expect(lateSlot?.participants[1]?.dayShift).toBe(1);
  });

  it('marks every slot unreasonable on a weekend when weekends are excluded', () => {
    const slots = findMeetingSlots({
      ...base,
      date: { year: 2025, month: 6, day: 21 }, // a Saturday
      zones: ['UTC'],
    });
    expect(slots.every((s) => s.score === 0)).toBe(true);
  });

  it('produces scores between 0 and 100 for every slot', () => {
    const slots = findMeetingSlots({ ...base, zones: ['UTC', 'Asia/Tokyo', 'America/New_York'] });
    for (const slot of slots) {
      expect(slot.score).toBeGreaterThanOrEqual(0);
      expect(slot.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('buildIcs', () => {
  const ics = buildIcs({
    start: new Date('2025-06-17T14:00:00Z'),
    durationMinutes: 45,
    title: 'Team sync; with punctuation, here',
    description: 'A description',
    zones: ['UTC', 'Asia/Tokyo'],
  });

  it('emits a well-formed calendar object', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('VERSION:2.0');
  });

  it('uses CRLF line endings as the RFC requires', () => {
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('sets start and end times', () => {
    expect(ics).toContain('DTSTART:20250617T140000Z');
    expect(ics).toContain('DTEND:20250617T144500Z');
  });

  it('escapes semicolons and commas in text fields', () => {
    expect(ics).toMatch(/SUMMARY:Team sync\\; with punctuation\\, here/);
  });

  it('folds long lines to 75 octets', () => {
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('includes a unique identifier', () => {
    expect(ics).toMatch(/UID:.+@web-tools/);
  });
});

describe('buildShareText', () => {
  it('lists every participant with their local time', () => {
    const slots = findMeetingSlots({
      zones: ['UTC', 'Asia/Tokyo'],
      date: { year: 2025, month: 6, day: 17 },
      referenceZone: 'UTC',
      working: { start: 9, end: 17 },
      allowWeekends: false,
      stepMinutes: 60,
      durationMinutes: 30,
    });
    const text = buildShareText(slots[10]!, 30, 'Standup');
    expect(text).toContain('Standup');
    expect(text).toContain('UTC');
    expect(text).toContain('Tokyo');
    expect(text).toContain('30 minutes');
  });
});
