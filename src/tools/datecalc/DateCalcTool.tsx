import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, Segmented, SelectField, TextField } from '@/components/ui';
import { HeroResult, KeyValue } from '@/components/TextIO';
import { addBusinessDays, addDays, addMonths, dateDiff, fixedHolidays, formatDateInput, humanizeDiff, parseDateInput } from '@/lib/dates';

type Mode = 'between' | 'add';
type Region = 'none' | 'us' | 'uk';

const today = (): string => formatDateInput(new Date());

export default function DateCalcTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('between');
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(() => formatDateInput(addDays(new Date(), 90)));
  const [region, setRegion] = useState<Region>('none');
  const [amount, setAmount] = useState(30);
  const [unit, setUnit] = useState<'days' | 'business' | 'weeks' | 'months' | 'years'>('days');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');

  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);

  const holidays = useMemo(() => {
    if (region === 'none' || !fromDate) return [];
    const years = new Set<number>([fromDate.getFullYear()]);
    if (toDate) years.add(toDate.getFullYear());
    years.add(fromDate.getFullYear() + 1);
    return [...years].flatMap((y) => fixedHolidays(y, region));
  }, [region, fromDate, toDate]);

  const diff = fromDate && toDate ? dateDiff(fromDate, toDate, holidays) : null;

  const result = useMemo(() => {
    if (!fromDate) return null;
    const n = direction === 'add' ? amount : -amount;
    switch (unit) {
      case 'days':
        return addDays(fromDate, n);
      case 'weeks':
        return addDays(fromDate, n * 7);
      case 'months':
        return addMonths(fromDate, n);
      case 'years':
        return addMonths(fromDate, n * 12);
      case 'business':
        return addBusinessDays(fromDate, n, holidays);
    }
  }, [fromDate, amount, unit, direction, holidays]);

  const long = (d: Date): string => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <ToolShell slug="date-calculator">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'between', label: 'Days between dates' }, { value: 'add', label: 'Add or subtract' }]} />
        <SelectField label="Public holidays" value={region} onChange={(v) => setRegion(v)} options={[{ value: 'none', label: 'Weekends only' }, { value: 'us', label: 'US federal' }, { value: 'uk', label: 'UK bank holidays' }]} className="w-48" />
      </div>
      {mode === 'between' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Panel title="Dates">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="From" type="date" value={from} onChange={setFrom} />
              <TextField label="To" type="date" value={to} onChange={setTo} />
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="chip hover:opacity-80" onClick={() => setFrom(today())}>From = today</button>
                <button type="button" className="chip hover:opacity-80" onClick={() => setTo(today())}>To = today</button>
                <button type="button" className="chip hover:opacity-80" onClick={() => { setFrom(to); setTo(from); }}>Swap</button>
                <button type="button" className="chip hover:opacity-80" onClick={() => setTo(formatDateInput(new Date(new Date().getFullYear(), 11, 31)))}>End of year</button>
              </div>
            </div>
          </Panel>
          <div className="flex flex-col gap-4">
            {diff ? (
              <>
                <HeroResult label={diff.negative ? 'Elapsed (the “to” date is earlier)' : 'Between the two dates'} value={humanizeDiff(diff)} sub={`${diff.totalDays.toLocaleString()} day${diff.totalDays === 1 ? '' : 's'} in total`} />
                <Panel title="Breakdown" bodyClassName="px-4">
                  <KeyValue
                    dense
                    rows={[
                      { key: 'Years, months, days', value: `${diff.years}y ${diff.months}m ${diff.days}d` },
                      { key: 'Total days', value: diff.totalDays.toLocaleString() },
                      { key: 'Business days', value: `${diff.businessDays.toLocaleString()}${region !== 'none' ? ' (excluding holidays)' : ''}` },
                      { key: 'Weekend days', value: diff.weekends.toLocaleString() },
                      { key: 'Weeks', value: `${diff.totalWeeks.toLocaleString()} weeks ${diff.totalDays % 7} days` },
                      { key: 'Hours', value: diff.totalHours.toLocaleString() },
                      { key: 'Minutes', value: diff.totalMinutes.toLocaleString() },
                      { key: 'Seconds', value: diff.totalSeconds.toLocaleString() },
                    ]}
                  />
                </Panel>
              </>
            ) : (
              <Panel title="Result"><p className="muted p-4 text-sm">Pick two valid dates.</p></Panel>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Panel title="Calculation">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Start date" type="date" value={from} onChange={setFrom} />
              <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }]} size="sm" />
              <div className="flex gap-2">
                <NumberField label="Amount" value={amount} onChange={setAmount} min={0} max={100000} className="w-28" />
                <SelectField label="Unit" value={unit} onChange={(v) => setUnit(v)} options={[{ value: 'days', label: 'Days' }, { value: 'business', label: 'Business days' }, { value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }, { value: 'years', label: 'Years' }]} className="flex-1" />
              </div>
            </div>
          </Panel>
          <div className="flex flex-col gap-4">
            {result && fromDate ? (
              <>
                <HeroResult label={`${direction === 'add' ? 'Adding' : 'Subtracting'} ${amount} ${unit === 'business' ? 'business days' : unit} ${direction === 'add' ? 'to' : 'from'} ${long(fromDate)}`} value={long(result)} copy={formatDateInput(result)} sub={formatDateInput(result)} />
                <Panel title="Also" bodyClassName="px-4">
                  <KeyValue
                    dense
                    rows={[
                      { key: 'ISO date', value: formatDateInput(result), copy: formatDateInput(result) },
                      { key: 'Day of year', value: String(Math.floor((result.getTime() - new Date(result.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1) },
                      { key: 'Calendar days from start', value: dateDiff(fromDate, result).totalDays.toLocaleString() },
                      { key: 'Business days from start', value: dateDiff(fromDate, result, holidays).businessDays.toLocaleString() },
                    ]}
                  />
                </Panel>
              </>
            ) : (
              <Panel title="Result"><p className="muted p-4 text-sm">Pick a valid start date.</p></Panel>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}
