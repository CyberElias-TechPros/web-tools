import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Segmented, SelectField, Stat, Toggle } from '@/components/ui';
import { OptionsBar, TextOutput } from '@/components/TextIO';
import { generateLorem } from '@/lib/lorem';
import type { LoremFlavor, LoremUnit } from '@/lib/lorem';
import { analyzeText } from '@/lib/readability';
import { useLocalStorage } from '@/hooks';

const FLAVORS: Array<{ value: LoremFlavor; label: string }> = [
  { value: 'lorem', label: 'Classic Lorem ipsum' },
  { value: 'english', label: 'Readable English' },
  { value: 'tech', label: 'Tech / startup' },
  { value: 'hipster', label: 'Hipster' },
  { value: 'legal', label: 'Legalese' },
];

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000);

export default function LoremTool(): React.ReactElement {
  const [flavor, setFlavor] = useLocalStorage<LoremFlavor>('lorem:flavor', 'lorem');
  const [unit, setUnit] = useLocalStorage<LoremUnit>('lorem:unit', 'paragraphs');
  const [count, setCount] = useLocalStorage('lorem:count', 3);
  const [classic, setClassic] = useLocalStorage('lorem:classic', true);
  const [html, setHtml] = useLocalStorage('lorem:html', false);
  const [seed, setSeed] = useState<number>(randomSeed);

  const text = useMemo(() => generateLorem({ flavor, unit, count, startWithClassic: classic && flavor === 'lorem', seed, html }), [flavor, unit, count, classic, seed, html]);
  const stats = useMemo(() => analyzeText(text.replace(/<[^>]+>/g, '')), [text]);

  return (
    <ToolShell slug="lorem-ipsum">
      <OptionsBar>
        <SelectField label="Flavour" value={flavor} onChange={setFlavor} options={FLAVORS} className="w-52" />
        <NumberField label="How many" value={count} onChange={setCount} min={1} max={500} className="w-28" />
        <Segmented label="Unit" value={unit} onChange={setUnit} options={[{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'sentences', label: 'Sentences' }, { value: 'words', label: 'Words' }]} size="sm" />
        {flavor === 'lorem' && <Toggle checked={classic} onChange={setClassic} label="Start with “Lorem ipsum dolor…”" />}
        <Toggle checked={html} onChange={setHtml} label="Wrap in <p> tags" />
        <button type="button" className="btn btn-sm" onClick={() => setSeed(randomSeed())}>
          Shuffle
        </button>
      </OptionsBar>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Words" value={stats.words} />
        <Stat label="Characters" value={stats.characters} />
        <Stat label="Sentences" value={stats.sentences} />
        <Stat label="Paragraphs" value={stats.paragraphs} />
      </div>
      <TextOutput value={text} label="Generated text" filename={html ? 'lorem.html' : 'lorem.txt'} rows={18} wrap />
      <p className="muted mt-3 text-xs">Output is deterministic per seed, so the same settings reproduce the same text until you shuffle.</p>
    </ToolShell>
  );
}
