import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Segmented, Stat, TextField, Toggle } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { formatXml, jsonToXml, minifyXml, parseXml, xmlStats, xmlToJson } from '@/lib/xml';
import { parseJson } from '@/lib/json';
import { useDebounced, useLocalStorage } from '@/hooks';

type Mode = 'format' | 'minify' | 'to-json' | 'from-json';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?><catalog xmlns:x="urn:example"><book id="bk101" lang="en"><author>Gambardella, Matthew</author><title>XML Developer's Guide</title><price currency="USD">44.95</price><tags><tag>computer</tag><tag>reference</tag></tags></book><book id="bk102"><author>Ralls, Kim</author><title>Midnight Rain</title><price currency="USD">5.95</price><!-- out of print --><available/></book></catalog>`;
const SAMPLE_JSON = `{"catalog":{"book":[{"@id":"bk101","author":"Gambardella, Matthew","title":"XML Developer's Guide","price":44.95},{"@id":"bk102","author":"Ralls, Kim","title":"Midnight Rain","price":5.95}]}}`;

export default function XmlTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('format');
  const [input, setInput] = useState('');
  const [indent, setIndent] = useLocalStorage<'2' | '4' | 'tab'>('xml:indent', '2');
  const [sortAttributes, setSortAttributes] = useLocalStorage('xml:sort', false);
  const [comments, setComments] = useLocalStorage('xml:comments', true);
  const [rootName, setRootName] = useLocalStorage('xml:root', 'root');
  const debounced = useDebounced(input, 120);

  const result = useMemo(() => {
    if (!debounced.trim()) return { output: '', error: null as string | null, stats: null as ReturnType<typeof xmlStats> | null };
    try {
      const indentStr = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
      if (mode === 'from-json') {
        const parsed = parseJson(debounced);
        if (!parsed.ok) return { output: '', error: `${parsed.error.message} (line ${parsed.error.line}, column ${parsed.error.column})`, stats: null };
        const xml = jsonToXml(parsed.value, { rootName: rootName.trim() || 'root', indent: indentStr });
        return { output: xml, error: null, stats: xmlStats(xml) };
      }
      parseXml(debounced); // throws with position on malformed input
      const stats = xmlStats(debounced);
      if (mode === 'minify') return { output: minifyXml(debounced, comments), error: null, stats };
      if (mode === 'to-json') return { output: JSON.stringify(xmlToJson(debounced), null, indentStr), error: null, stats };
      return { output: formatXml(debounced, { indent: indentStr, sortAttributes, preserveComments: comments }), error: null, stats };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : String(e), stats: null };
    }
  }, [debounced, mode, indent, sortAttributes, comments, rootName]);

  const outputName = mode === 'to-json' ? 'converted.json' : mode === 'minify' ? 'minified.xml' : 'formatted.xml';

  return (
    <ToolShell slug="xml-formatter">
      <OptionsBar>
        <Segmented
          label="Operation"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'format', label: 'Format' },
            { value: 'minify', label: 'Minify' },
            { value: 'to-json', label: 'XML → JSON' },
            { value: 'from-json', label: 'JSON → XML' },
          ]}
        />
        <Segmented size="sm" label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]} />
        {mode === 'format' && <Toggle checked={sortAttributes} onChange={setSortAttributes} label="Sort attributes" />}
        {(mode === 'format' || mode === 'minify') && <Toggle checked={comments} onChange={setComments} label="Keep comments" />}
        {mode === 'from-json' && <TextField label="Root element" value={rootName} onChange={setRootName} mono className="w-40" />}
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label={mode === 'from-json' ? 'JSON' : 'XML'} sample={mode === 'from-json' ? SAMPLE_JSON : SAMPLE_XML} accept=".xml,.json,.svg,.xsd,.plist,text/xml,application/json" rows={20} invalid={Boolean(result.error)} fill autoFocus />
        <div className="flex flex-col gap-3">
          {result.error && (
            <Callout tone="error" title="Not well-formed">
              {result.error}
            </Callout>
          )}
          {result.stats && (
            <div className="card grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-5">
              <Stat label="Elements" value={result.stats.elements} />
              <Stat label="Attributes" value={result.stats.attributes} />
              <Stat label="Depth" value={result.stats.depth} />
              <Stat label="Text nodes" value={result.stats.textNodes} />
              <Stat label="Comments" value={result.stats.comments} />
            </div>
          )}
          <TextOutput value={result.output} label="Output" filename={outputName} mime={mode === 'to-json' ? 'application/json' : 'application/xml'} rows={20} fill />
        </div>
      </Workspace>
      {mode === 'to-json' && (
        <p className="muted mt-3 text-xs">
          Attributes become <code className="font-mono">@name</code> keys, mixed text becomes <code className="font-mono">#text</code>, repeated siblings become arrays and numeric text is parsed as numbers.
        </p>
      )}
    </ToolShell>
  );
}
