import { describe, expect, it } from 'vitest';
import { markdownToText, stripInline, textStats, defaultMarkdownOptions } from '@/lib/markdown';

const opts = defaultMarkdownOptions;

describe('stripInline', () => {
  it('removes bold, italic and combined emphasis', () => {
    expect(stripInline('**bold** and *italic* and ***both***', opts)).toBe(
      'bold and italic and both',
    );
    expect(stripInline('__bold__ and _italic_', opts)).toBe('bold and italic');
  });

  it('keeps link text and drops the URL by default', () => {
    expect(stripInline('See [the docs](https://example.com) now', opts)).toBe('See the docs now');
  });

  it('keeps the URL when asked', () => {
    expect(stripInline('[docs](https://example.com)', { ...opts, keepLinkUrls: true })).toBe(
      'docs (https://example.com)',
    );
  });

  it('handles links with titles', () => {
    expect(stripInline('[docs](https://example.com "Title")', opts)).toBe('docs');
  });

  it('keeps image alt text and drops empty alts', () => {
    expect(stripInline('![a diagram](/x.png)', opts)).toBe('a diagram');
    expect(stripInline('![](/x.png)', opts)).toBe('');
  });

  it('unwraps inline code without losing content', () => {
    expect(stripInline('run `npm test` first', opts)).toBe('run npm test first');
    expect(stripInline('``code with ` tick``', opts)).toBe('code with ` tick');
  });

  it('strips strikethrough and highlight', () => {
    expect(stripInline('~~gone~~ and ==marked==', opts)).toBe('gone and marked');
  });

  it('removes HTML tags but keeps their text', () => {
    expect(stripInline('<strong>bold</strong> text', opts)).toBe('bold text');
  });

  it('decodes common entities', () => {
    expect(stripInline('a &amp; b &lt;c&gt;', opts)).toBe('a & b <c>');
  });

  it('unescapes escaped punctuation', () => {
    expect(stripInline('literal \\*asterisks\\*', opts)).toBe('literal *asterisks*');
  });

  it('leaves plain text untouched', () => {
    expect(stripInline('nothing to do here', opts)).toBe('nothing to do here');
  });
});

describe('markdownToText', () => {
  it('returns an empty string for empty input', () => {
    expect(markdownToText('')).toBe('');
  });

  it('strips ATX headings', () => {
    expect(markdownToText('# Title\n\nBody').trim()).toBe('Title\n\nBody');
  });

  it('strips closed ATX headings', () => {
    expect(markdownToText('## Title ##').trim()).toBe('Title');
  });

  it('strips setext headings', () => {
    expect(markdownToText('Title\n=====\n\nBody').trim()).toBe('Title\n\nBody');
  });

  it('converts bullets to the chosen character', () => {
    const out = markdownToText('- one\n- two', { bulletChar: '•' });
    expect(out).toContain('• one');
    expect(out).toContain('• two');
  });

  it('renumbers ordered lists sequentially', () => {
    const out = markdownToText('1. a\n1. b\n1. c');
    expect(out.trim().split('\n')).toEqual(['1. a', '2. b', '3. c']);
  });

  it('handles nested list indentation', () => {
    const out = markdownToText('- top\n  - nested');
    expect(out).toContain('• top');
    expect(out).toContain('  • nested');
  });

  it('preserves task list checkboxes', () => {
    const out = markdownToText('- [x] done\n- [ ] todo');
    expect(out).toContain('[x] done');
    expect(out).toContain('[ ] todo');
  });

  it('removes list markers when asked', () => {
    const out = markdownToText('- one\n- two', { keepListMarkers: false });
    expect(out).not.toContain('•');
    expect(out.trim()).toBe('one\ntwo');
  });

  it('keeps fenced code content by default', () => {
    const out = markdownToText('```js\nconst x = 1;\n```');
    expect(out).toContain('const x = 1;');
    expect(out).not.toContain('```');
  });

  it('drops fenced code when asked', () => {
    const out = markdownToText('before\n\n```\nsecret\n```\n\nafter', { keepCodeBlocks: false });
    expect(out).not.toContain('secret');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('does not treat markdown inside a code fence as markdown', () => {
    const out = markdownToText('```\n# not a heading\n**not bold**\n```');
    expect(out).toContain('# not a heading');
    expect(out).toContain('**not bold**');
  });

  it('removes YAML front matter', () => {
    const out = markdownToText('---\ntitle: x\n---\n\nBody');
    expect(out.trim()).toBe('Body');
  });

  it('removes HTML comments', () => {
    expect(markdownToText('a <!-- hidden --> b').trim()).toBe('a  b');
  });

  it('removes link reference definitions', () => {
    const out = markdownToText('Text [ref].\n\n[ref]: https://example.com');
    expect(out).not.toContain('https://example.com');
  });

  it('strips blockquote markers', () => {
    expect(markdownToText('> quoted\n> more').trim()).toBe('quoted\nmore');
  });

  it('removes horizontal rules', () => {
    const out = markdownToText('a\n\n---\n\nb');
    expect(out).not.toContain('---');
  });

  it('aligns tables into columns', () => {
    const out = markdownToText('| a | bbbb |\n| - | ---- |\n| 1 | 2 |');
    expect(out).toContain('a');
    expect(out).not.toContain('|');
    expect(out).toContain('bbbb');
  });

  it('normalises smart punctuation', () => {
    const out = markdownToText('“quoted” — dash… ‘single’');
    expect(out).toContain('"quoted"');
    expect(out).toContain('- dash...');
    expect(out).toContain("'single'");
  });

  it('leaves smart punctuation alone when disabled', () => {
    const out = markdownToText('“quoted”', { normalizeUnicode: false });
    expect(out).toContain('“quoted”');
  });

  it('strips zero-width characters', () => {
    const out = markdownToText('a\u200Bb');
    expect(out.trim()).toBe('ab');
  });

  it('collapses excessive blank lines', () => {
    const out = markdownToText('a\n\n\n\n\nb');
    expect(out.trim()).toBe('a\n\nb');
  });

  it('unwraps paragraphs when asked', () => {
    const out = markdownToText('one\ntwo\nthree', { unwrapParagraphs: true });
    expect(out.trim()).toBe('one two three');
  });

  it('does not unwrap lists', () => {
    const out = markdownToText('- one\n- two', { unwrapParagraphs: true });
    expect(out.trim().split('\n')).toHaveLength(2);
  });

  it('normalises CRLF line endings', () => {
    expect(markdownToText('a\r\nb').trim()).toBe('a\nb');
  });

  it('converts <br> into a line break', () => {
    expect(markdownToText('a<br>b').trim()).toBe('a\nb');
  });

  it('is idempotent on already-clean text', () => {
    const clean = markdownToText('# Title\n\nSome body text.');
    expect(markdownToText(clean)).toBe(clean);
  });
});

describe('textStats', () => {
  it('counts an empty string as zero', () => {
    const stats = textStats('');
    expect(stats.words).toBe(0);
    expect(stats.characters).toBe(0);
    expect(stats.paragraphs).toBe(0);
  });

  it('counts words, characters and paragraphs', () => {
    const stats = textStats('one two three\n\nsecond paragraph');
    expect(stats.words).toBe(5);
    expect(stats.paragraphs).toBe(2);
    expect(stats.charactersNoSpaces).toBe('onetwothreesecondparagraph'.length);
  });

  it('reports at least one minute of reading time for any content', () => {
    expect(textStats('hi').readingTimeMinutes).toBe(1);
  });
});
