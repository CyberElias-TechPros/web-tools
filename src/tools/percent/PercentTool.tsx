import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel } from '@/components/ui';
import { percentageChange } from '@/lib/finance';

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Number(n.toFixed(6)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function Row({ children, result }: { children: React.ReactNode; result: string }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-end gap-2 border-b px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-end gap-2 text-sm">{children}</div>
      <div className="ml-auto font-mono text-2xl font-semibold" style={{ color: 'var(--accent)' }} aria-live="polite">
        {result}
      </div>
    </div>
  );
}

export default function PercentTool(): React.ReactElement {
  const [a1, setA1] = useState(15);
  const [b1, setB1] = useState(240);
  const [a2, setA2] = useState(36);
  const [b2, setB2] = useState(240);
  const [a3, setA3] = useState(120);
  const [b3, setB3] = useState(150);
  const [a4, setA4] = useState(80);
  const [b4, setB4] = useState(25);
  const [a5, setA5] = useState(80);
  const [b5, setB5] = useState(25);
  const [a6, setA6] = useState(36);
  const [b6, setB6] = useState(15);

  const cls = 'w-28';

  return (
    <ToolShell slug="percentage-calculator">
      <Panel title="Six ways to ask">
        <Row result={fmt((a1 / 100) * b1)}>
          <span>What is</span>
          <NumberField label="Percent" value={a1} onChange={setA1} className={cls} suffix="%" />
          <span>of</span>
          <NumberField label="Number" value={b1} onChange={setB1} className={cls} />
          <span>?</span>
        </Row>
        <Row result={`${fmt((a2 / b2) * 100)}%`}>
          <NumberField label="Part" value={a2} onChange={setA2} className={cls} />
          <span>is what percent of</span>
          <NumberField label="Whole" value={b2} onChange={setB2} className={cls} />
          <span>?</span>
        </Row>
        <Row result={`${fmt(percentageChange(a3, b3))}%`}>
          <span>Change from</span>
          <NumberField label="From" value={a3} onChange={setA3} className={cls} />
          <span>to</span>
          <NumberField label="To" value={b3} onChange={setB3} className={cls} />
        </Row>
        <Row result={fmt(a4 * (1 + b4 / 100))}>
          <NumberField label="Number" value={a4} onChange={setA4} className={cls} />
          <span>increased by</span>
          <NumberField label="Percent increase" value={b4} onChange={setB4} className={cls} suffix="%" />
        </Row>
        <Row result={fmt(a5 * (1 - b5 / 100))}>
          <NumberField label="Number" value={a5} onChange={setA5} className={cls} />
          <span>decreased by</span>
          <NumberField label="Percent decrease" value={b5} onChange={setB5} className={cls} suffix="%" />
        </Row>
        <Row result={fmt(a6 / (b6 / 100))}>
          <NumberField label="Value" value={a6} onChange={setA6} className={cls} />
          <span>is</span>
          <NumberField label="Percent of what" value={b6} onChange={setB6} className={cls} suffix="%" />
          <span>of what number?</span>
        </Row>
      </Panel>
      <p className="muted mt-3 text-xs">Percentage points vs percent: going from 10% to 15% is +5 points but a +50% relative change.</p>
    </ToolShell>
  );
}
