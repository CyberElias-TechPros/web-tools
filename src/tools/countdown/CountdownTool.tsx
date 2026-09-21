import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented, TextField } from '@/components/ui';
import { useLocalStorage } from '@/hooks';

type Mode = 'countdown' | 'timer' | 'stopwatch';

const nowMs = (): number => Date.now();

function pad(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function parts(ms: number): { d: number; h: number; m: number; s: number; cs: number } {
  const total = Math.max(0, ms);
  return { d: Math.floor(total / 86_400_000), h: Math.floor(total / 3_600_000) % 24, m: Math.floor(total / 60_000) % 60, s: Math.floor(total / 1000) % 60, cs: Math.floor(total / 10) % 100 };
}

function beep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    [0.15, 0.45, 0.75].forEach((t) => {
      gain.gain.setValueAtTime(0.3, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t + 0.12);
    });
    osc.stop(ctx.currentTime + 1);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable */
  }
}

export default function CountdownTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('countdown');
  const [now, setNow] = useState<number>(nowMs);

  // Countdown to a date
  const [target, setTarget] = useLocalStorage('countdown:target', '');
  const [label, setLabel] = useLocalStorage('countdown:label', '');

  // Timer
  const [minutes, setMinutes] = useLocalStorage('timer:minutes', '5');
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [timerLeft, setTimerLeft] = useState<number>(0); // remaining when paused
  const [rang, setRang] = useState(false);

  // Stopwatch
  const [swStart, setSwStart] = useState<number | null>(null);
  const [swAccum, setSwAccum] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), mode === 'stopwatch' ? 33 : 250);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (timerEnd !== null && now >= timerEnd && !rang) {
      const t = setTimeout(() => {
        setRang(true);
        setTimerEnd(null);
        setTimerLeft(0);
        beep();
      }, 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [now, timerEnd, rang]);

  const targetMs = useMemo(() => (target ? new Date(target).getTime() : NaN), [target]);
  const countdown = parts(targetMs - now);
  const passed = Number.isFinite(targetMs) && targetMs <= now;

  const timerRemaining = timerEnd !== null ? timerEnd - now : timerLeft;
  const tp = parts(timerRemaining);
  const swElapsed = swAccum + (swStart !== null ? now - swStart : 0);
  const sp = parts(swElapsed);

  const startTimer = (): void => {
    const ms = timerLeft > 0 ? timerLeft : Math.max(1, Number(minutes) || 0) * 60_000;
    setRang(false);
    setTimerEnd(Date.now() + ms);
  };
  const pauseTimer = (): void => {
    if (timerEnd !== null) setTimerLeft(Math.max(0, timerEnd - Date.now()));
    setTimerEnd(null);
  };
  const resetTimer = (): void => {
    setTimerEnd(null);
    setTimerLeft(0);
    setRang(false);
  };

  const digits = 'font-display text-5xl tabular-nums sm:text-7xl';

  return (
    <ToolShell slug="countdown-timer">
      <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'countdown', label: 'Countdown to a date' }, { value: 'timer', label: 'Timer' }, { value: 'stopwatch', label: 'Stopwatch' }]} />

      {mode === 'countdown' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Panel title="Event">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Date and time" type="datetime-local" value={target} onChange={setTarget} />
              <TextField label="Label (optional)" value={label} onChange={setLabel} placeholder="Launch day" />
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="chip hover:opacity-80" onClick={() => setTarget(`${new Date().getFullYear() + 1}-01-01T00:00`)}>New Year</button>
                <button type="button" className="chip hover:opacity-80" onClick={() => setTarget(`${new Date().getFullYear()}-12-25T00:00`)}>Christmas</button>
                <button type="button" className="chip hover:opacity-80" onClick={() => { const d = new Date(Date.now() + 7 * 86_400_000); d.setSeconds(0, 0); setTarget(toLocalInput(d)); }}>+1 week</button>
              </div>
            </div>
          </Panel>
          <div className="card flex flex-col items-center justify-center gap-4 p-8 text-center">
            {Number.isFinite(targetMs) ? (
              <>
                <p className="muted text-sm">{label || 'Time remaining'} · {new Date(targetMs).toLocaleString()}</p>
                {passed ? (
                  <p className="font-display text-4xl italic">It’s here.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-3 sm:gap-6" role="timer" aria-live="off">
                    {[
                      ['Days', countdown.d],
                      ['Hours', countdown.h],
                      ['Minutes', countdown.m],
                      ['Seconds', countdown.s],
                    ].map(([k, v]) => (
                      <div key={String(k)}>
                        <div className={digits}>{typeof v === 'number' && k === 'Days' ? v.toLocaleString() : pad(Number(v))}</div>
                        <div className="muted text-xs uppercase tracking-wide">{k}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted text-sm">Choose a date to count down to.</p>
            )}
          </div>
        </div>
      )}

      {mode === 'timer' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Panel title="Duration">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Minutes" value={minutes} onChange={setMinutes} mono disabled={timerEnd !== null || timerLeft > 0} />
              <div className="flex flex-wrap gap-1.5">
                {[1, 5, 10, 15, 25, 45, 60].map((m) => (
                  <button key={m} type="button" className="chip hover:opacity-80" onClick={() => { setMinutes(String(m)); resetTimer(); }}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <div className="card flex flex-col items-center justify-center gap-5 p-8 text-center">
            <div className={digits} role="timer" aria-live="off">
              {tp.d > 0 && `${tp.d}d `}
              {pad(tp.h)}:{pad(tp.m)}:{pad(tp.s)}
            </div>
            {rang && <Callout tone="success">Time’s up!</Callout>}
            <div className="flex gap-2">
              {timerEnd === null ? (
                <button type="button" className="btn btn-primary" onClick={startTimer}>
                  {timerLeft > 0 ? 'Resume' : 'Start'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={pauseTimer}>
                  Pause
                </button>
              )}
              <button type="button" className="btn" onClick={resetTimer}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'stopwatch' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(0,20rem)]">
          <div className="card flex flex-col items-center justify-center gap-5 p-8 text-center">
            <div className={digits} role="timer" aria-live="off">
              {sp.h > 0 && `${pad(sp.h)}:`}
              {pad(sp.m)}:{pad(sp.s)}<span className="text-2xl sm:text-4xl">.{pad(sp.cs)}</span>
            </div>
            <div className="flex gap-2">
              {swStart === null ? (
                <button type="button" className="btn btn-primary" onClick={() => setSwStart(Date.now())}>
                  {swAccum ? 'Resume' : 'Start'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => { setSwAccum(swElapsed); setSwStart(null); }}>
                  Pause
                </button>
              )}
              <button type="button" className="btn" onClick={() => setLaps((l) => [...l, swElapsed])} disabled={swStart === null}>
                Lap
              </button>
              <button type="button" className="btn" onClick={() => { setSwStart(null); setSwAccum(0); setLaps([]); }}>
                Reset
              </button>
            </div>
          </div>
          <Panel title="Laps">
            {laps.length ? (
              <ol className="divide-y font-mono text-sm">
                {laps.map((t, i) => {
                  const prev = laps[i - 1] ?? 0;
                  const lp = parts(t - prev);
                  const total = parts(t);
                  return (
                    <li key={t} className="flex justify-between px-4 py-2">
                      <span className="muted">Lap {i + 1}</span>
                      <span>{pad(lp.m)}:{pad(lp.s)}.{pad(lp.cs)}</span>
                      <span className="muted">{pad(total.m)}:{pad(total.s)}.{pad(total.cs)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted p-4 text-sm">Press Lap while running.</p>
            )}
          </Panel>
        </div>
      )}
    </ToolShell>
  );
}

function toLocalInput(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
