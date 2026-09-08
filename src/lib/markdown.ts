/**
 * Markdown -> clean text.
 *
 * The goal is not to render Markdown, it is to *strip* it: produce the text a
 * human meant to write, so it can be pasted into an email, a CMS, a document or
 * a plain-text field without formatting artefacts following it around.
 *
 * Implemented as a small line-oriented pass (block constructs) followed by an
 * inline pass, which is dramatically more predictable than a chain of regexes
 * over the whole document.
 */

export interface MarkdownCleanOptions {
  /** Keep list bullets/numbers as literal text instead of removing them. */
  keepListMarkers: boolean;
  /** Bullet character used when list markers are kept. */
  bulletChar: string;
  /** Render `[text](url)` as `text (url)` instead of just `text`. */
  keepLinkUrls: boolean;
  /** Keep the contents of fenced/indented code blocks. */
  keepCodeBlocks: boolean;
  /** Collapse runs of 2+ blank lines into a single blank line. */
  collapseBlankLines: boolean;
  /** Join wrapped lines inside a paragraph into one long line. */
  unwrapParagraphs: boolean;
  /** Replace smart quotes, dashes and ellipses with ASCII equivalents. */
  normalizeUnicode: boolean;
  /** Strip zero-width and other invisible characters. */
  stripInvisibles: boolean;
  /** Trim trailing whitespace from every line. */
  trimTrailingSpaces: boolean;
  /** Render tables as aligned plain-text columns instead of dropping pipes. */
  keepTables: boolean;
}

export const defaultMarkdownOptions: MarkdownCleanOptions = {
  keepListMarkers: true,
  bulletChar: '•',
  keepLinkUrls: false,
  keepCodeBlocks: true,
  collapseBlankLines: true,
  unwrapParagraphs: false,
  normalizeUnicode: true,
  stripInvisibles: true,
  trimTrailingSpaces: true,
  keepTables: true,
};

const INVISIBLES = /[\u200B-\u200D\u2060\uFEFF\u00AD\u180E]/g;

const UNICODE_MAP: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2015]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00A0/g, ' '],
  [/[\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
  [/\u2022/g, '*'],
];

/** Strip inline markdown emphasis, code, links, images and HTML from one line. */
export function stripInline(input: string, opts: MarkdownCleanOptions): string {
  let s = input;

  // Escaped punctuation (\* \_ \| …) is parked behind a sentinel before any
  // other rule runs, so `literal \*asterisks\*` is not mistaken for emphasis.
  const escaped: string[] = [];
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_m, ch: string) => {
    escaped.push(ch);
    return `\u0000${escaped.length - 1}\u0000`;
  });

  // Images first: ![alt](src) -> alt (an empty alt disappears entirely).
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Reference-style images.
  s = s.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '$1');

  // Inline links: [text](url "title")
  s = s.replace(/\[([^\]]*)\]\(\s*<?([^)\s]*)>?(?:\s+"[^"]*")?\s*\)/g, (_m, text: string, url: string) => {
    const label = text.trim();
    if (!opts.keepLinkUrls) return label || url;
    if (!label) return url;
    if (label === url) return label;
    return url ? `${label} (${url})` : label;
  });
  // Reference-style links: [text][ref] and [text][]
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  // Autolinks: <https://example.com>
  s = s.replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1');

  // Inline code: `code` / ``code with ` inside``  -> keep the contents.
  s = s.replace(/(`+)(\s?)([\s\S]*?)\2\1/g, (_m, _t, _p, code: string) => code);

  // Emphasis. Run strong before em so ***x*** degrades cleanly.
  s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, '$2');
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2');
  s = s.replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, '$2');
  // Strikethrough and highlight.
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1');
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '$1');

  // Inline footnote markers.
  s = s.replace(/\[\^([^\]]+)\]/g, '');

  // HTML: drop tags, keep text; <br> becomes a newline.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Common HTML entities.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Restore the parked escapes as their literal characters. NUL is used as the
  // sentinel precisely because it cannot appear in Markdown source.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => escaped[Number(i)] ?? '');

  return s;
}

interface TableRow {
  cells: string[];
}

function renderTable(rows: TableRow[]): string[] {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((r) => r.cells.length));
  const widths = new Array<number>(width).fill(0);
  for (const row of rows) {
    for (let i = 0; i < width; i++) {
      widths[i] = Math.max(widths[i] ?? 0, (row.cells[i] ?? '').length);
    }
  }
  return rows.map((row) =>
    Array.from({ length: width }, (_, i) => (row.cells[i] ?? '').padEnd(widths[i] ?? 0))
      .join('   ')
      .trimEnd(),
  );
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

const TABLE_DELIM = /^\s*\|?(?:\s*:?-+:?\s*\|)+(?:\s*:?-+:?\s*)?$/;

/** Convert a Markdown document into clean, readable plain text. */
export function markdownToText(
  input: string,
  options: Partial<MarkdownCleanOptions> = {},
): string {
  const opts = { ...defaultMarkdownOptions, ...options };
  if (!input) return '';

  let src = input.replace(/\r\n?/g, '\n');
  if (opts.stripInvisibles) src = src.replace(INVISIBLES, '');
  if (opts.normalizeUnicode) {
    for (const [re, to] of UNICODE_MAP) src = src.replace(re, to);
  }

  // Remove YAML front matter.
  src = src.replace(/^---\n[\s\S]*?\n---\n?/, '');
  // Remove HTML comments (including MDX-style).
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  // Remove link reference definitions:  [ref]: https://... "Title"
  src = src.replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+(?:[ \t]+.*)?$/gm, '');

  const lines = src.split('\n');
  const out: string[] = [];
  const orderedCounters: number[] = [];

  let inFence = false;
  let fenceMarker = '';
  let tableBuffer: TableRow[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    if (opts.keepTables) out.push(...renderTable(tableBuffer));
    else out.push(...tableBuffer.map((r) => r.cells.join(' ')));
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';

    // --- fenced code blocks -------------------------------------------------
    const fence = raw.match(/^\s*(```+|~~~+)(.*)$/);
    if (fence) {
      const marker = fence[1] ?? '';
      if (!inFence) {
        flushTable();
        inFence = true;
        fenceMarker = marker[0] ?? '`';
        continue;
      }
      if (marker[0] === fenceMarker) {
        inFence = false;
        fenceMarker = '';
        continue;
      }
    }
    if (inFence) {
      if (opts.keepCodeBlocks) out.push(raw);
      continue;
    }

    // --- tables -------------------------------------------------------------
    const looksLikeTableRow = /\|/.test(raw) && raw.trim().length > 0;
    if (looksLikeTableRow && (tableBuffer.length > 0 || (lines[i + 1] ?? '').match(TABLE_DELIM))) {
      if (TABLE_DELIM.test(raw)) continue; // separator row
      tableBuffer.push({ cells: splitTableRow(raw).map((c) => stripInline(c, opts)) });
      continue;
    }
    flushTable();

    const line = raw;
    const trimmed = line.trim();

    if (trimmed === '') {
      orderedCounters.length = 0;
      out.push('');
      continue;
    }

    // --- horizontal rules ---------------------------------------------------
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('');
      continue;
    }

    // --- setext headings ----------------------------------------------------
    const next = lines[i + 1] ?? '';
    if (/^\s{0,3}=+\s*$/.test(next) && trimmed !== '') {
      out.push(stripInline(trimmed, opts));
      i++;
      continue;
    }
    if (/^\s{0,3}-+\s*$/.test(next) && trimmed !== '' && !/^\s{0,3}[-*+]\s/.test(line)) {
      out.push(stripInline(trimmed, opts));
      i++;
      continue;
    }

    // --- ATX headings -------------------------------------------------------
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      out.push(stripInline(heading[2] ?? '', opts));
      continue;
    }

    // --- blockquotes --------------------------------------------------------
    let working = line;
    let quoteDepth = 0;
    while (/^\s{0,3}>\s?/.test(working)) {
      working = working.replace(/^\s{0,3}>\s?/, '');
      quoteDepth++;
    }
    if (quoteDepth > 0 && working.trim() === '') {
      out.push('');
      continue;
    }

    // --- lists --------------------------------------------------------------
    const bullet = working.match(/^(\s*)([-*+])\s+(.*)$/);
    const ordered = working.match(/^(\s*)(\d{1,9})[.)]\s+(.*)$/);

    if (bullet || ordered) {
      const indentText = (bullet ? bullet[1] : ordered?.[1]) ?? '';
      const depth = Math.floor(indentText.replace(/\t/g, '    ').length / 2);
      let body = (bullet ? bullet[3] : ordered?.[3]) ?? '';

      // Task list checkboxes.
      let checkbox = '';
      const task = body.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        checkbox = (task[1] ?? ' ').toLowerCase() === 'x' ? '[x] ' : '[ ] ';
        body = task[2] ?? '';
      }

      const text = stripInline(body, opts);
      if (!opts.keepListMarkers) {
        out.push('  '.repeat(depth) + checkbox + text);
        continue;
      }

      if (ordered) {
        orderedCounters.length = Math.max(orderedCounters.length, depth + 1);
        orderedCounters[depth] = (orderedCounters[depth] ?? 0) + 1;
        for (let d = depth + 1; d < orderedCounters.length; d++) orderedCounters[d] = 0;
        out.push(`${'  '.repeat(depth)}${orderedCounters[depth]}. ${checkbox}${text}`);
      } else {
        out.push(`${'  '.repeat(depth)}${opts.bulletChar} ${checkbox}${text}`);
      }
      continue;
    }

    orderedCounters.length = 0;

    // --- indented code blocks ----------------------------------------------
    if (/^(\t| {4})/.test(working) && (out[out.length - 1] ?? '') === '') {
      if (opts.keepCodeBlocks) out.push(working.replace(/^(\t| {4})/, ''));
      continue;
    }

    // --- plain paragraph line ----------------------------------------------
    out.push(stripInline(working.trim(), opts));
  }

  flushTable();

  let result = out.join('\n');
  // stripInline can emit newlines (from <br>); normalise them back into lines.
  result = result.replace(/\n{1}/g, '\n');

  if (opts.unwrapParagraphs) {
    result = result
      .split(/\n{2,}/)
      .map((block) => {
        const blockLines = block.split('\n');
        const isList = blockLines.some((l) => /^\s*([•*\-+]|\d+\.)\s/.test(l));
        if (isList) return block;
        return blockLines
          .map((l) => l.trim())
          .filter(Boolean)
          .join(' ');
      })
      .join('\n\n');
  }

  if (opts.trimTrailingSpaces) {
    result = result
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join('\n');
  }

  if (opts.collapseBlankLines) result = result.replace(/\n{3,}/g, '\n\n');

  return result.replace(/^\n+/, '').replace(/\s+$/, '') + (result.trim() ? '\n' : '');
}

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
  paragraphs: number;
  readingTimeMinutes: number;
}

export function textStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    words,
    lines: text ? text.split('\n').length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0,
    readingTimeMinutes: Math.max(words > 0 ? 1 : 0, Math.round(words / 225)),
  };
}
