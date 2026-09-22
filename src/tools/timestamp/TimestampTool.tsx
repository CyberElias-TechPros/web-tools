import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { CopyButton, Panel, SelectField, TextField } from '@/components/ui';
import { HeroResult, KeyValue } from '@/components/TextIO';
import { COMMON_ZONES, describeTimestamp, formatInZone, parseTimestamp } from '@/lib/timestamp';
import { useLocalStorage } from '@/hooks';

const nowDate = (): Date => new Date();

export default function TimestampTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [now, setNow] = useState<Date>(nowDate);
  const [zone, setZone] = useLocalStorage('ts:zone', 'Asia/Tokyo');

  // Tick once a second so the "now" panel and relative times stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const parsed = useMemo(() => (input.trim() ? parseTimestamp(input, now) : null), [input, now]);
  const target = parsed?.date ?? now;
  const formats = useMemo(() => describeTimestamp(target, now), [target, now]);
  const inZone = formatInZone(target, zone);

  return (
    <ToolShell slug="timestamp-converter">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Input" description="Unix seconds, milliseconds, microseconds, ISO 8601, RFC 2822, “tomorrow 9am”, “+3 days”…">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Timestamp or date" value={input} onChange={setInput} placeholder={String(Math.floor(now.getTime() / 1000))} mono autoFocus invalid={Boolean(input.trim()) && !parsed} hint={input.trim() ? (parsed ? `Read as ${parsed.interpretation}` : 'Could not understand that — try a Unix number or an ISO date.') : 'Leave empty to use the current time.'} />
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Now', ''],
                  ['Unix s', String(Math.floor(now.getTime() / 1000))],
                  ['Unix ms', String(now.getTime())],
                  ['ISO', now.toISOString()],
                  ['Epoch', '0'],
                  ['Y2K38', '2147483647'],
                ].map(([label, value]) => (
                  <button key={label} type="button" className="chip hover:opacity-80" onClick={() => setInput(value!)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <HeroResult label="Unix seconds" value={formats.unixSeconds} copy={formats.unixSeconds} sub={formats.relative} />
          <HeroResult label="ISO 8601 (UTC)" value={<span className="text-lg">{formats.iso}</span>} copy={formats.iso} />
          <Panel title="Live clock" description="Current time in this browser">
            <div className="p-4 font-mono text-sm">
              <div className="flex justify-between gap-2"><span className="muted">Unix</span><span>{Math.floor(now.getTime() / 1000)}</span></div>
              <div className="flex justify-between gap-2"><span className="muted">ISO</span><span>{now.toISOString()}</span></div>
              <div className="flex justify-between gap-2"><span className="muted">Local</span><span>{now.toLocaleString()}</span></div>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Every representation" bodyClassName="px-4">
            <KeyValue
              dense
              rows={[
                { key: 'Unix seconds', value: formats.unixSeconds, copy: formats.unixSeconds },
                { key: 'Unix milliseconds', value: formats.unixMillis, copy: formats.unixMillis },
                { key: 'ISO 8601 UTC', value: formats.iso, copy: formats.iso },
                { key: 'ISO 8601 local', value: formats.isoLocal, copy: formats.isoLocal },
                { key: 'RFC 2822', value: formats.rfc2822, copy: formats.rfc2822 },
                { key: 'UTC', value: formats.utcHuman, mono: false },
                { key: `Local (${formats.timezone})`, value: formats.localHuman, mono: false },
                { key: 'Relative', value: formats.relative, mono: false },
                { key: 'Weekday', value: formats.weekday, mono: false },
                { key: 'Day of year', value: String(formats.dayOfYear) },
                { key: 'ISO week', value: formats.isoWeek, copy: formats.isoWeek },
                { key: 'Quarter', value: formats.quarter },
                { key: 'Excel serial', value: formats.excelSerial, copy: formats.excelSerial },
                { key: 'UTC offset', value: `${formats.offsetMinutes >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(formats.offsetMinutes) / 60)).padStart(2, '0')}:${String(Math.abs(formats.offsetMinutes) % 60).padStart(2, '0')}` },
              ]}
            />
          </Panel>
          <Panel title="In another time zone">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <SelectField label="Time zone" value={zone} onChange={setZone} options={COMMON_ZONES.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} className="sm:w-72" />
              <div className="flex flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 font-mono text-sm">
                <span>{inZone ? `${inZone.text} (${inZone.offset})` : 'Unsupported zone'}</span>
                {inZone && <CopyButton value={inZone.text} small label="" className="!px-1.5" />}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}
