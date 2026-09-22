import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Segmented } from '@/components/ui';
import { DataTable, OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { decodeHtmlEntities, encodeHtmlEntities } from '@/lib/encoding';
import type { EntityMode } from '@/lib/encoding';

type Direction = 'encode' | 'decode';

const REFERENCE: Array<[string, string, string]> = [
  ['&amp;', '&', 'ampersand'],
  ['&lt;', '<', 'less-than'],
  ['&gt;', '>', 'greater-than'],
  ['&quot;', '"', 'double quote'],
  ['&#39;', "'", 'apostrophe (&apos; in XML/HTML5)'],
  ['&nbsp;', '\u00a0', 'non-breaking space'],
  ['&copy;', '©', 'copyright'],
  ['&reg;', '®', 'registered'],
  ['&trade;', '™', 'trademark'],
  ['&mdash;', '—', 'em dash'],
  ['&ndash;', '–', 'en dash'],
  ['&hellip;', '…', 'ellipsis'],
  ['&laquo;', '«', 'left guillemet'],
  ['&raquo;', '»', 'right guillemet'],
  ['&ldquo;', '“', 'left double quote'],
  ['&rdquo;', '”', 'right double quote'],
  ['&euro;', '€', 'euro'],
  ['&pound;', '£', 'pound'],
  ['&yen;', '¥', 'yen'],
  ['&deg;', '°', 'degree'],
  ['&times;', '×', 'multiplication'],
  ['&divide;', '÷', 'division'],
  ['&rarr;', '→', 'right arrow'],
  ['&larr;', '←', 'left arrow'],
  ['&hearts;', '♥', 'heart'],
  ['&check;', '✓', 'check mark'],
];

export default function EntitiesTool(): React.ReactElement {
  const [direction, setDirection] = useState<Direction>('encode');
  const [mode, setMode] = useState<EntityMode>('named');
  const [input, setInput] = useState('');

  const output = useMemo(() => {
    if (!input) return '';
    return direction === 'encode' ? encodeHtmlEntities(input, mode) : decodeHtmlEntities(input);
  }, [input, direction, mode]);

  return (
    <ToolShell slug="html-entities">
      <OptionsBar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
        {direction === 'encode' && (
          <Segmented
            label="Entity style"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'minimal', label: 'Minimal', title: 'Only & < > " \' — enough to be safe' },
              { value: 'named', label: 'Named', title: 'Named entities where they exist, e.g. &eacute;' },
              { value: 'numeric', label: 'Decimal', title: 'Numeric &#233; for every non-ASCII character' },
              { value: 'hex', label: 'Hex', title: '&#xE9; for every non-ASCII character' },
              { value: 'all-numeric', label: 'Everything', title: 'Encode every single character numerically' },
            ]}
          />
        )}
      </OptionsBar>

      <Workspace>
        <TextInput
          value={input}
          onChange={setInput}
          label={direction === 'encode' ? 'Text or code' : 'HTML with entities'}
          sample={direction === 'encode' ? '<a href="?a=1&b=2">Café “déjà vu” © 2024 — 5 > 3</a>' : '&lt;p&gt;Caf&eacute; &ldquo;d&eacute;j&agrave; vu&rdquo; &copy; 2024 &mdash; 5 &gt; 3&lt;/p&gt;'}
          placeholder={direction === 'encode' ? '<div class="x">Tom & Jerry</div>' : '&lt;div&gt;Tom &amp; Jerry&lt;/div&gt;'}
          rows={10}
          autoFocus
        />
        <TextOutput value={output} label={direction === 'encode' ? 'Encoded HTML' : 'Decoded text'} rows={10} fill filename={direction === 'encode' ? 'encoded.html' : 'decoded.txt'} />
      </Workspace>

      <section className="mt-8" aria-labelledby="entity-ref">
        <h2 id="entity-ref" className="mb-3 text-base font-semibold">
          Common entities
        </h2>
        <DataTable
          headers={['Entity', 'Character', 'Decimal', 'Hex', 'Name']}
          rows={REFERENCE.map(([entity, char, name]) => [
            <code key="e" className="font-mono">{entity}</code>,
            <span key="c" className="text-base">{char === '\u00a0' ? '␣' : char}</span>,
            <code key="d" className="font-mono">&#{char.codePointAt(0)};</code>,
            <code key="h" className="font-mono">&#x{char.codePointAt(0)!.toString(16).toUpperCase()};</code>,
            name,
          ])}
          maxHeight="24rem"
        />
      </section>
    </ToolShell>
  );
}
