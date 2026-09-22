import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parseDocx, formatListNumber, looksLikeDocx } from '@/lib/docx';
import { documentToHtml, documentToMarkdown, documentToText } from '@/lib/richdoc-serialize';
import { renderPdf, toWinAnsi } from '@/lib/pdf-doc';
import { countImages, countWords } from '@/lib/richdoc';
import type { Paragraph } from '@/lib/richdoc';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(resolve(__dirname, '../test/fixtures', name)));

describe('parseDocx', () => {
  it('reads headings, runs, lists, tables, images and links from a real Word file', async () => {
    const doc = await parseDocx(fixture('sample.docx'));
    const paragraphs = doc.blocks.filter((b): b is Paragraph => b.kind === 'paragraph');

    expect(doc.meta.title).toBe('Fixture Document');
    expect(doc.meta.author).toBe('Web Tools Tests');

    const title = paragraphs.find((p) => p.style === 'title');
    expect(title && documentToText({ blocks: [title], meta: {}, warnings: [] }).trim()).toBe('Quarterly Report');

    const h1 = paragraphs.filter((p) => p.style === 'h1').map((p) => (p.runs[0] as { text: string }).text);
    expect(h1).toEqual(['Highlights', 'Appendix']);
    expect(paragraphs.some((p) => p.style === 'h2' && (p.runs[0] as { text: string }).text === 'Next steps')).toBe(true);

    const intro = paragraphs.find((p) => p.runs.some((r) => r.kind === 'text' && r.text === 'introduction'));
    expect(intro).toBeTruthy();
    const bold = intro!.runs.find((r) => r.kind === 'text' && r.text === 'introduction');
    expect(bold).toMatchObject({ bold: true });
    expect(intro!.runs.find((r) => r.kind === 'text' && r.text === 'italic text')).toMatchObject({ italic: true });
    expect(intro!.runs.find((r) => r.kind === 'text' && r.text === 'underlined words')).toMatchObject({ underline: true });

    const bullets = paragraphs.filter((p) => p.list && !p.list.ordered);
    expect(bullets.map((p) => (p.runs[0] as { text: string }).text)).toEqual([
      'Revenue grew 12%',
      'Churn fell to 2.1%',
      'Three new regions launched',
    ]);
    const numbered = paragraphs.filter((p) => p.list?.ordered);
    expect(numbered.map((p) => p.list!.marker)).toEqual(['1.', '2.', '3.']);

    const centred = paragraphs.find((p) => p.align === 'center');
    expect(centred).toBeTruthy();

    const coloured = paragraphs.flatMap((p) => p.runs).find((r) => r.kind === 'text' && r.color === 'C03030');
    expect(coloured).toMatchObject({ size: 16 });

    const table = doc.blocks.find((b) => b.kind === 'table');
    expect(table).toBeTruthy();
    if (table?.kind === 'table') {
      expect(table.rows).toHaveLength(3);
      expect(table.rows[0]!.cells).toHaveLength(3);
      expect(table.columnWidths).toEqual([2880, 2880, 2880]);
      const firstCell = table.rows[1]!.cells[0]!.blocks[0] as Paragraph;
      expect((firstCell.runs[0] as { text: string }).text).toBe('North');
    }

    expect(countImages(doc)).toBe(1);
    const image = doc.blocks.find((b) => b.kind === 'image');
    if (image?.kind === 'image') {
      expect(image.image.type).toBe('image/png');
      expect(Math.round(image.image.width)).toBe(144); // 2 inches
    }

    expect(doc.blocks.some((b) => b.kind === 'pageBreak')).toBe(true);

    const link = paragraphs.flatMap((p) => p.runs).find((r) => r.kind === 'text' && r.href);
    expect(link).toMatchObject({ text: 'our website', href: 'https://example.com/' });

    expect(countWords(doc)).toBeGreaterThan(80);
  });

  it('rejects files that are not Word documents', async () => {
    await expect(parseDocx(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not a ZIP/);
    await expect(parseDocx(fixture('sample.xlsx'))).rejects.toThrow(/not a Word document/);
  });

  it('formats list numbers', () => {
    expect(formatListNumber(3, 'lowerLetter')).toBe('c');
    expect(formatListNumber(27, 'upperLetter')).toBe('AA');
    expect(formatListNumber(4, 'lowerRoman')).toBe('iv');
    expect(formatListNumber(1999, 'upperRoman')).toBe('MCMXCIX');
    expect(formatListNumber(7, 'decimalZero')).toBe('07');
  });

  it('detects docx by name or MIME type', () => {
    expect(looksLikeDocx({ name: 'a.DOCX', type: '' })).toBe(true);
    expect(looksLikeDocx({ name: 'a.bin', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(true);
    expect(looksLikeDocx({ name: 'a.doc', type: 'application/msword' })).toBe(false);
  });
});

describe('serializers', () => {
  it('produces Markdown, HTML and text from the fixture', async () => {
    const doc = await parseDocx(fixture('sample.docx'));
    const md = documentToMarkdown(doc);
    expect(md).toContain('# Quarterly Report');
    expect(md).toContain('## Highlights');
    expect(md).toContain('**introduction**');
    expect(md).toContain('- Revenue grew 12%');
    expect(md).toContain('1. Hire two engineers');
    expect(md).toContain('| Region | Q1 | Q2 |');
    expect(md).toContain('[our website](https://example.com/)');

    const html = documentToHtml(doc, { fullDocument: true });
    expect(html).toContain('<h1>Quarterly Report</h1>');
    expect(html).toContain('<strong>introduction</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<table>');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('<a href="https://example.com/">');

    const text = documentToText(doc);
    expect(text).toContain('Quarterly Report');
    expect(text).toContain('• Revenue grew 12%');
    expect(text).toContain('Region\tQ1\tQ2');
  });
});

describe('renderPdf', () => {
  it('renders a multi-page PDF from a parsed DOCX with correct metadata', async () => {
    const doc = await parseDocx(fixture('sample.docx'));
    const result = await renderPdf([{ doc, name: 'sample.docx' }]);
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    expect(Array.from(result.bytes.subarray(0, 5)).map((b) => String.fromCharCode(b)).join('')).toBe('%PDF-');

    const reopened = await PDFDocument.load(result.bytes);
    expect(reopened.getPageCount()).toBe(result.pageCount);
    expect(reopened.getTitle()).toBe('Fixture Document');
    expect(reopened.getAuthor()).toBe('Web Tools Tests');
    expect(result.warnings.filter((w) => /character/.test(w))).toEqual([]);
  });

  it('combines several documents, starting each on a new page', async () => {
    const a = await parseDocx(fixture('sample.docx'));
    const b = await parseDocx(fixture('short.docx'));
    const single = await renderPdf([{ doc: a, name: 'a.docx' }]);
    const combined = await renderPdf([{ doc: a, name: 'a.docx' }, { doc: b, name: 'b.docx' }], { breakBetweenDocuments: true });
    expect(combined.pageCount).toBe(single.pageCount + 1);
    const flowed = await renderPdf([{ doc: b, name: 'b.docx' }, { doc: b, name: 'b.docx' }], { breakBetweenDocuments: false });
    expect(flowed.pageCount).toBe(1);
  });

  it('honours page size, orientation and page numbering options', async () => {
    const doc = await parseDocx(fixture('short.docx'));
    const letter = await renderPdf([{ doc }], { pageSize: 'Letter', orientation: 'landscape', pageNumbers: 'none' });
    const page = letter.pdf.getPage(0);
    expect(Math.round(page.getWidth())).toBe(792);
    expect(Math.round(page.getHeight())).toBe(612);
  });

  it('substitutes characters the standard fonts cannot draw and warns', async () => {
    const report = { replaced: 0, samples: [] as string[] };
    expect(toWinAnsi('café — “ok” → done', report)).toBe('café — “ok” -> done');
    expect(report.replaced).toBe(0);
    expect(toWinAnsi('中文 ż', report)).toBe('?? z');
    expect(report.replaced).toBe(2);

    const result = await renderPdf([
      { doc: { blocks: [{ kind: 'paragraph', style: 'normal', runs: [{ kind: 'text', text: 'Привет' }] }], meta: {}, warnings: [] } },
    ]);
    expect(result.warnings.some((w) => /outside the Latin range/.test(w))).toBe(true);
  });

  it('wraps very long words and tables without throwing', async () => {
    const long = 'x'.repeat(600);
    const result = await renderPdf([
      {
        doc: {
          blocks: [
            { kind: 'paragraph', style: 'normal', runs: [{ kind: 'text', text: long }] },
            {
              kind: 'table',
              rows: Array.from({ length: 80 }, (_, i) => ({
                cells: [
                  { blocks: [{ kind: 'paragraph' as const, style: 'normal' as const, runs: [{ kind: 'text' as const, text: `Row ${i}` }] }] },
                  { blocks: [{ kind: 'paragraph' as const, style: 'normal' as const, runs: [{ kind: 'text' as const, text: 'Some cell text that wraps a little bit' }] }] },
                ],
                header: i === 0,
              })),
            },
          ],
          meta: {},
          warnings: [],
        },
      },
    ]);
    expect(result.pageCount).toBeGreaterThan(1);
  });
});
