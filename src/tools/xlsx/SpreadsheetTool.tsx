import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, Segmented, SelectField, Stat, Toggle } from '@/components/ui';
import { DataTable, TextInput, TextOutput } from '@/components/TextIO';
import { Dropzone } from '@/components/Dropzone';
import { parseXlsx, sheetToObjects, sheetToRowsOfStrings, writeXlsx } from '@/lib/xlsx';
import type { Workbook } from '@/lib/xlsx';
import { parseCsv, inferValue } from '@/lib/csv';
import { downloadBlob, safeFilename } from '@/lib/files';
import { formatBytes } from '@/lib/image';

type Direction = 'from-xlsx' | 'to-xlsx';
type OutFormat = 'csv' | 'tsv' | 'json' | 'markdown';

function toCsv(rows: string[][], delimiter: string): string {
  const esc = (v: string): string => (/[",\n\r\t;|]/.test(v) || v.startsWith(' ') || v.endsWith(' ') ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(delimiter)).join('\n');
}

function toMarkdown(rows: string[][]): string {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string[] => [...r, ...Array.from({ length: width - r.length }, () => '')].map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' '));
  const [head, ...body] = rows;
  return [`| ${pad(head!).join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map((r) => `| ${pad(r).join(' | ')} |`)].join('\n');
}

const SAMPLE_CSV = `name,city,revenue,signed
Ada Lovelace,London,1200.5,2024-03-01
Grace Hopper,New York,980,2024-04-12
Tunde Bakare,Lagos,1430.75,2024-05-20`;

export default function SpreadsheetTool(): React.ReactElement {
  const [direction, setDirection] = useState<Direction>('from-xlsx');
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [format, setFormat] = useState<OutFormat>('csv');
  const [headerRow, setHeaderRow] = useState(true);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [sheetName, setSheetName] = useState('Sheet1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const wb = await parseXlsx(await f.arrayBuffer());
      setWorkbook(wb);
      setFile(f);
      setSheetIndex(0);
    } catch (e) {
      setWorkbook(null);
      setFile(null);
      setError(e instanceof Error ? e.message : 'Could not read this workbook.');
    } finally {
      setBusy(false);
    }
  };

  const sheet = workbook?.sheets[sheetIndex] ?? null;
  const rows = useMemo(() => (sheet ? sheetToRowsOfStrings(sheet) : []), [sheet]);

  const output = useMemo(() => {
    if (!sheet) return '';
    if (format === 'json') {
      if (headerRow) return JSON.stringify(sheetToObjects(sheet), null, 2);
      return JSON.stringify(sheet.rows, null, 2);
    }
    if (format === 'markdown') return toMarkdown(rows);
    return toCsv(rows, format === 'tsv' ? '\t' : ',');
  }, [sheet, rows, format, headerRow]);

  const csvTable = useMemo(() => {
    if (direction !== 'to-xlsx' || !csvText.trim()) return null;
    try {
      return parseCsv(csvText);
    } catch {
      return null;
    }
  }, [csvText, direction]);

  const buildXlsx = async (): Promise<void> => {
    if (!csvTable) return;
    setBusy(true);
    setError(null);
    try {
      const allRows: string[][] = [csvTable.header, ...csvTable.rows];
      const typed = allRows.map((r, i) => r.map((c) => (i === 0 && headerRow ? c : inferValue(c))));
      const blob = await writeXlsx([{ name: sheetName.trim() || 'Sheet1', rows: typed, header: headerRow }], { creator: 'Web Tools' });
      downloadBlob(blob, `${safeFilename(sheetName.trim() || 'sheet')}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const base = safeFilename(`${file?.name.replace(/\.xlsx$/i, '') ?? 'sheet'}${workbook && workbook.sheets.length > 1 && sheet ? `-${sheet.name}` : ''}`);
  const ext = format === 'markdown' ? 'md' : format;
  const cellCount = sheet ? sheet.rows.reduce((s, r) => s + r.filter((c) => c !== null && c !== '').length, 0) : 0;

  return (
    <ToolShell slug="spreadsheet-converter">
      <div className="flex flex-col gap-4">
        <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: 'from-xlsx', label: 'Excel → CSV / JSON' }, { value: 'to-xlsx', label: 'CSV → Excel' }]} />
        {direction === 'from-xlsx' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="flex flex-col gap-4">
              <Dropzone onFiles={onFiles} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" title={file ? file.name : 'Drop an .xlsx workbook'} description={file ? `${formatBytes(file.size)} · ${workbook?.sheets.length ?? 0} sheet${workbook?.sheets.length === 1 ? '' : 's'}` : 'Every sheet, with dates and formulas resolved to values'} compact={Boolean(file)} disabled={busy} />
              <Panel title="Output">
                <div className="flex flex-col gap-3 p-4">
                  {workbook && workbook.sheets.length > 1 && <SelectField label="Sheet" value={String(sheetIndex)} onChange={(v) => setSheetIndex(Number(v))} options={workbook.sheets.map((s, i) => ({ value: String(i), label: `${s.name} (${s.rows.length} rows)` }))} />}
                  <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'csv', label: 'CSV' }, { value: 'tsv', label: 'TSV' }, { value: 'json', label: 'JSON' }, { value: 'markdown', label: 'Markdown' }]} size="sm" />
                  {format === 'json' && <Toggle checked={headerRow} onChange={setHeaderRow} label="First row is a header" hint="On = array of objects keyed by header; off = array of arrays" />}
                </div>
              </Panel>
              {sheet && (
                <div className="card grid grid-cols-2 gap-2 p-3">
                  <Stat label="Rows" value={sheet.rows.length.toLocaleString()} />
                  <Stat label="Columns" value={String(Math.max(0, ...sheet.rows.map((r) => r.length)))} />
                  <Stat label="Cells" value={cellCount.toLocaleString()} />
                  <Stat label="Formulas" value={String(Object.keys(sheet.formulas).length)} />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {error && <Callout tone="error">{error}</Callout>}
              {workbook?.warnings.length ? <Callout tone="warning">{workbook.warnings.join(' ')}</Callout> : null}
              {sheet && rows.length > 0 && (
                <Panel title={`Preview · ${sheet.name}`} description={rows.length > 50 ? `First 50 of ${rows.length} rows` : undefined}>
                  <DataTable headers={(rows[0] ?? []).map((h, i) => h || `Column ${i + 1}`)} rows={rows.slice(1, 51)} maxHeight="18rem" />
                </Panel>
              )}
              <TextOutput value={output} label={`${format.toUpperCase()} output`} filename={`${base}.${ext}`} mime={format === 'json' ? 'application/json' : 'text/plain'} rows={16} fill wrap={false} />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <TextInput value={csvText} onChange={setCsvText} label="CSV or TSV input" sample={SAMPLE_CSV} rows={18} fill accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" placeholder="Paste CSV, or drop a file…" />
            <div className="flex flex-col gap-4">
              <Panel title="Workbook">
                <div className="flex flex-col gap-3 p-4">
                  <div>
                    <label className="label" htmlFor="xlsx-sheet-name">Sheet name</label>
                    <input id="xlsx-sheet-name" className="field mt-1 w-full" value={sheetName} onChange={(e) => setSheetName(e.target.value)} maxLength={31} />
                  </div>
                  <Toggle checked={headerRow} onChange={setHeaderRow} label="First row is a header" hint="Bold header row with a frozen pane" />
                  <p className="muted text-sm">Numbers, booleans and ISO dates are detected automatically so Excel treats them as real values, not text. The delimiter is auto-detected (comma, semicolon, tab or pipe).</p>
                  <button type="button" className="btn btn-primary" onClick={() => void buildXlsx()} disabled={!csvTable || busy}>
                    {busy ? 'Building…' : 'Download .xlsx'}
                  </button>
                </div>
              </Panel>
              {error && <Callout tone="error">{error}</Callout>}
              {csvTable && (
                <Panel title="Preview" description={`${csvTable.rows.length} row${csvTable.rows.length === 1 ? '' : 's'} · ${csvTable.header.length} column${csvTable.header.length === 1 ? '' : 's'}`}>
                  <DataTable headers={csvTable.header} rows={csvTable.rows.slice(0, 50)} maxHeight="20rem" />
                </Panel>
              )}
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
