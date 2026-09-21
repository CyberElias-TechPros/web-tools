import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, Segmented, Stat } from '@/components/ui';
import { HeroResult } from '@/components/TextIO';
import { useLocalStorage } from '@/hooks';

const BANDS: Array<{ max: number; label: string; tone: 'warn' | 'ok' | 'danger' }> = [
  { max: 18.5, label: 'Underweight', tone: 'warn' },
  { max: 25, label: 'Healthy weight', tone: 'ok' },
  { max: 30, label: 'Overweight', tone: 'warn' },
  { max: 35, label: 'Obesity class I', tone: 'danger' },
  { max: 40, label: 'Obesity class II', tone: 'danger' },
  { max: Infinity, label: 'Obesity class III', tone: 'danger' },
];

export default function BmiTool(): React.ReactElement {
  const [units, setUnits] = useLocalStorage<'metric' | 'imperial'>('bmi:units', 'metric');
  const [cm, setCm] = useLocalStorage('bmi:cm', 175);
  const [kg, setKg] = useLocalStorage('bmi:kg', 72);
  const [ft, setFt] = useLocalStorage('bmi:ft', 5);
  const [inch, setInch] = useLocalStorage('bmi:in', 9);
  const [lb, setLb] = useLocalStorage('bmi:lb', 160);
  const [age, setAge] = useLocalStorage('bmi:age', 30);
  const [sex, setSex] = useLocalStorage<'female' | 'male'>('bmi:sex', 'female');

  const heightM = units === 'metric' ? cm / 100 : (ft * 12 + inch) * 0.0254;
  const weightKg = units === 'metric' ? kg : lb * 0.45359237;
  const bmi = heightM > 0 ? weightKg / (heightM * heightM) : 0;
  const band = BANDS.find((b) => bmi < b.max) ?? BANDS[BANDS.length - 1]!;
  const healthyMin = 18.5 * heightM * heightM;
  const healthyMax = 24.9 * heightM * heightM;
  const toDisplay = (k: number): string => (units === 'metric' ? `${k.toFixed(1)} kg` : `${(k / 0.45359237).toFixed(0)} lb`);
  // Mifflin–St Jeor resting energy expenditure
  const bmr = sex === 'male' ? 10 * weightKg + 6.25 * heightM * 100 - 5 * age + 5 : 10 * weightKg + 6.25 * heightM * 100 - 5 * age - 161;
  const pointer = Math.min(100, Math.max(0, ((bmi - 12) / (42 - 12)) * 100));
  const color = band.tone === 'ok' ? 'var(--ok)' : band.tone === 'warn' ? 'var(--warn)' : 'var(--danger)';

  return (
    <ToolShell slug="bmi-calculator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel title="You">
          <div className="flex flex-col gap-3 p-4">
            <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: 'metric', label: 'cm / kg' }, { value: 'imperial', label: 'ft / lb' }]} size="sm" />
            {units === 'metric' ? (
              <>
                <NumberField label="Height (cm)" value={cm} onChange={setCm} min={50} max={272} />
                <NumberField label="Weight (kg)" value={kg} onChange={setKg} min={10} max={500} step={0.1} />
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Height (ft)" value={ft} onChange={setFt} min={1} max={8} />
                  <NumberField label="(in)" value={inch} onChange={setInch} min={0} max={11} />
                </div>
                <NumberField label="Weight (lb)" value={lb} onChange={setLb} min={20} max={1100} />
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Age" value={age} onChange={setAge} min={2} max={120} />
              <Segmented label="Sex (for energy estimate)" value={sex} onChange={setSex} options={[{ value: 'female', label: 'F' }, { value: 'male', label: 'M' }]} size="sm" />
            </div>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <HeroResult label="Body mass index" value={bmi ? bmi.toFixed(1) : '—'} sub={<span style={{ color }}>{band.label}</span>} />
          <div className="card p-4">
            <div className="relative h-3 overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg, var(--warn) 0 21%, var(--ok) 21% 43%, var(--warn) 43% 60%, var(--danger) 60% 100%)' }} role="img" aria-label={`BMI scale, pointer at ${bmi.toFixed(1)}`}>
              <div className="absolute top-0 h-3 w-1 rounded bg-white shadow" style={{ left: `calc(${pointer}% - 2px)` }} />
            </div>
            <div className="muted mt-1 flex justify-between font-mono text-[0.65rem]"><span>12</span><span>18.5</span><span>25</span><span>30</span><span>42</span></div>
          </div>
          <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-3">
            <Stat label="Healthy range for your height" value={`${toDisplay(healthyMin)} – ${toDisplay(healthyMax)}`} />
            <Stat label={bmi > 24.9 ? 'To reach healthy range' : bmi < 18.5 ? 'To reach healthy range' : 'Room within range'} value={bmi > 24.9 ? `−${toDisplay(weightKg - healthyMax)}` : bmi < 18.5 ? `+${toDisplay(healthyMin - weightKg)}` : `${toDisplay(weightKg - healthyMin)} / ${toDisplay(healthyMax - weightKg)}`} />
            <Stat label="Resting energy (est.)" value={`${Math.round(bmr).toLocaleString()} kcal/day`} title="Mifflin–St Jeor equation" />
          </div>
          <Panel title="Categories (WHO, adults)">
            <ul className="divide-y text-sm">
              {BANDS.map((b, i) => (
                <li key={b.label} className={`flex justify-between px-4 py-1.5 ${b === band ? 'font-semibold' : ''}`}>
                  <span>{b.label}</span>
                  <span className="font-mono">{i === 0 ? `< ${b.max}` : b.max === Infinity ? `≥ ${BANDS[i - 1]!.max}` : `${BANDS[i - 1]!.max} – ${b.max}`}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Callout tone="info">BMI is a population-level screening number. It does not account for muscle mass, bone density, age, or ethnicity — talk to a clinician about what is healthy for you.</Callout>
        </div>
      </div>
    </ToolShell>
  );
}
