import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented, SelectField, TextField } from '@/components/ui';
import { DataTable, HeroResult } from '@/components/TextIO';
import { CRON_PRESETS, buildCron, nextRuns, parseCron } from '@/lib/cron';
import type { ParsedCron } from '@/lib/cron';
import { relativeTime } from '@/lib/timestamp';

const nowDate = (): Date => new Date();

const MINUTES = [{ value: '*', label: 'every minute' }, { value: '0', label: 'at :00' }, { value: '15', label: 'at :15' }, { value: '30', label: 'at :30' }, { value: '*/5', label: 'every 5 minutes' }, { value: '*/15', label: 'every 15 minutes' }, { value: '*/30', label: 'every 30 minutes' }];
const HOURS = [{ value: '*', label: 'every hour' }, ...Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `at ${String(h).padStart(2, '0')}:xx` })), { value: '*/2', label: 'every 2 hours' }, { value: '*/6', label: 'every 6 hours' }, { value: '9-17', label: 'business hours 9–17' }];
const DOM = [{ value: '*', label: 'every day' }, { value: '1', label: 'on the 1st' }, { value: '15', label: 'on the 15th' }, { value: 'L', label: 'last day of month' }, { value: '1,15', label: '1st and 15th' }];
const MONTHS = [{ value: '*', label: 'every month' }, { value: '1', label: 'January' }, { value: '1,7', label: 'January and July' }, { value: '*/3', label: 'every quarter' }, { value: '12', label: 'December' }];
const DOW = [{ value: '*', label: 'any weekday' }, { value: '1-5', label: 'Monday–Friday' }, { value: '0,6', label: 'weekends' }, { value: '1', label: 'Mondays' }, { value: '5', label: 'Fridays' }, { value: '0', label: 'Sundays' }];

export default function CronTool(): React.ReactElement {
  const [expression, setExpression] = useState('0 9 * * 1-5');
  const [utc, setUtc] = useState<'local' | 'utc'>('local');
  const [now, setNow] = useState<Date>(nowDate);
  const [parts, setParts] = useState({ minute: '0', hour: '9', dayOfMonth: '*', month: '*', dayOfWeek: '1-5' });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const parsed = useMemo<{ cron: ParsedCron | null; error: string | null }>(() => {
    try {
      return { cron: parseCron(expression), error: null };
    } catch (e) {
      return { cron: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [expression]);

  const runs = useMemo(() => {
    if (!parsed.cron) return [];
    try {
      return nextRuns(parsed.cron, 10, now);
    } catch {
      return [];
    }
  }, [parsed.cron, now]);

  const fmt = (d: Date): string =>
    utc
      ? d.toLocaleString(undefined, { timeZone: utc === 'utc' ? 'UTC' : undefined, weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleString();

  const setPart = (key: keyof typeof parts, value: string): void => {
    const next = { ...parts, [key]: value };
    setParts(next);
    setExpression(buildCron(next));
  };

  return (
    <ToolShell slug="cron-parser">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Expression">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Cron expression" value={expression} onChange={setExpression} mono autoFocus invalid={Boolean(parsed.error)} hint={parsed.error ?? 'Five fields (minute hour day month weekday), six with seconds, or @daily-style shortcuts.'} />
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((p) => (
                  <button key={p.expression} type="button" className="chip hover:opacity-80" onClick={() => setExpression(p.expression)} title={p.expression}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Build one" description="Pick options; the expression above updates.">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <SelectField label="Minute" value={parts.minute} onChange={(v) => setPart('minute', v)} options={MINUTES} />
              <SelectField label="Hour" value={parts.hour} onChange={(v) => setPart('hour', v)} options={HOURS} />
              <SelectField label="Day of month" value={parts.dayOfMonth} onChange={(v) => setPart('dayOfMonth', v)} options={DOM} />
              <SelectField label="Month" value={parts.month} onChange={(v) => setPart('month', v)} options={MONTHS} />
              <SelectField label="Day of week" value={parts.dayOfWeek} onChange={(v) => setPart('dayOfWeek', v)} options={DOW} className="sm:col-span-2" />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {parsed.error ? (
            <Callout tone="error" title="Invalid expression">
              {parsed.error}
            </Callout>
          ) : (
            parsed.cron && (
              <>
                <HeroResult label="In plain English" value={<span className="font-sans text-lg font-semibold sm:text-xl">{parsed.cron.description}</span>} copy={parsed.cron.description} />
                <Panel title="Fields">
                  <DataTable
                    headers={['Field', 'Value', 'Matches']}
                    rows={(['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const)
                      .filter((f) => f !== 'second' || parsed.cron!.hasSeconds)
                      .map((f) => {
                        const field = parsed.cron!.fields[f];
                        return [field.name, <code key="r" className="font-mono">{field.raw}</code>, field.any ? 'any' : field.values.length > 12 ? `${field.values.slice(0, 12).join(', ')}… (${field.values.length} values)` : field.values.join(', ')];
                      })}
                    maxHeight="16rem"
                  />
                  {parsed.cron.dayOfMonthRestricted && parsed.cron.dayOfWeekRestricted && (
                    <p className="muted px-3 py-2 text-xs">Both day-of-month and day-of-week are set: like Vixie cron, a run happens when <em>either</em> matches.</p>
                  )}
                </Panel>
                <Panel
                  title="Next 10 runs"
                  actions={
                    <Segmented size="sm" label="Time zone" value={utc} onChange={setUtc} options={[{ value: 'local', label: 'Local' }, { value: 'utc', label: 'UTC' }]} />
                  }
                >
                  {runs.length ? (
                    <ol className="divide-y">
                      {runs.map((d, i) => (
                        <li key={d.getTime()} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                          <span className="flex items-center gap-3">
                            <span className="muted w-5 font-mono text-xs">{i + 1}</span>
                            <span className="font-mono">{fmt(d)}</span>
                          </span>
                          <span className="muted text-xs">{relativeTime(d, now)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted p-4 text-sm">No upcoming runs within the next few years — check the day/month combination.</p>
                  )}
                </Panel>
              </>
            )
          )}
        </div>
      </div>
    </ToolShell>
  );
}
