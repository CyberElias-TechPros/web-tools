/**
 * XLSX (SpreadsheetML) reader and writer.
 *
 * Reading covers shared and inline strings, numbers, booleans, formulas (the
 * cached value is used), errors and dates (detected via number formats).
 * Writing produces a compact, Excel-compatible workbook with inline strings,
 * a bold header row, frozen header pane and auto-sized columns.
 */

import { readZip } from '@/lib/zip-reader';
import { createZip } from '@/lib/zip';

export type CellValue = string | number | boolean | null;

export interface Sheet {
  name: string;
  /** Rectangular grid; missing cells are null. */
  rows: CellValue[][];
  /** Original formulas by "A1" reference, when present. */
  formulas: Record<string, string>;
}

export interface Workbook {
  sheets: Sheet[];
  warnings: string[];
}

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function columnLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]{1,3})(\d+)$/i.exec(ref);
  if (!m) return null;
  return { col: columnIndex(m[1]!), row: Number(m[2]) - 1 };
}

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '');
  if (/[#0?]/.test(stripped) && !/[ymdhs]/i.test(stripped)) return false;
  return /(^|[^a-z])(y{2,4}|m{1,5}|d{1,4}|h{1,2}|s{1,2})([^a-z]|$)/i.test(stripped) && /[ymd]/i.test(stripped);
}

/** Excel serial → ISO string (date only when there is no time component). */
export function serialToIso(serial: number, date1904 = false): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  // Excel's fictional 29 Feb 1900 occupies serial 60: earlier serials are one day off.
  const adjusted = !date1904 && serial < 60 ? serial + 1 : serial;
  const ms = epoch + Math.round(adjusted * 86400000);
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const datePart = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const fraction = serial - Math.floor(serial);
  if (fraction < 1e-9) return datePart;
  return `${datePart} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function dateToSerial(date: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
  return (utc - epoch) / 86400000;
}

function parseXml(source: string, part: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror')[0]) throw new Error(`“${part}” is not well-formed XML.`);
  return doc;
}

function byLocalName(root: ParentNode, name: string): Element[] {
  const out: Element[] = [];
  const all = root.querySelectorAll('*');
  all.forEach((el) => {
    if (el.localName === name) out.push(el);
  });
  return out;
}

function firstChild(el: Element, name: string): Element | undefined {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Reader                                                                     */
/* -------------------------------------------------------------------------- */

export async function parseXlsx(input: ArrayBuffer | Uint8Array | Blob): Promise<Workbook> {
  const bytes =
    input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : input instanceof Uint8Array ? input : new Uint8Array(input);
  const zip = await readZip(bytes).catch((e: unknown) => {
    throw new Error(`Could not open the spreadsheet: ${e instanceof Error ? e.message : String(e)}`);
  });
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) throw new Error('This file is not an Excel workbook (.xlsx). Legacy .xls files are not supported.');
  const warnings: string[] = [];

  const workbookXml = parseXml(await zip.extractText(workbookEntry), 'xl/workbook.xml');
  const date1904 = byLocalName(workbookXml, 'workbookPr').some((el) => /^(1|true)$/.test(el.getAttribute('date1904') ?? ''));

  // Relationships: r:id → worksheet part.
  const relsEntry = zip.file('xl/_rels/workbook.xml.rels');
  const rels = new Map<string, string>();
  if (relsEntry) {
    const relsXml = parseXml(await zip.extractText(relsEntry), 'workbook.xml.rels');
    for (const rel of byLocalName(relsXml, 'Relationship')) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
    }
  }

  // Shared strings.
  const shared: string[] = [];
  const sstEntry = zip.file('xl/sharedStrings.xml');
  if (sstEntry) {
    const sst = parseXml(await zip.extractText(sstEntry), 'sharedStrings.xml');
    for (const si of Array.from(sst.documentElement.children)) {
      if (si.localName !== 'si') continue;
      let text = '';
      for (const t of byLocalName(si, 't')) {
        if (t.parentElement?.localName === 'rPh') continue; // phonetic guides
        text += t.textContent ?? '';
      }
      shared.push(text);
    }
  }

  // Styles → which xf indices are dates.
  const dateStyles = new Set<number>();
  const stylesEntry = zip.file('xl/styles.xml');
  if (stylesEntry) {
    const styles = parseXml(await zip.extractText(stylesEntry), 'styles.xml');
    const custom = new Map<number, string>();
    for (const fmt of byLocalName(styles, 'numFmt')) {
      const id = Number(fmt.getAttribute('numFmtId'));
      const code = fmt.getAttribute('formatCode') ?? '';
      if (Number.isFinite(id)) custom.set(id, code);
    }
    const cellXfs = byLocalName(styles, 'cellXfs')[0];
    if (cellXfs) {
      Array.from(cellXfs.children)
        .filter((el) => el.localName === 'xf')
        .forEach((xf, index) => {
          const id = Number(xf.getAttribute('numFmtId') ?? 0);
          const code = custom.get(id);
          if (DATE_FORMAT_IDS.has(id) || (code && isDateFormatCode(code))) dateStyles.add(index);
        });
    }
  }

  const sheets: Sheet[] = [];
  const sheetEls = byLocalName(workbookXml, 'sheet');
  let fallbackIndex = 0;
  for (const sheetEl of sheetEls) {
    fallbackIndex++;
    const name = sheetEl.getAttribute('name') ?? `Sheet${fallbackIndex}`;
    const rid = sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? sheetEl.getAttribute('r:id');
    const target = (rid && rels.get(rid)) || `xl/worksheets/sheet${fallbackIndex}.xml`;
    const entry = zip.file(target);
    if (!entry) {
      warnings.push(`Sheet “${name}” is missing its worksheet part and was skipped.`);
      continue;
    }
    const xml = parseXml(await zip.extractText(entry), target);
    const grid: CellValue[][] = [];
    const formulas: Record<string, string> = {};
    let maxCols = 0;
    const sheetData = byLocalName(xml, 'sheetData')[0];
    let rowCursor = 0;
    for (const row of sheetData ? Array.from(sheetData.children) : []) {
      if (row.localName !== 'row') continue;
      const r = Number(row.getAttribute('r'));
      const rowIndex = Number.isFinite(r) && r > 0 ? r - 1 : rowCursor;
      rowCursor = rowIndex + 1;
      const values: CellValue[] = [];
      let colCursor = 0;
      for (const c of Array.from(row.children)) {
        if (c.localName !== 'c') continue;
        const ref = c.getAttribute('r');
        const parsed = ref ? parseCellRef(ref) : null;
        const col = parsed ? parsed.col : colCursor;
        colCursor = col + 1;
        const type = c.getAttribute('t') ?? 'n';
        const styleIndex = Number(c.getAttribute('s') ?? -1);
        const v = firstChild(c, 'v');
        const f = firstChild(c, 'f');
        if (f?.textContent) formulas[`${columnLetters(col)}${rowIndex + 1}`] = `=${f.textContent}`;
        let value: CellValue;
        switch (type) {
          case 's': {
            const idx = Number(v?.textContent ?? -1);
            value = shared[idx] ?? '';
            break;
          }
          case 'inlineStr': {
            const is = firstChild(c, 'is');
            value = is ? byLocalName(is, 't').map((t) => t.textContent ?? '').join('') : '';
            break;
          }
          case 'str':
          case 'e':
            value = v?.textContent ?? '';
            break;
          case 'b':
            value = v?.textContent === '1';
            break;
          case 'd':
            value = v?.textContent ?? '';
            break;
          default: {
            const raw = v?.textContent;
            if (raw === undefined || raw === null || raw === '') {
              value = null;
            } else {
              const num = Number(raw);
              value = Number.isFinite(num) ? (dateStyles.has(styleIndex) ? serialToIso(num, date1904) : num) : raw;
            }
          }
        }
        while (values.length < col) values.push(null);
        values[col] = value;
      }
      while (grid.length < rowIndex) grid.push([]);
      grid[rowIndex] = values;
      maxCols = Math.max(maxCols, values.length);
    }
    // Trim trailing empty rows, square the grid.
    while (grid.length && (grid[grid.length - 1]?.every((v) => v === null || v === '') ?? true)) grid.pop();
    for (const r of grid) while (r.length < maxCols) r.push(null);
    sheets.push({ name, rows: grid, formulas });
  }
  if (!sheets.length) throw new Error('The workbook contains no readable sheets.');
  return { sheets, warnings };
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                */
/* -------------------------------------------------------------------------- */

export function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(15)));
  return value;
}

export function sheetToRowsOfStrings(sheet: Sheet): string[][] {
  return sheet.rows.map((row) => row.map(cellToString));
}

export function sheetToObjects(sheet: Sheet): Array<Record<string, CellValue>> {
  const [header, ...body] = sheet.rows;
  if (!header) return [];
  const keys = header.map((h, i) => (cellToString(h).trim() ? cellToString(h).trim() : `column_${i + 1}`));
  return body
    .filter((row) => row.some((v) => v !== null && v !== ''))
    .map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? null])));
}

/* -------------------------------------------------------------------------- */
/* Writer                                                                     */
/* -------------------------------------------------------------------------- */

export interface WriteSheet {
  name: string;
  rows: Array<Array<CellValue | Date | undefined>>;
  /** Treat the first row as a header: bold + frozen (default true). */
  header?: boolean;
}

export interface WriteOptions {
  creator?: string;
  title?: string;
  autoWidth?: boolean;
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are illegal in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  base = candidate;
  return base;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;

function cellXml(ref: string, value: CellValue | Date | undefined, isHeader: boolean): string {
  const styleAttr = isHeader ? ' s="2"' : '';
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `<c r="${ref}" s="1"><v>${dateToSerial(value)}</v></c>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${String(value)}</t></is></c>`;
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"${styleAttr}><v>${value ? 1 : 0}</v></c>`;
  const text = String(value);
  if (!isHeader && ISO_DATE.test(text)) {
    const date = new Date(text.length === 10 ? `${text}T00:00:00` : text.replace(' ', 'T'));
    if (!Number.isNaN(date.getTime())) return `<c r="${ref}" s="${text.length === 10 ? 1 : 3}"><v>${dateToSerial(date)}</v></c>`;
  }
  const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t${preserve}>${xmlEscape(text)}</t></is></c>`;
}

function sheetXml(sheet: WriteSheet, autoWidth: boolean): string {
  const header = sheet.header ?? true;
  const rowsXml: string[] = [];
  const widths: number[] = [];
  sheet.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((value, c) => {
      const ref = `${columnLetters(c)}${r + 1}`;
      const xml = cellXml(ref, value, header && r === 0);
      if (xml) cells.push(xml);
      const len = value instanceof Date ? 10 : cellToString(value ?? null).length;
      widths[c] = Math.max(widths[c] ?? 0, Math.min(60, len));
    });
    if (cells.length) rowsXml.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  const colsXml =
    autoWidth && widths.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.min(60, w + 2)).toFixed(2)}" customWidth="1"/>`).join('')}</cols>`
      : '';
  const lastCol = columnLetters(Math.max(0, widths.length - 1));
  const dimension = `A1:${lastCol}${Math.max(1, sheet.rows.length)}`;
  const pane = header && sheet.rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${rowsXml.join('')}</sheetData>${header && sheet.rows.length > 1 ? `<autoFilter ref="${dimension}"/>` : ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

export async function writeXlsx(sheets: WriteSheet[], options: WriteOptions = {}): Promise<Blob> {
  if (!sheets.length) throw new Error('Add at least one sheet.');
  const encoder = new TextEncoder();
  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: sanitizeSheetName(s.name, used) }));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const creator = xmlEscape(options.creator ?? 'Web Tools');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews><sheets>${named.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEFF4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(options.title ?? '')}</dc:title><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${creator}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Web Tools</Application></Properties>`;

  const entries = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'docProps/core.xml', data: encoder.encode(core) },
    { name: 'docProps/app.xml', data: encoder.encode(app) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(styles) },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encoder.encode(sheetXml(s, options.autoWidth ?? true)) })),
  ];
  const blob = await createZip(entries);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function looksLikeXlsx(file: { name: string; type: string }): boolean {
  return /\.(xlsx|xlsm)$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}
