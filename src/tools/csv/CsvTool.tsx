import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Download, FileUp, Table2, Trash2, Wand2 } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  EmptyState,
  FieldGroup,
  Panel,
  Segmented,
  Stat,
  Toasts,
  Toggle,
  useToasts,
} from '@/components/ui';
import {
  csvTableToObjects,
  defaultCsvOptions,
  inferColumnTypes,
  jsonToTable,
  parseCsv,
  tableToCsv,
} from '@/lib/csv';
import type { CsvParseOptions, Delimiter, JsonToCsvOptions } from '@/lib/csv';
import { parseJson } from '@/lib/json';
import { downloadText, readFileAsText } from '@/lib/files';
import { useDebounced, useDropZone, useLocalStorage } from '@/hooks';

type Direction = 'csv-to-json' | 'json-to-csv';

const SAMPLE_CSV = `id,name,email,department,salary,active,start_date,notes
1,Ada Lovelace,ada@example.com,Engineering,145000,true,2019-03-14,"Works on ""analytical"" systems"
2,Grace Hopper,grace@example.com,Engineering,152000,true,2018-11-02,"Compilers, debugging"
3,Katherine Johnson,katherine@example.com,Research,138000,false,2020-06-30,
4,Radia Perlman,radia@example.com,Networking,149500,true,2021-01-11,"Spanning tree
inventor"`;

const SAMPLE_JSON = `[
  {
    "id": 1,
    "name": "Ada Lovelace",
    "contact": { "email": "ada@example.com", "phone": "+44 20 7946 0958" },
    "skills": ["algorithms", "mathematics"],
    "active": true
  },
  {
    "id": 2,
    "name": "Grace Hopper",
    "contact": { "email": "grace@example.com", "phone": "+1 202 555 0143" },
    "skills": ["compilers", "cobol"],
    "active": true
  }
]`;

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ',': 'Comma',
  ';': 'Semicolon',
  '\t': 'Tab',
  '|': 'Pipe',
};

export default function CsvTool(): React.ReactElement {
  const [direction, setDirection] = useLocalStorage<Direction>('wt:csv:direction', 'csv-to-json');
  const [input, setInput] = useState('');
  const [csvOptions, setCsvOptions] = useLocalStorage<CsvParseOptions>(
    'wt:csv:parse',
    defaultCsvOptions,
  );
  const [outputOptions, setOutputOptions] = useLocalStorage<{
    indent: number;
    expandDotPaths: boolean;
    omitEmpty: boolean;
    ndjson: boolean;
  }>('wt:csv:output', { indent: 2, expandDotPaths: false, omitEmpty: false, ndjson: false });
  const [csvOut, setCsvOut] = useLocalStorage<Pick<JsonToCsvOptions, 'delimiter' | 'flatten' | 'escapeFormulas' | 'quoteAll' | 'includeHeader'>>(
    'wt:csv:emit',
    { delimiter: ',', flatten: true, escapeFormulas: true, quoteAll: false, includeHeader: true },
  );
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const debounced = useDebounced(input, 180);

  const csvResult = useMemo(() => {
    if (direction !== 'csv-to-json' || !debounced.trim()) return null;
    return parseCsv(debounced, csvOptions);
  }, [direction, debounced, csvOptions]);

  const columnTypes = useMemo(
    () => (csvResult ? inferColumnTypes(csvResult) : []),
    [csvResult],
  );

  const jsonParse = useMemo(() => {
    if (direction !== 'json-to-csv' || !debounced.trim()) return null;
    return parseJson(debounced);
  }, [direction, debounced]);

  const output = useMemo(() => {
    try {
      if (direction === 'csv-to-json') {
        if (!csvResult) return '';
        const objects = csvTableToObjects(csvResult, {
          inferTypes: csvOptions.inferTypes,
          expandDotPaths: outputOptions.expandDotPaths,
          omitEmpty: outputOptions.omitEmpty,
        });
        if (outputOptions.ndjson) return objects.map((o) => JSON.stringify(o)).join('\n');
        return JSON.stringify(objects, null, outputOptions.indent);
      }
      if (!jsonParse?.ok) return '';
      const table = jsonToTable(jsonParse.value, csvOut);
      return tableToCsv(table.header, table.rows, csvOut);
    } catch (e) {
      return `Conversion failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [direction, csvResult, csvOptions.inferTypes, outputOptions, jsonParse, csvOut]);

  const previewTable = useMemo(() => {
    if (direction === 'csv-to-json') {
      return csvResult ? { header: csvResult.header, rows: csvResult.rows } : null;
    }
    if (!jsonParse?.ok) return null;
    return jsonToTable(jsonParse.value, csvOut);
  }, [direction, csvResult, jsonParse, csvOut]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      try {
        const text = await readFileAsText(file);
        setInput(text);
        // Switch direction automatically to match what was dropped.
        const isJson = /\.(json|ndjson|jsonl)$/i.test(file.name) || text.trim().startsWith('[') || text.trim().startsWith('{');
        setDirection(isJson ? 'json-to-csv' : 'csv-to-json');
        push(`Loaded “${file.name}”.`, 'success');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [push, setDirection],
  );

  const { dragging, handlers } = useDropZone(handleFiles);

  const swapDirection = (): void => {
    // Feed the current output back in as the new input.
    if (output && !output.startsWith('Conversion failed')) {
      setInput(output);
      setDirection(direction === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json');
    } else {
      setDirection(direction === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json');
      setInput('');
    }
  };

  const outputExtension = direction === 'csv-to-json' ? (outputOptions.ndjson ? 'ndjson' : 'json') : 'csv';
  const outputMime = direction === 'csv-to-json' ? 'application/json' : 'text/csv';

  return (
    <ToolShell
      slug="csv-json"
      wide
      actions={
        <>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setInput(direction === 'csv-to-json' ? SAMPLE_CSV : SAMPLE_JSON)}
          >
            <Wand2 size={14} aria-hidden />
            Sample
          </button>
          <button type="button" className="btn btn-sm" onClick={swapDirection}>
            <ArrowLeftRight size={14} aria-hidden />
            Reverse
          </button>
        </>
      }
    >
      <div className="mb-4">
        <Segmented
          label="Conversion direction"
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setInput('');
          }}
          options={[
            { value: 'csv-to-json', label: 'CSV → JSON' },
            { value: 'json-to-csv', label: 'JSON → CSV' },
          ]}
        />
      </div>

      {error && (
        <Callout tone="error" className="mb-3" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_260px]">
        <Panel
          title={direction === 'csv-to-json' ? 'CSV input' : 'JSON input'}
          actions={
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl,text/csv,application/json"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  void handleFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>
                <FileUp size={14} aria-hidden />
                Open
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setInput('')}
                disabled={!input}
                aria-label="Clear"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </>
          }
          bodyClassName="flex flex-col"
        >
          <div className="relative flex-1" {...handlers}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                direction === 'csv-to-json'
                  ? 'Paste CSV, TSV or semicolon-separated data — quoted fields and embedded newlines are handled.'
                  : 'Paste a JSON array of objects, or a single object.'
              }
              spellCheck={false}
              aria-label={direction === 'csv-to-json' ? 'CSV input' : 'JSON input'}
              className="code-area h-[42vh] min-h-52 w-full resize-y bg-transparent p-3 outline-none"
            />
            {dragging && (
              <div
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed text-sm font-medium"
                style={{
                  borderColor: 'var(--accent)',
                  background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                }}
              >
                Drop a .csv or .json file
              </div>
            )}
          </div>

          {jsonParse && !jsonParse.ok && (
            <div className="border-t p-3">
              <Callout tone="error" title={`Line ${jsonParse.error.line}, column ${jsonParse.error.column}`}>
                {jsonParse.error.message}
              </Callout>
            </div>
          )}
          {csvResult && csvResult.warnings.length > 0 && (
            <div className="border-t p-3">
              <Callout tone="warning" title={`${csvResult.warnings.length} parsing warning${csvResult.warnings.length === 1 ? '' : 's'}`}>
                <ul className="list-disc space-y-0.5 pl-4">
                  {csvResult.warnings.slice(0, 5).map((warning, index) => (
                    <li key={index}>
                      Row {warning.row}: {warning.message}
                    </li>
                  ))}
                  {csvResult.warnings.length > 5 && <li>…and {csvResult.warnings.length - 5} more.</li>}
                </ul>
              </Callout>
            </div>
          )}
        </Panel>

        <Panel
          title={direction === 'csv-to-json' ? 'JSON output' : 'CSV output'}
          actions={
            <>
              <CopyButton value={output} small />
              <button
                type="button"
                className="btn btn-sm"
                disabled={!output}
                onClick={() => downloadText(output, `converted.${outputExtension}`, outputMime)}
              >
                <Download size={14} aria-hidden />
                <span className="hidden sm:inline">Download</span>
              </button>
            </>
          }
          bodyClassName="flex flex-col"
        >
          <textarea
            value={output}
            readOnly
            aria-label="Converted output"
            placeholder="The converted result appears here."
            spellCheck={false}
            className="code-area h-[42vh] min-h-52 w-full flex-1 resize-y bg-transparent p-3 outline-none"
          />
        </Panel>

        <Panel title="Options" bodyClassName="space-y-4 p-4">
          {direction === 'csv-to-json' ? (
            <>
              <FieldGroup
                label="Delimiter"
                hint={
                  csvResult
                    ? `Detected: ${DELIMITER_LABELS[csvResult.delimiter]}`
                    : 'Auto-detected from the data.'
                }
              >
                <Segmented
                  size="sm"
                  value={csvOptions.delimiter}
                  onChange={(v) => setCsvOptions((p) => ({ ...p, delimiter: v }))}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: ',', label: ',' },
                    { value: ';', label: ';' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: '|' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup label="Parsing">
                <div className="space-y-2.5">
                  <Toggle
                    checked={csvOptions.hasHeader}
                    onChange={(v) => setCsvOptions((p) => ({ ...p, hasHeader: v }))}
                    label="First row is a header"
                  />
                  <Toggle
                    checked={csvOptions.trimFields}
                    onChange={(v) => setCsvOptions((p) => ({ ...p, trimFields: v }))}
                    label="Trim unquoted fields"
                  />
                  <Toggle
                    checked={csvOptions.skipEmptyLines}
                    onChange={(v) => setCsvOptions((p) => ({ ...p, skipEmptyLines: v }))}
                    label="Skip empty lines"
                  />
                  <Toggle
                    checked={csvOptions.inferTypes}
                    onChange={(v) => setCsvOptions((p) => ({ ...p, inferTypes: v }))}
                    label="Infer types"
                    hint="123 → number, true → boolean. Leading zeros are kept as strings so zip codes survive."
                  />
                </div>
              </FieldGroup>

              <FieldGroup label="JSON output">
                <div className="space-y-2.5">
                  <Toggle
                    checked={outputOptions.expandDotPaths}
                    onChange={(v) => setOutputOptions((p) => ({ ...p, expandDotPaths: v }))}
                    label="Expand dotted headers"
                    hint="A column named contact.email becomes a nested object."
                  />
                  <Toggle
                    checked={outputOptions.omitEmpty}
                    onChange={(v) => setOutputOptions((p) => ({ ...p, omitEmpty: v }))}
                    label="Omit empty cells"
                  />
                  <Toggle
                    checked={outputOptions.ndjson}
                    onChange={(v) => setOutputOptions((p) => ({ ...p, ndjson: v }))}
                    label="Newline-delimited (NDJSON)"
                    hint="One object per line, for streaming and log pipelines."
                  />
                </div>
              </FieldGroup>

              {!outputOptions.ndjson && (
                <FieldGroup label="Indent">
                  <Segmented
                    size="sm"
                    value={String(outputOptions.indent)}
                    onChange={(v) => setOutputOptions((p) => ({ ...p, indent: Number(v) }))}
                    options={[
                      { value: '0', label: 'Min' },
                      { value: '2', label: '2' },
                      { value: '4', label: '4' },
                    ]}
                  />
                </FieldGroup>
              )}
            </>
          ) : (
            <>
              <FieldGroup label="Delimiter">
                <Segmented
                  size="sm"
                  value={csvOut.delimiter}
                  onChange={(v) => setCsvOut((p) => ({ ...p, delimiter: v }))}
                  options={[
                    { value: ',', label: ',' },
                    { value: ';', label: ';' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: '|' },
                  ]}
                />
              </FieldGroup>
              <FieldGroup label="Output">
                <div className="space-y-2.5">
                  <Toggle
                    checked={csvOut.includeHeader}
                    onChange={(v) => setCsvOut((p) => ({ ...p, includeHeader: v }))}
                    label="Include a header row"
                  />
                  <Toggle
                    checked={csvOut.flatten}
                    onChange={(v) => setCsvOut((p) => ({ ...p, flatten: v }))}
                    label="Flatten nested objects"
                    hint="contact.email becomes its own column instead of a JSON blob."
                  />
                  <Toggle
                    checked={csvOut.quoteAll}
                    onChange={(v) => setCsvOut((p) => ({ ...p, quoteAll: v }))}
                    label="Quote every field"
                  />
                  <Toggle
                    checked={csvOut.escapeFormulas}
                    onChange={(v) => setCsvOut((p) => ({ ...p, escapeFormulas: v }))}
                    label="Neutralise spreadsheet formulas"
                    hint="Prefixes cells starting with = + - @ so Excel treats them as text. Leave this on."
                  />
                </div>
              </FieldGroup>
              {!csvOut.escapeFormulas && (
                <Callout tone="warning">
                  A cell beginning with “=” will be executed as a formula when the file is opened in
                  Excel or Sheets. That is a real attack vector if this data came from users.
                </Callout>
              )}
            </>
          )}
        </Panel>
      </div>

      {previewTable && previewTable.rows.length > 0 && (
        <>
          <div className="card mt-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <Stat label="Rows" value={previewTable.rows.length.toLocaleString()} />
            <Stat label="Columns" value={previewTable.header.length} />
            <Stat label="Cells" value={(previewTable.rows.length * previewTable.header.length).toLocaleString()} />
            <Stat label="Output size" value={`${(new TextEncoder().encode(output).length / 1024).toFixed(1)} KB`} />
          </div>

          <Panel
            title="Table preview"
            description={`Showing the first ${Math.min(50, previewTable.rows.length)} of ${previewTable.rows.length.toLocaleString()} rows`}
            className="mt-4"
            bodyClassName="overflow-auto"
          >
            <table className="w-full text-left text-xs">
              <thead className="surface-3 sticky top-0">
                <tr>
                  <th className="muted px-2 py-1.5 font-semibold">#</th>
                  {previewTable.header.map((column, index) => (
                    <th key={`${column}-${index}`} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                      {column}
                      {columnTypes[index] && (
                        <span className="muted ml-1.5 font-normal">{columnTypes[index]}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {previewTable.rows.slice(0, 50).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t">
                    <td className="muted px-2 py-1 tabular-nums">{rowIndex + 1}</td>
                    {previewTable.header.map((_, colIndex) => (
                      <td key={colIndex} className="max-w-[22ch] truncate px-2 py-1" title={row[colIndex] ?? ''}>
                        {row[colIndex] === '' ? <span className="muted italic">empty</span> : row[colIndex]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {!input.trim() && (
        <Panel className="mt-4">
          <EmptyState
            icon={<Table2 size={30} />}
            title="Paste, or drop a file anywhere on the input panel"
            description="Quoted commas, embedded newlines, doubled quotes, ragged rows and BOM-prefixed exports from Excel are all handled correctly."
          />
        </Panel>
      )}

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}
