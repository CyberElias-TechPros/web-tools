import { describe, expect, it } from 'vitest';
import { parseHtmlDocument } from './html-import';
import { documentToMarkdown } from './richdoc-serialize';
import type { Paragraph } from './richdoc';

describe('parseHtmlDocument', () => {
  it('maps headings, paragraphs, formatting, lists, tables and rules', () => {
    const doc = parseHtmlDocument(`<!doctype html><html><head><title>Spec</title><meta name="author" content="Ada"><style>p{}</style></head><body>
      <h1>Title</h1>
      <p style="text-align:center">Hello <strong>bold</strong> and <em>italic</em> <a href="https://x.dev">link</a>.</p>
      <ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>
      <ol start="3"><li>three</li></ol>
      <blockquote>Quoted</blockquote>
      <pre><code class="language-js">const a = 1;\nconst b = 2;</code></pre>
      <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td colspan="2">2</td></tr></tbody></table>
      <hr>
      <script>alert(1)</script>
      <img src="https://example.com/x.png" alt="remote">
    </body></html>`);
    expect(doc.meta.title).toBe('Spec');
    expect(doc.meta.author).toBe('Ada');
    const kinds = doc.blocks.map((b) => (b.kind === 'paragraph' ? `${b.kind}:${b.style}${b.list ? `:list${b.list.level}` : ''}` : b.kind));
    expect(kinds).toEqual(['paragraph:h1', 'paragraph:normal', 'paragraph:normal:list0', 'paragraph:normal:list0', 'paragraph:normal:list1', 'paragraph:normal:list0', 'paragraph:quote', 'paragraph:code', 'table', 'rule']);
    const para = (i: number): Paragraph => {
      const b = doc.blocks[i];
      if (!b || b.kind !== 'paragraph') throw new Error(`block ${i} is not a paragraph`);
      return b;
    };
    expect(para(1).align).toBe('center');
    expect(para(1).runs.some((r) => r.kind === 'text' && r.bold && r.text === 'bold')).toBe(true);
    expect(para(1).runs.some((r) => r.kind === 'text' && r.href === 'https://x.dev')).toBe(true);
    expect(para(5).list?.ordered).toBe(true);
    expect(para(5).list?.index).toBe(3);
    expect(para(7).language).toBe('js');
    expect(para(7).runs.some((r) => r.kind === 'break')).toBe(true);
    const table = doc.blocks[8];
    if (!table || table.kind !== 'table') throw new Error('expected table');
    expect(table.rows[0]?.header).toBe(true);
    expect(table.rows[1]?.cells[1]?.colSpan).toBe(2);
    expect(doc.warnings.some((w) => /external images/i.test(w))).toBe(true);
    expect(documentToMarkdown(doc)).toContain('# Title');
  });

  it('embeds data: images and ignores scripts', () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const doc = parseHtmlDocument(`<p><img src="data:image/png;base64,${png}" alt="dot" width="100" height="50"></p><script>x()</script>`);
    const p = doc.blocks[0];
    if (!p || p.kind !== 'paragraph') throw new Error('expected paragraph');
    const img = p.runs.find((r) => r.kind === 'image');
    if (!img || img.kind !== 'image') throw new Error('expected image run');
    expect(img.image.type).toBe('image/png');
    expect(img.image.width).toBe(75);
  });
});
