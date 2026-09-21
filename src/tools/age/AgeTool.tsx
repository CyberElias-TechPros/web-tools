import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Panel, TextField } from '@/components/ui';
import { HeroResult, KeyValue } from '@/components/TextIO';
import { ageReport, formatDateInput, parseDateInput } from '@/lib/dates';
import { useLocalStorage } from '@/hooks';

const nowDate = (): Date => new Date();

export default function AgeTool(): React.ReactElement {
  const [birth, setBirth] = useLocalStorage('age:birth', '1990-06-15');
  const [on, setOn] = useState<string>('');
  const [now, setNow] = useState<Date>(nowDate);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const birthDate = parseDateInput(birth);
  const onDate = on ? parseDateInput(on) : now;
  const report = useMemo(() => (birthDate && onDate && onDate >= birthDate ? ageReport(birthDate, onDate) : null), [birthDate, onDate]);

  const seconds = birthDate ? Math.floor((now.getTime() - birthDate.getTime()) / 1000) : 0;

  return (
    <ToolShell slug="age-calculator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="Dates">
          <div className="flex flex-col gap-3 p-4">
            <TextField label="Date of birth" type="date" value={birth} onChange={setBirth} />
            <TextField label="Age on (leave empty for today)" type="date" value={on} onChange={setOn} />
            <button type="button" className="btn btn-sm self-start" onClick={() => setOn('')} disabled={!on}>
              Use today
            </button>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          {report && birthDate ? (
            <>
              <HeroResult label={on ? `Age on ${formatDateInput(onDate!)}` : 'Age today'} value={`${report.years} years, ${report.months} months, ${report.days} days`} sub={`${report.totalDays.toLocaleString()} days lived`} />
              {!on && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Months', Math.floor(report.totalDays / 30.4375)],
                    ['Weeks', Math.floor(report.totalDays / 7)],
                    ['Hours', Math.floor(seconds / 3600)],
                    ['Seconds', seconds],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="card px-4 py-3">
                      <div className="muted text-[0.65rem] font-semibold tracking-wide uppercase">{k}</div>
                      <div className="font-mono text-lg tabular-nums">{Number(v).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
              <Panel title="Details" bodyClassName="px-4">
                <KeyValue
                  dense
                  rows={[
                    { key: 'Born on a', value: report.dayOfWeekBorn, mono: false },
                    { key: 'Next birthday', value: `${report.nextBirthday.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} — in ${report.daysUntilBirthday} day${report.daysUntilBirthday === 1 ? '' : 's'}`, mono: false },
                    { key: 'Turning', value: `${report.years + 1}` },
                    { key: 'Zodiac sign', value: report.zodiac, mono: false },
                    { key: 'Chinese zodiac', value: report.chineseZodiac, mono: false },
                    { key: 'Generation', value: report.generation, mono: false },
                    { key: '10 000 days old on', value: formatDateInput(new Date(birthDate.getTime() + 10_000 * 86_400_000)) },
                    { key: '20 000 days old on', value: formatDateInput(new Date(birthDate.getTime() + 20_000 * 86_400_000)) },
                    { key: 'One billion seconds old on', value: formatDateInput(new Date(birthDate.getTime() + 1e12)) },
                  ]}
                />
              </Panel>
            </>
          ) : (
            <Panel title="Result"><p className="muted p-4 text-sm">Enter a birth date that is before the “age on” date.</p></Panel>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
