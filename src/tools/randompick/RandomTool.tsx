import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, NumberField, Panel, Segmented, TextField, Toggle } from '@/components/ui';
import { HeroResult, TextInput } from '@/components/TextIO';
import { flipCoins, lotteryNumbers, pickMany, randomInts, rollDice, shuffleArray, splitTeams } from '@/lib/random';
import type { DiceRoll } from '@/lib/random';

type Mode = 'pick' | 'numbers' | 'dice' | 'coin' | 'teams' | 'lottery';

export default function RandomTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('pick');
  const [items, setItems] = useState('Alice\nBob\nChidi\nDiana\nEze\nFatima');
  const list = items.split('\n').map((s) => s.trim()).filter(Boolean);

  // pick
  const [pickCount, setPickCount] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [shuffled, setShuffled] = useState<string[]>([]);
  // numbers
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [numCount, setNumCount] = useState(1);
  const [unique, setUnique] = useState(true);
  const [numbers, setNumbers] = useState<number[]>([]);
  // dice
  const [notation, setNotation] = useState('2d6');
  const [roll, setRoll] = useState<DiceRoll | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  // coin
  const [coinCount, setCoinCount] = useState(1);
  const [coins, setCoins] = useState<Array<'heads' | 'tails'>>([]);
  // teams
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<string[][]>([]);
  // lottery
  const [lotto, setLotto] = useState<{ main: number[]; bonus: number[] } | null>(null);
  const [lottoPick, setLottoPick] = useState(6);
  const [lottoFrom, setLottoFrom] = useState(49);

  const doRoll = (): void => {
    try {
      setRoll(rollDice(notation));
      setRollError(null);
    } catch (e) {
      setRoll(null);
      setRollError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ToolShell slug="random-picker">
      <Segmented
        label="What to randomise"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'pick', label: 'Pick from a list' },
          { value: 'numbers', label: 'Numbers' },
          { value: 'dice', label: 'Dice' },
          { value: 'coin', label: 'Coin flip' },
          { value: 'teams', label: 'Teams' },
          { value: 'lottery', label: 'Lottery' },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {(mode === 'pick' || mode === 'teams') && (
          <TextInput value={items} onChange={setItems} label="Names or items, one per line" rows={12} footer={<span>{list.length} items</span>} />
        )}
        {mode === 'numbers' && (
          <Panel title="Range">
            <div className="grid grid-cols-2 gap-3 p-4">
              <NumberField label="Min" value={min} onChange={setMin} />
              <NumberField label="Max" value={max} onChange={setMax} />
              <NumberField label="How many" value={numCount} onChange={setNumCount} min={1} max={1000} />
              <Toggle checked={unique} onChange={setUnique} label="No repeats" />
            </div>
          </Panel>
        )}
        {mode === 'dice' && (
          <Panel title="Dice notation">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Notation" value={notation} onChange={setNotation} mono hint="e.g. d20, 2d6+3, 4d6kh3 (keep highest 3), 2d20kl1 (disadvantage)" invalid={Boolean(rollError)} />
              <div className="flex flex-wrap gap-1.5">
                {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6', '3d6', '4d6kh3', '2d20kh1', '2d20kl1'].map((n) => (
                  <button key={n} type="button" className="chip font-mono hover:opacity-80" onClick={() => setNotation(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        )}
        {mode === 'coin' && (
          <Panel title="Coins">
            <div className="p-4">
              <NumberField label="How many coins" value={coinCount} onChange={setCoinCount} min={1} max={500} />
            </div>
          </Panel>
        )}
        {mode === 'lottery' && (
          <Panel title="Draw">
            <div className="grid grid-cols-2 gap-3 p-4">
              <NumberField label="Pick" value={lottoPick} onChange={setLottoPick} min={1} max={20} />
              <NumberField label="From 1 to" value={lottoFrom} onChange={setLottoFrom} min={2} max={99} />
              <div className="col-span-2 flex flex-wrap gap-1.5">
                {[
                  ['6/49', 6, 49],
                  ['Powerball 5/69', 5, 69],
                  ['EuroMillions 5/50', 5, 50],
                  ['Mega Millions 5/70', 5, 70],
                ].map(([label, p, f]) => (
                  <button key={String(label)} type="button" className="chip hover:opacity-80" onClick={() => { setLottoPick(Number(p)); setLottoFrom(Number(f)); }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        )}

        <div className="flex flex-col gap-4">
          {mode === 'pick' && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <NumberField label="Pick how many" value={pickCount} onChange={setPickCount} min={1} max={Math.max(1, list.length)} className="w-32" />
                <button type="button" className="btn btn-primary" onClick={() => setPicked(pickMany(list, pickCount))} disabled={!list.length}>
                  Pick
                </button>
                <button type="button" className="btn" onClick={() => setShuffled(shuffleArray(list))} disabled={!list.length}>
                  Shuffle all
                </button>
              </div>
              {picked.length > 0 && <HeroResult label={picked.length === 1 ? 'The winner' : 'Picked'} value={picked.join(', ')} copy={picked.join('\n')} />}
              {shuffled.length > 0 && (
                <Panel title="Shuffled order">
                  <ol className="list-decimal space-y-0.5 py-3 pr-4 pl-10 text-sm">
                    {shuffled.map((s, i) => (
                      <li key={`${i}-${s}`}>{s}</li>
                    ))}
                  </ol>
                </Panel>
              )}
            </>
          )}
          {mode === 'numbers' && (
            <>
              <button type="button" className="btn btn-primary self-start" onClick={() => setNumbers(randomInts(numCount, Math.min(min, max), Math.max(min, max), unique))}>
                Generate
              </button>
              {unique && numCount > Math.abs(max - min) + 1 && <Callout tone="warning">Not enough distinct values in that range; duplicates will be allowed.</Callout>}
              {numbers.length > 0 && <HeroResult label={numbers.length === 1 ? 'Your number' : `${numbers.length} numbers`} value={<span className="break-words">{numbers.join(numbers.length > 20 ? ', ' : '   ')}</span>} copy={numbers.join('\n')} />}
            </>
          )}
          {mode === 'dice' && (
            <>
              <button type="button" className="btn btn-primary self-start" onClick={doRoll}>
                Roll {notation}
              </button>
              {rollError && <Callout tone="error">{rollError}</Callout>}
              {roll && (
                <HeroResult
                  label={`Rolled ${roll.notation}`}
                  value={roll.total}
                  sub={
                    <span className="font-mono">
                      {roll.rolls.map((r, i) => (
                        <span key={i}>
                          d{r.sides}: [{r.values.map((v, j) => (r.kept.includes(v) && r.kept.length !== r.values.length ? <strong key={j}>{v}</strong> : v)).reduce<React.ReactNode[]>((acc, cur, j) => (j ? [...acc, ', ', cur] : [cur]), [])}]{i < roll.rolls.length - 1 ? ' + ' : ''}
                        </span>
                      ))}
                      {roll.modifier ? ` ${roll.modifier > 0 ? '+' : '−'} ${Math.abs(roll.modifier)}` : ''}
                    </span>
                  }
                />
              )}
            </>
          )}
          {mode === 'coin' && (
            <>
              <button type="button" className="btn btn-primary self-start" onClick={() => setCoins(flipCoins(coinCount))}>
                Flip
              </button>
              {coins.length > 0 && (
                <HeroResult
                  label={coins.length === 1 ? 'Result' : `${coins.filter((c) => c === 'heads').length} heads, ${coins.filter((c) => c === 'tails').length} tails`}
                  value={coins.length === 1 ? (coins[0] === 'heads' ? 'Heads' : 'Tails') : <span className="text-2xl leading-relaxed break-words">{coins.map((c) => (c === 'heads' ? 'H' : 'T')).join(' ')}</span>}
                />
              )}
            </>
          )}
          {mode === 'teams' && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <NumberField label="Number of teams" value={teamCount} onChange={setTeamCount} min={2} max={Math.max(2, list.length)} className="w-32" />
                <button type="button" className="btn btn-primary" onClick={() => setTeams(splitTeams(list, teamCount))} disabled={list.length < 2}>
                  Split
                </button>
              </div>
              {teams.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {teams.map((t, i) => (
                    <Panel key={i} title={`Team ${i + 1}`} description={`${t.length} member${t.length === 1 ? '' : 's'}`}>
                      <ul className="space-y-0.5 p-3 text-sm">
                        {t.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </Panel>
                  ))}
                </div>
              )}
            </>
          )}
          {mode === 'lottery' && (
            <>
              <button type="button" className="btn btn-primary self-start" onClick={() => setLotto(lotteryNumbers(Math.min(lottoPick, lottoFrom), lottoFrom, { pick: 1, from: Math.min(26, lottoFrom) }))}>
                Draw
              </button>
              {lotto && (
                <HeroResult
                  label="Your numbers"
                  value={
                    <span className="flex flex-wrap gap-2">
                      {lotto.main.map((n) => (
                        <span key={n} className="flex h-12 w-12 items-center justify-center rounded-full border text-xl">
                          {n}
                        </span>
                      ))}
                      {lotto.bonus.map((n) => (
                        <span key={`b${n}`} className="flex h-12 w-12 items-center justify-center rounded-full text-xl" style={{ background: 'var(--accent)', color: 'var(--accent-fg, #111)' }}>
                          {n}
                        </span>
                      ))}
                    </span>
                  }
                  copy={[...lotto.main, ...lotto.bonus].join(' ')}
                  sub="Last ball is the bonus. Odds unaffected by any tool, sadly."
                />
              )}
            </>
          )}
          <p className="muted text-xs">All randomness comes from <code className="font-mono">crypto.getRandomValues</code>, so it is unbiased and unpredictable.</p>
        </div>
      </div>
    </ToolShell>
  );
}
