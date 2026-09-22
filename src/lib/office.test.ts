import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { readZip, inflateRawSync } from '@/lib/zip-reader';
import { createZip } from '@/lib/zip';
import { cellToString, columnIndex, columnLetters, parseXlsx, serialToIso, sheetToObjects, writeXlsx } from '@/lib/xlsx';
import { parsePptx, presentationToRichDocument, presentationToText } from '@/lib/pptx';
import { parseMarkdown } from '@/lib/md-parse';
import { documentToHtml, documentToMarkdown } from '@/lib/richdoc-serialize';
import {
  describeIndices,
  extractPages,
  imagesToPdf,
  mergePdfs,
  numberPdfPages,
  organisePdf,
  parsePageRanges,
  readPdfMetadata,
  resavePdf,
  rotatePdf,
  splitPdf,
  watermarkPdf,
  writePdfMetadata,
} from '@/lib/pdf-ops';
import { renderPdf, textToRichDocument } from '@/lib/pdf-doc';
import type { Paragraph } from '@/lib/richdoc';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(resolve(__dirname, '../test/fixtures', name)));

describe('zip reader', () => {
  it('round-trips an archive written by zip.ts (deflate + store)', async () => {
    const encoder = new TextEncoder();
    const big = encoder.encode('lorem ipsum dolor sit amet '.repeat(400));
    const blob = await createZip([
      { name: 'small.txt', data: encoder.encode('hi') },
      { name: 'dir/big.txt', data: big },
    ]);
    const zip = await readZip(await blob.arrayBuffer());
    expect(zip.entries.map((e) => e.name)).toEqual(['small.txt', 'dir/big.txt']);
    expect(await zip.extractText('small.txt')).toBe('hi');
    const restored = await zip.extract('dir/big.txt');
    expect(restored.length).toBe(big.length);
    expect(new TextDecoder().decode(restored)).toBe(new TextDecoder().decode(big));
    expect(zip.file('/dir/big.txt')?.method).toBe(8);
  });

  it('inflates with the pure-JS fallback identically to the platform', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ text: 'compress me '.repeat(300), n: [1, 2, 3] }));
    const blob = await createZip([{ name: 'a.json', data }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zip = await readZip(bytes);
    const entry = zip.file('a.json')!;
    const view = new DataView(bytes.buffer);
    const nameLen = view.getUint16(entry.offset + 26, true);
    const extraLen = view.getUint16(entry.offset + 28, true);
    const start = entry.offset + 30 + nameLen + extraLen;
    const compressed = bytes.subarray(start, start + entry.compressedSize);
    const inflated = inflateRawSync(compressed, entry.uncompressedSize);
    expect(new TextDecoder().decode(inflated)).toBe(new TextDecoder().decode(data));
  });

  it('reads a real Office container and rejects non-archives', async () => {
    const zip = await readZip(fixture('sample.docx'));
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    await expect(readZip(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).rejects.toThrow(/not a ZIP/);
  });
});

describe('xlsx', () => {
  it('converts column references', () => {
    expect(columnIndex('A')).toBe(0);
    expect(columnIndex('Z')).toBe(25);
    expect(columnIndex('AA')).toBe(26);
    expect(columnLetters(0)).toBe('A');
    expect(columnLetters(27)).toBe('AB');
    expect(columnLetters(702)).toBe('AAA');
  });

  it('converts Excel serial dates', () => {
    expect(serialToIso(45352)).toBe('2024-03-01');
    expect(serialToIso(45352.5)).toBe('2024-03-01 12:00:00');
    expect(serialToIso(1)).toBe('1900-01-01');
  });

  it('reads a real workbook with strings, numbers, dates, booleans and formulas', async () => {
    const wb = await parseXlsx(fixture('sample.xlsx'));
    expect(wb.sheets.map((s) => s.name)).toEqual(['Sales', 'Notes']);
    const sales = wb.sheets[0]!;
    expect(sales.rows[0]).toEqual(['Region', 'Units', 'Price', 'Date', 'Active', 'Total']);
    expect(sales.rows[1]).toEqual(['North', 12, 9.99, '2024-03-01', true, null]);
    expect(sales.rows[2]![4]).toBe(false);
    expect(sales.formulas.F2).toBe('=B2*C2');
    const objects = sheetToObjects(sales);
    expect(objects[0]).toMatchObject({ Region: 'North', Units: 12, Active: true });
    const notes = wb.sheets[1]!;
    expect(notes.rows[1]![0]).toBe('Hello, "quoted" text');
    expect(notes.rows[2]![0]).toBe('Line1\nLine2');
    expect(cellToString(0.1 + 0.2)).toBe('0.3');
  });

  it('writes a workbook that it can read back', async () => {
    const blob = await writeXlsx([
      {
        name: 'Data',
        rows: [
          ['Name', 'Qty', 'Price', 'When', 'Ok'],
          ['Widget <&>', 3, 1.5, '2024-05-06', true],
          ['  spaced  ', 0, -2, new Date(2024, 0, 15), false],
        ],
      },
      { name: 'Bad/Name?', rows: [['x']] },
    ]);
    const wb = await parseXlsx(await blob.arrayBuffer());
    expect(wb.sheets.map((s) => s.name)).toEqual(['Data', 'Bad Name']);
    expect(wb.sheets[0]!.rows[0]).toEqual(['Name', 'Qty', 'Price', 'When', 'Ok']);
    expect(wb.sheets[0]!.rows[1]).toEqual(['Widget <&>', 3, 1.5, '2024-05-06', true]);
    expect(wb.sheets[0]!.rows[2]).toEqual(['  spaced  ', 0, -2, '2024-01-15', false]);
  });

  it('rejects non-workbooks', async () => {
    await expect(parseXlsx(fixture('sample.docx'))).rejects.toThrow(/not an Excel workbook/);
  });
});

describe('pptx', () => {
  it('extracts slide titles, bullets and notes in order', async () => {
    const pres = await parsePptx(fixture('sample.pptx'));
    expect(pres.slides).toHaveLength(2);
    expect(pres.slides[0]!.title).toBe('Deck Title');
    expect(pres.slides[0]!.paragraphs.map((p) => p.text)).toEqual(['Subtitle line']);
    expect(pres.slides[1]!.title).toBe('Agenda');
    expect(pres.slides[1]!.paragraphs.map((p) => p.text)).toEqual(['First point', 'Second point']);
    expect(pres.slides[1]!.notes).toBe('Speaker notes here');
    const text = presentationToText(pres);
    expect(text).toContain('--- Slide 2 ---');
    expect(text).toContain('Notes: Speaker notes here');
    const doc = presentationToRichDocument(pres);
    expect(doc.blocks.filter((b) => b.kind === 'pageBreak')).toHaveLength(1);
  });
});

describe('markdown parser', () => {
  it('parses block structure', () => {
    const doc = parseMarkdown(`---
title: Front Matter
---
# Heading

Setext
------

A paragraph with **bold**, *em*, \`code\`, ~~gone~~, [a link](https://x.y "t") and <https://auto.link>.

- one
- two
  - nested
    continued
- [x] done
- [ ] todo

1. first
2. second

> quoted **text**
> more

\`\`\`js
const a = 1;
\`\`\`

| A | B |
|:--|--:|
| 1 | 2 |

***

Line one  
Line two\\
Line three

<div style="page-break-after: always"></div>

Final &amp; entity &copy; &#169; done.`);
    expect(doc.meta.title).toBe('Front Matter');
    const paras = doc.blocks.filter((b): b is Paragraph => b.kind === 'paragraph');
    expect(paras[0]).toMatchObject({ style: 'h1' });
    expect(paras[1]).toMatchObject({ style: 'h2' });
    const rich = paras[2]!;
    expect(rich.runs.find((r) => r.kind === 'text' && r.text === 'bold')).toMatchObject({ bold: true });
    expect(rich.runs.find((r) => r.kind === 'text' && r.text === 'em')).toMatchObject({ italic: true });
    expect(rich.runs.find((r) => r.kind === 'text' && r.text === 'code')).toMatchObject({ code: true });
    expect(rich.runs.find((r) => r.kind === 'text' && r.text === 'gone')).toMatchObject({ strike: true });
    expect(rich.runs.find((r) => r.kind === 'text' && r.text === 'a link')).toMatchObject({ href: 'https://x.y' });
    expect(rich.runs.find((r) => r.kind === 'text' && r.text === 'https://auto.link')).toMatchObject({ href: 'https://auto.link' });

    const bullets = paras.filter((p) => p.list && !p.list.ordered);
    expect(bullets.map((p) => [(p.runs[0] as { text: string }).text, p.list!.level, p.list!.checked])).toEqual([
      ['one', 0, undefined],
      ['two', 0, undefined],
      ['nested continued', 1, undefined],
      ['done', 0, true],
      ['todo', 0, false],
    ]);
    const numbered = paras.filter((p) => p.list?.ordered);
    expect(numbered.map((p) => p.list!.index)).toEqual([1, 2]);
    expect(paras.find((p) => p.style === 'quote')).toBeTruthy();
    const code = paras.find((p) => p.style === 'code');
    expect(code).toMatchObject({ language: 'js' });
    expect((code!.runs[0] as { text: string }).text).toBe('const a = 1;');
    const table = doc.blocks.find((b) => b.kind === 'table');
    expect(table && table.kind === 'table' && table.rows[0]!.cells[1]!.align).toBe('right');
    expect(doc.blocks.filter((b) => b.kind === 'rule')).toHaveLength(1);
    expect(doc.blocks.filter((b) => b.kind === 'pageBreak')).toHaveLength(1);
    const breaks = paras.find((p) => p.runs.some((r) => r.kind === 'text' && r.text.startsWith('Line one')));
    expect(breaks!.runs.filter((r) => r.kind === 'break')).toHaveLength(2);
    const last = paras[paras.length - 1]!;
    expect((last.runs[0] as { text: string }).text).toBe('Final & entity © © done.');
  });

  it('round-trips through the serializers', () => {
    const doc = parseMarkdown('# Title\n\nSome *text* with `code`.\n\n- a\n- b\n');
    const md = documentToMarkdown(doc);
    expect(md).toContain('# Title');
    expect(md).toContain('*text*');
    expect(md).toContain('- a');
    const html = documentToHtml(doc);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<em>text</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul>\n<li>a</li>');
  });

  it('keeps snake_case words and lone asterisks as text', () => {
    const doc = parseMarkdown('use snake_case_names and 2 * 3 = 6 and a_b');
    const para = doc.blocks[0] as Paragraph;
    expect(para.runs).toHaveLength(1);
    expect((para.runs[0] as { text: string }).text).toBe('use snake_case_names and 2 * 3 = 6 and a_b');
  });
});

async function samplePdf(pages = 3): Promise<Uint8Array> {
  const doc = textToRichDocument(Array.from({ length: pages }, (_, i) => `Page ${i + 1} body text.`).join('\n\n'));
  doc.blocks = doc.blocks.flatMap((b, i) => (i < pages - 1 ? [b, { kind: 'pageBreak' as const }] : [b]));
  return (await renderPdf([{ doc }], { pageNumbers: 'none' })).bytes;
}

describe('pdf-ops', () => {
  it('parses page ranges', () => {
    expect(parsePageRanges('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9]);
    expect(parsePageRanges('all', 3)).toEqual([0, 1, 2]);
    expect(parsePageRanges('odd', 5)).toEqual([0, 2, 4]);
    expect(parsePageRanges('even', 5)).toEqual([1, 3]);
    expect(parsePageRanges('3-1', 5)).toEqual([2, 1, 0]);
    expect(parsePageRanges('last', 5)).toEqual([4]);
    expect(parsePageRanges('2-last', 5)).toEqual([1, 2, 3, 4]);
    expect(() => parsePageRanges('12', 10)).toThrow(/does not exist/);
    expect(() => parsePageRanges('a-b', 10)).toThrow(/not a valid page/);
    expect(() => parsePageRanges('0', 10)).toThrow(/start at 1/);
    expect(describeIndices([0, 1, 2, 4, 6, 7])).toBe('1-3, 5, 7-8');
  });

  it('merges documents with page selections', async () => {
    const a = await samplePdf(3);
    const b = await samplePdf(2);
    const merged = await mergePdfs([{ data: a }, { data: b, pages: [1] }], { title: 'Merged' });
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBe('Merged');
  });

  it('splits by page, by chunk and by ranges', async () => {
    const pdf = await samplePdf(5);
    const every = await splitPdf(pdf, { mode: 'every-page', baseName: 'doc.pdf' });
    expect(every.map((p) => p.name)).toEqual(['doc-page-1.pdf', 'doc-page-2.pdf', 'doc-page-3.pdf', 'doc-page-4.pdf', 'doc-page-5.pdf']);
    const chunks = await splitPdf(pdf, { mode: 'every-n', n: 2 });
    expect(chunks.map((c) => c.indices)).toEqual([[0, 1], [2, 3], [4]]);
    const ranges = await splitPdf(pdf, { mode: 'ranges', ranges: '1-2, 4-5' });
    expect(ranges).toHaveLength(2);
    expect((await PDFDocument.load(ranges[1]!.bytes)).getPageCount()).toBe(2);
    const extracted = await extractPages(pdf, [4, 0]);
    expect((await PDFDocument.load(extracted)).getPageCount()).toBe(2);
  });

  it('reorders, deletes and rotates pages', async () => {
    const pdf = await samplePdf(3);
    const out = await organisePdf(pdf, [
      { source: 2, rotate: 90 },
      { source: 0, rotate: 0 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    const rotated = await rotatePdf(pdf, 180, [1]);
    const rdoc = await PDFDocument.load(rotated);
    expect(rdoc.getPage(1).getRotation().angle).toBe(180);
    expect(rdoc.getPage(0).getRotation().angle).toBe(0);
  });

  it('stamps watermarks and page numbers without changing page count', async () => {
    const pdf = await samplePdf(2);
    const marked = await watermarkPdf(pdf, { text: 'DRAFT', position: 'tile' });
    expect((await PDFDocument.load(marked)).getPageCount()).toBe(2);
    const numbered = await numberPdfPages(pdf, { format: '{n}/{total}', position: 'top-right' });
    expect((await PDFDocument.load(numbered)).getPageCount()).toBe(2);
    await expect(watermarkPdf(pdf, { text: '   ' })).rejects.toThrow(/watermark text/i);
  });

  it('reads and writes metadata', async () => {
    const pdf = await samplePdf(1);
    const written = await writePdfMetadata(pdf, { title: 'New title', author: 'Someone', keywords: 'a, b' });
    const meta = await readPdfMetadata(written);
    expect(meta).toMatchObject({ title: 'New title', author: 'Someone', keywords: 'a, b', pageCount: 1 });
  });

  it('builds a PDF from images and re-saves losslessly', async () => {
    const png = fixture('tiny.png');
    const jpg = fixture('tiny.jpg');
    const out = await imagesToPdf(
      [
        { data: png, type: 'image/png' },
        { data: jpg, type: 'image/jpeg' },
      ],
      { pageMode: 'image-size', margin: 0 },
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(120); // 160px * 0.75
    const resaved = await resavePdf(out);
    expect((await PDFDocument.load(resaved)).getPageCount()).toBe(2);
  });
});
