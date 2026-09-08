import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Clock, Globe2, Plus, Search, Trash2, X } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  EmptyState,
  FieldGroup,
  Panel,
  Segmented,
  Slider,
  Toggle,
} from '@/components/ui';
import {
  POPULAR_ZONES,
  buildIcs,
  buildShareText,
  defaultWorkingHours,
  describeZone,
  findMeetingSlots,
  formatInZone,
  formatOffset,
  getLocalTimeZone,
  listTimeZones,
  utcToZonedParts,
} from '@/lib/timezone';
import type { MeetingSlot, SlotQuality, WorkingHours } from '@/lib/timezone';
import { downloadText } from '@/lib/files';
import { useLocalStorage } from '@/hooks';

const QUALITY_COLOR: Record<SlotQuality, string> = {
  ideal: 'var(--ok)',
  acceptable: 'color-mix(in oklab, var(--ok) 55%, var(--warn))',
  awkward: 'var(--warn)',
  unreasonable: 'var(--danger)',
};

const QUALITY_LABEL: Record<SlotQuality, string> = {
  ideal: 'Working hours',
  acceptable: 'Just outside working hours',
  awkward: 'Early or late, but awake',
  unreasonable: 'Night, or a weekend',
};

function todayInZone(zone: string): { year: number; month: number; day: number } {
  const parts = utcToZonedParts(new Date(), zone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function toDateInput(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export default function TimezoneTool(): React.ReactElement {
  const localZone = useMemo(() => getLocalTimeZone(), []);
  const defaultZones = useMemo(
    () => [...new Set([localZone, 'America/New_York', 'Europe/London', 'Asia/Singapore'])].slice(0, 6),
    [localZone],
  );
  const [zones, setZones] = useLocalStorage<string[]>('wt:tz:zones', defaultZones);
  const [working, setWorking] = useLocalStorage<WorkingHours>('wt:tz:working', defaultWorkingHours);
  const [allowWeekends, setAllowWeekends] = useLocalStorage<boolean>('wt:tz:weekends', false);
  const [duration, setDuration] = useLocalStorage<number>('wt:tz:duration', 45);
  const [step, setStep] = useLocalStorage<15 | 30 | 60>('wt:tz:step', 30);
  const [hour12, setHour12] = useLocalStorage<boolean>('wt:tz:hour12', false);
  const [title, setTitle] = useState('Team sync');
  const [dateValue, setDateValue] = useState(() => toDateInput(todayInZone(localZone)));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Guard against a corrupted or empty persisted list.
  useEffect(() => {
    if (!Array.isArray(zones) || zones.length === 0) setZones([localZone]);
  }, [zones, localZone, setZones]);

  const referenceZone = zones[0] ?? localZone;

  const date = useMemo(() => {
    const [y, m, d] = dateValue.split('-').map(Number);
    const fallback = todayInZone(referenceZone);
    if (!y || !m || !d) return fallback;
    return { year: y, month: m, day: d };
  }, [dateValue, referenceZone]);

  const slots = useMemo(
    () =>
      findMeetingSlots({
        zones,
        date,
        referenceZone,
        working,
        allowWeekends,
        stepMinutes: step,
        durationMinutes: duration,
      }),
    [zones, date, referenceZone, working, allowWeekends, step, duration],
  );

  const best = useMemo(
    () =>
      [...slots]
        .map((slot, index) => ({ slot, index }))
        .sort((a, b) => b.slot.score - a.slot.score || a.index - b.index)
        .slice(0, 5),
    [slots],
  );

  const selected: MeetingSlot | null =
    selectedIndex !== null ? (slots[selectedIndex] ?? null) : (best[0]?.slot ?? null);

  const allZones = useMemo(() => listTimeZones(), []);
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = q
      ? allZones.filter((z) => z.toLowerCase().replace(/_/g, ' ').includes(q.replace(/_/g, ' ')))
      : POPULAR_ZONES;
    return pool.filter((z) => !zones.includes(z)).slice(0, 40);
  }, [search, allZones, zones]);

  const addZone = useCallback(
    (zone: string) => {
      setZones((prev) => (prev.includes(zone) || prev.length >= 12 ? prev : [...prev, zone]));
      setSearch('');
    },
    [setZones],
  );

  const removeZone = (zone: string): void =>
    setZones((prev) => (prev.length <= 1 ? prev : prev.filter((z) => z !== zone)));

  const formatHour = (hour: number, minute: number): string => {
    if (!hour12) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const suffix = hour < 12 ? 'am' : 'pm';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:${String(minute).padStart(2, '0')}${suffix}`;
  };

  const shareText = selected ? buildShareText(selected, duration, title) : '';

  const downloadIcs = (): void => {
    if (!selected) return;
    const ics = buildIcs({
      start: selected.utc,
      durationMinutes: duration,
      title,
      description: 'Scheduled with the Web Tools time zone planner.',
      zones,
    });
    downloadText(ics, `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'meeting'}.ics`, 'text/calendar');
  };

  return (
    <ToolShell
      slug="timezone-planner"
      wide
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={() => setPickerOpen((v) => !v)}>
            <Plus size={14} aria-hidden />
            Add a zone
          </button>
          {selected && (
            <button type="button" className="btn btn-sm btn-primary" onClick={downloadIcs}>
              <CalendarPlus size={14} aria-hidden />
              Calendar invite
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <Panel title="Meeting" bodyClassName="space-y-4 p-4">
            <FieldGroup label="Title" htmlFor="meeting-title">
              <input
                id="meeting-title"
                type="text"
                className="field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </FieldGroup>
            <FieldGroup label="Date" hint={`Interpreted in ${referenceZone.replace(/_/g, ' ')}.`} htmlFor="meeting-date">
              <input
                id="meeting-date"
                type="date"
                className="field"
                value={dateValue}
                onChange={(e) => {
                  setDateValue(e.target.value);
                  setSelectedIndex(null);
                }}
              />
            </FieldGroup>
            <Slider
              label="Duration"
              min={15}
              max={240}
              step={15}
              value={duration}
              onChange={setDuration}
              format={(v) => (v >= 60 ? `${Math.floor(v / 60)}h ${v % 60 ? `${v % 60}m` : ''}`.trim() : `${v} min`)}
            />
            <FieldGroup label="Slot granularity">
              <Segmented
                size="sm"
                value={String(step)}
                onChange={(v) => {
                  setStep(Number(v) as 15 | 30 | 60);
                  setSelectedIndex(null);
                }}
                options={[
                  { value: '15', label: '15 min' },
                  { value: '30', label: '30 min' },
                  { value: '60', label: '1 hour' },
                ]}
              />
            </FieldGroup>
          </Panel>

          <Panel title="Working hours" description="Applied to every participant" bodyClassName="space-y-4 p-4">
            <Slider
              label="Day starts"
              min={0}
              max={12}
              value={working.start}
              onChange={(v) => setWorking((p) => ({ ...p, start: Math.min(v, p.end - 1) }))}
              format={(v) => formatHour(v, 0)}
            />
            <Slider
              label="Day ends"
              min={13}
              max={24}
              value={working.end}
              onChange={(v) => setWorking((p) => ({ ...p, end: Math.max(v, p.start + 1) }))}
              format={(v) => formatHour(v % 24, 0)}
            />
            <Toggle
              checked={allowWeekends}
              onChange={setAllowWeekends}
              label="Weekends are acceptable"
              hint="Off marks any Saturday or Sunday slot as unreasonable."
            />
            <Toggle checked={hour12} onChange={setHour12} label="12-hour clock" />
          </Panel>

          {pickerOpen && (
            <Panel
              title="Add participants"
              actions={
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close the zone picker"
                >
                  <X size={14} aria-hidden />
                </button>
              }
              bodyClassName="p-3 space-y-2"
            >
              <div className="relative">
                <Search size={15} className="muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
                <input
                  type="search"
                  className="field !pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cities or zones…"
                  aria-label="Search time zones"
                />
              </div>
              {zones.length >= 12 && (
                <Callout tone="warning">Twelve participants is the maximum — the grid stops being readable beyond that.</Callout>
              )}
              <ul className="max-h-72 overflow-y-auto">
                {searchResults.length === 0 && (
                  <li className="muted px-2 py-4 text-center text-xs">No zone matches “{search}”.</li>
                )}
                {searchResults.map((zone) => {
                  const info = describeZone(zone);
                  return (
                    <li key={zone}>
                      <button
                        type="button"
                        className="hover:surface-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                        onClick={() => addZone(zone)}
                        disabled={zones.length >= 12}
                      >
                        <Globe2 size={14} className="muted shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{info.city}</span>
                        <span className="muted shrink-0 font-mono text-[0.7rem]">
                          {formatOffset(info.offsetMinutes)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Panel
            title="Participants"
            description="The first zone is the reference for the chosen date."
            bodyClassName="p-3"
          >
            {zones.length === 0 ? (
              <EmptyState title="No zones selected" description="Add at least one participant." compact />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {zones.map((zone, index) => {
                  const info = describeZone(zone);
                  return (
                    <li
                      key={zone}
                      className="surface-3 flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {info.city}
                          {index === 0 && (
                            <span className="muted ml-1.5 text-[0.7rem] font-normal">reference</span>
                          )}
                        </span>
                        <span className="muted block font-mono text-[0.7rem]">
                          {formatOffset(info.offsetMinutes)} {info.abbreviation && `· ${info.abbreviation}`} ·{' '}
                          {formatInZone(new Date(), zone, { timeStyle: 'short', hour12 })}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm shrink-0"
                        onClick={() => removeZone(zone)}
                        disabled={zones.length <= 1}
                        aria-label={`Remove ${info.city}`}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Best times"
            description={`Top-scoring slots on ${dateValue} in ${referenceZone.replace(/_/g, ' ')}`}
            bodyClassName="p-3"
          >
            {best.length === 0 ? (
              <EmptyState icon={<Clock size={28} />} title="No slots to score yet" compact />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {best.map(({ slot, index }) => {
                  const isSelected = selected?.utc.getTime() === slot.utc.getTime();
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className="card w-full p-3 text-left transition-shadow hover:shadow-md"
                        style={
                          isSelected
                            ? {
                                borderColor: 'var(--accent)',
                                background: 'color-mix(in oklab, var(--accent) 8%, var(--surface-2))',
                              }
                            : undefined
                        }
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-base font-semibold">
                            {formatHour(
                              slot.participants[0]?.hour ?? 0,
                              slot.participants[0]?.minute ?? 0,
                            )}
                          </span>
                          <span
                            className="text-xs font-semibold"
                            style={{ color: QUALITY_COLOR[slot.worstQuality] }}
                          >
                            {slot.score}%
                          </span>
                        </div>
                        <div className="muted mt-1 text-xs">
                          {slot.workableCount} of {slot.participants.length} in working hours
                        </div>
                        <div className="mt-2 flex gap-0.5">
                          {slot.participants.map((participant) => (
                            <span
                              key={participant.zone}
                              className="h-1.5 flex-1 rounded-full"
                              style={{ background: QUALITY_COLOR[participant.quality] }}
                              title={`${participant.zone}: ${QUALITY_LABEL[participant.quality]}`}
                            />
                          ))}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {selected && (
            <Panel
              title="Selected slot"
              actions={
                <>
                  <CopyButton value={shareText} label="Copy summary" small />
                  <button type="button" className="btn btn-sm" onClick={downloadIcs}>
                    <CalendarPlus size={14} aria-hidden />
                    <span className="hidden sm:inline">.ics</span>
                  </button>
                </>
              }
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Local time for each participant</caption>
                  <thead className="surface-3">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Participant</th>
                      <th className="px-3 py-2 font-semibold">Local time</th>
                      <th className="px-3 py-2 font-semibold">Day</th>
                      <th className="px-3 py-2 font-semibold">Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.participants.map((participant) => {
                      const info = describeZone(participant.zone, selected.utc);
                      return (
                        <tr key={participant.zone} className="border-t">
                          <td className="px-3 py-2">
                            <span className="block font-medium">{info.city}</span>
                            <span className="muted font-mono text-[0.7rem]">
                              {formatOffset(info.offsetMinutes)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums">
                            {formatHour(participant.hour, participant.minute)}
                          </td>
                          <td className="muted px-3 py-2 text-xs">
                            {participant.dayLabel}
                            {participant.dayShift !== 0 && (
                              <span style={{ color: 'var(--warn)' }}>
                                {' '}
                                {participant.dayShift > 0 ? '(next day)' : '(previous day)'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <span
                              className="inline-flex items-center gap-1.5"
                              style={{ color: QUALITY_COLOR[participant.quality] }}
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: QUALITY_COLOR[participant.quality] }}
                                aria-hidden
                              />
                              {QUALITY_LABEL[participant.quality]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="muted border-t px-3 py-2 text-xs">
                UTC: {selected.utc.toISOString().slice(0, 16).replace('T', ' ')} · Duration {duration}{' '}
                minutes · Offsets shown are the ones in force on this date, so daylight saving is
                already accounted for.
              </div>
            </Panel>
          )}

          <Panel
            title="Whole day"
            description="Every slot, coloured by how workable it is. Click to select."
            bodyClassName="overflow-x-auto p-0"
          >
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Full day grid of candidate meeting times</caption>
              <thead>
                <tr>
                  <th
                    className="surface-3 sticky left-0 z-10 px-2 py-1.5 text-left font-semibold"
                    scope="col"
                  >
                    Zone
                  </th>
                  {slots.map((slot, index) => (
                    <th key={index} scope="col" className="p-0 font-normal">
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className="muted w-full px-0.5 py-1 font-mono text-[0.6rem] hover:opacity-70"
                        title={`Select ${formatHour(slot.participants[0]?.hour ?? 0, slot.participants[0]?.minute ?? 0)}`}
                      >
                        {(slot.participants[0]?.minute ?? 0) === 0
                          ? String(slot.participants[0]?.hour ?? 0).padStart(2, '0')
                          : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((zone, zoneIndex) => (
                  <tr key={zone}>
                    <th
                      scope="row"
                      className="surface-3 sticky left-0 z-10 max-w-[10rem] truncate px-2 py-1 text-left text-xs font-medium"
                    >
                      {describeZone(zone).city}
                    </th>
                    {slots.map((slot, slotIndex) => {
                      const participant = slot.participants[zoneIndex];
                      if (!participant) return <td key={slotIndex} />;
                      const isSelected = selected?.utc.getTime() === slot.utc.getTime();
                      return (
                        <td key={slotIndex} className="p-0">
                          <button
                            type="button"
                            onClick={() => setSelectedIndex(slotIndex)}
                            className="block h-6 w-full transition-opacity hover:opacity-70"
                            style={{
                              background: QUALITY_COLOR[participant.quality],
                              opacity: participant.quality === 'ideal' ? 0.85 : 0.45,
                              outline: isSelected ? '2px solid var(--text)' : undefined,
                              outlineOffset: -2,
                            }}
                            aria-label={`${describeZone(zone).city} at ${formatHour(participant.hour, participant.minute)}: ${QUALITY_LABEL[participant.quality]}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-3 border-t px-3 py-2">
              {(Object.keys(QUALITY_LABEL) as SlotQuality[]).map((quality) => (
                <span key={quality} className="muted flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: QUALITY_COLOR[quality] }}
                    aria-hidden
                  />
                  {QUALITY_LABEL[quality]}
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
