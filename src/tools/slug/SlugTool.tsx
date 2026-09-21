import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Panel, Segmented, TextField, Toggle } from '@/components/ui';
import { HeroResult, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { slugify } from '@/lib/textcase';
import { useLocalStorage } from '@/hooks';

const STOP = new Set('a an the and or of to in on at for with by from is are be as it this that'.split(' '));

export default function SlugTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [separator, setSeparator] = useLocalStorage<'-' | '_' | '.'>('slug:sep', '-');
  const [lower, setLower] = useLocalStorage('slug:lower', true);
  const [stripStop, setStripStop] = useLocalStorage('slug:stop', false);
  const [maxLength, setMaxLength] = useLocalStorage('slug:max', 0);
  const [prefix, setPrefix] = useLocalStorage('slug:prefix', '');

  const lines = useMemo(() => input.split('\n').filter((l) => l.trim()), [input]);
  const slugs = useMemo(() => lines.map((l) => makeSlug(l, { separator, lower, stripStop, maxLength, prefix })), [lines, separator, lower, stripStop, maxLength, prefix]);
  const first = slugs[0] ?? '';

  return (
    <ToolShell slug="slug-generator">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented label="Separator" value={separator} onChange={setSeparator} options={[{ value: '-', label: 'hyphen -' }, { value: '_', label: 'underscore _' }, { value: '.', label: 'dot .' }]} size="sm" />
        <Toggle checked={lower} onChange={setLower} label="Lowercase" />
        <Toggle checked={stripStop} onChange={setStripStop} label="Drop stop words" hint="a, the, of, and…" />
        <NumberField label="Max length (0 = none)" value={maxLength} onChange={setMaxLength} min={0} max={200} className="w-40" />
        <TextField label="Prefix" value={prefix} onChange={setPrefix} mono placeholder="/blog/" className="w-40" />
      </div>
      {first && <HeroResult label={lines.length > 1 ? `First of ${lines.length} slugs` : 'Slug'} value={<span className="break-all text-xl sm:text-2xl">{first}</span>} copy={first} sub={`${first.length} characters`} className="mb-4" />}
      <Workspace>
        <TextInput value={input} onChange={setInput} label="Titles (one per line)" placeholder="Hello Wörld! Çà et là — Crème Brûlée & Co." sample={'10 Tips for Faster Builds in 2025\nCrème Brûlée: The Definitive Guide\nWhat’s new in React 19?'} rows={10} fill autoFocus />
        <TextOutput value={slugs.join('\n')} label="Slugs" filename="slugs.txt" rows={10} fill />
      </Workspace>
      <Panel title="How it works" className="mt-4">
        <p className="p-4 text-sm">Accents are stripped (é → e), symbols become separators, runs collapse to one, and leading/trailing separators are removed. Good for URLs, filenames, IDs and anchor links.</p>
      </Panel>
    </ToolShell>
  );
}

function makeSlug(line: string, { separator, lower, stripStop, maxLength, prefix }: { separator: string; lower: boolean; stripStop: boolean; maxLength: number; prefix: string }): string {
  let words = line.split(/\s+/);
  if (stripStop) {
    const kept = words.filter((w) => !STOP.has(w.toLowerCase()));
    if (kept.length) words = kept;
  }
  let slug = slugify(words.join(' '), separator);
  if (!lower) {
    // Re-apply original casing where the slug kept letters.
    const src = words.join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const out: string[] = [];
    let j = 0;
    for (const ch of slug) {
      while (j < src.length && src[j]!.toLowerCase() !== ch && ch !== separator) j++;
      out.push(j < src.length && ch !== separator ? src[j]! : ch);
      if (ch !== separator) j++;
    }
    slug = out.join('');
  }
  if (maxLength > 0 && slug.length > maxLength) {
    slug = slug.slice(0, maxLength);
    const cut = slug.lastIndexOf(separator);
    if (cut > maxLength * 0.5) slug = slug.slice(0, cut);
  }
  return prefix + slug;
}
