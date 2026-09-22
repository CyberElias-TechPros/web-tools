/**
 * RichDocument → Markdown, HTML and plain text.
 */

import type { Block, Inline, Paragraph, RichDocument, Table, TextRun } from '@/lib/richdoc';
import { headingLevel, inlinesToText } from '@/lib/richdoc';

/* -------------------------------------------------------------------------- */
/* Plain text                                                                 */
/* -------------------------------------------------------------------------- */

export function documentToText(doc: RichDocument): string {
  const lines: string[] = [];
  const visit = (blocks: Block[], indent = ''): void => {
    for (const block of blocks) {
      switch (block.kind) {
        case 'paragraph': {
          const body = inlinesToText(block.runs).replace(/\t/g, '    ');
          const prefix = block.list
            ? `${'  '.repeat(block.list.level)}${block.list.marker ?? (block.list.ordered ? `${block.list.index}.` : '•')} `
            : '';
          lines.push(indent + prefix + body);
          break;
        }
        case 'table':
          for (const row of block.rows) {
            lines.push(
              indent +
                row.cells
                  .map((cell) => cell.blocks.map((b) => (b.kind === 'paragraph' ? inlinesToText(b.runs) : '')).join(' ').trim())
                  .join('\t'),
            );
          }
          lines.push('');
          break;
        case 'image':
          if (block.image.alt) lines.push(`${indent}[Image: ${block.image.alt}]`);
          break;
        case 'rule':
          lines.push(`${indent}――――――――――`);
          break;
        case 'pageBreak':
          lines.push('');
          break;
      }
    }
  };
  visit(doc.blocks);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* -------------------------------------------------------------------------- */
/* Markdown                                                                   */
/* -------------------------------------------------------------------------- */

function escapeMd(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#+!|])/g, '\\$1');
}

function runToMarkdown(run: TextRun, escape: boolean): string {
  if (!run.text) return '';
  const leading = /^\s*/.exec(run.text)?.[0] ?? '';
  const trailing = /\s*$/.exec(run.text)?.[0] ?? '';
  const core = run.text.trim();
  if (!core) return run.text;
  let out = run.code ? `\`${core.replace(/`/g, '``')}\`` : escape ? escapeMd(core) : core;
  if (run.bold && run.italic) out = `***${out}***`;
  else if (run.bold) out = `**${out}**`;
  else if (run.italic) out = `*${out}*`;
  if (run.strike) out = `~~${out}~~`;
  if (run.underline && !run.href) out = `<u>${out}</u>`;
  if (run.superscript) out = `^${out}^`;
  if (run.subscript) out = `~${out}~`;
  if (run.href) out = `[${out}](${run.href})`;
  return leading + out + trailing;
}

function inlinesToMarkdown(runs: Inline[], escape = true): string {
  let out = '';
  for (const run of runs) {
    if (run.kind === 'text') out += runToMarkdown(run, escape);
    else if (run.kind === 'break') out += '  \n';
    else out += `![${run.image.alt ?? 'image'}](${imageFileName(run.image)})`;
  }
  return out.replace(/\t/g, '    ');
}

const imageNames = new WeakMap<object, string>();
let imageCounter = 0;
function imageFileName(image: { type: string; data: Uint8Array }): string {
  const existing = imageNames.get(image);
  if (existing) return existing;
  const ext = image.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') ?? 'bin';
  const name = `image-${++imageCounter}.${ext}`;
  imageNames.set(image, name);
  return name;
}

function tableToMarkdown(table: Table): string {
  const cellText = (cell: Table['rows'][number]['cells'][number]): string =>
    cell.blocks
      .map((b) => (b.kind === 'paragraph' ? inlinesToMarkdown(b.runs) : ''))
      .join('<br>')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .trim();
  const width = Math.max(...table.rows.map((r) => r.cells.length), 1);
  const rows = table.rows.map((r) => {
    const cells = r.cells.map(cellText);
    while (cells.length < width) cells.push('');
    return `| ${cells.join(' | ')} |`;
  });
  const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  if (rows.length === 0) return '';
  return [rows[0], separator, ...rows.slice(1)].join('\n');
}

function headingShift(doc: RichDocument): number {
  // A document with a Title style becomes H1, so Heading 1 shifts to H2.
  return doc.blocks.some((b) => b.kind === 'paragraph' && b.style === 'title') ? 1 : 0;
}

function effectiveLevel(style: Paragraph['style'], shift: number): number {
  const level = headingLevel(style);
  if (!level) return 0;
  if (style === 'title') return 1;
  if (style === 'subtitle') return 0;
  return Math.min(6, level + shift);
}

export function documentToMarkdown(doc: RichDocument): string {
  const out: string[] = [];
  const shift = headingShift(doc);
  let previousList = false;
  const visit = (blocks: Block[]): void => {
    for (const block of blocks) {
      if (block.kind === 'paragraph') {
        const line = paragraphToMarkdown(block, shift);
        if (block.list) {
          out.push(line);
          previousList = true;
          continue;
        }
        if (previousList) out.push('');
        previousList = false;
        out.push(line, '');
      } else {
        if (previousList) out.push('');
        previousList = false;
        if (block.kind === 'table') out.push(tableToMarkdown(block), '');
        else if (block.kind === 'image') out.push(`![${block.image.alt ?? 'image'}](${imageFileName(block.image)})`, '');
        else if (block.kind === 'rule') out.push('---', '');
        else if (block.kind === 'pageBreak') out.push('<div style="page-break-after: always"></div>', '');
      }
    }
  };
  visit(doc.blocks);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function paragraphToMarkdown(block: Paragraph, shift: number): string {
  if (block.style === 'code') {
    const code = inlinesToText(block.runs);
    return `\`\`\`${block.language ?? ''}\n${code}\n\`\`\``;
  }
  const body = inlinesToMarkdown(block.runs);
  const level = effectiveLevel(block.style, shift);
  if (level) return `${'#'.repeat(level)} ${body.trim()}`;
  if (block.style === 'subtitle') return `*${body.trim()}*`;
  if (block.style === 'quote') return `> ${body.trim()}`;
  if (block.list) {
    const indent = '  '.repeat(block.list.level);
    const marker = block.list.ordered ? `${block.list.index}.` : '-';
    const check = block.list.checked === undefined ? '' : block.list.checked ? '[x] ' : '[ ] ';
    return `${indent}${marker} ${check}${body.trim()}`;
  }
  return body.trim();
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                       */
/* -------------------------------------------------------------------------- */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(href: string): string {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return escapeHtml(trimmed);
  if (/^[\w.-]+(\/|$)/.test(trimmed) && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return escapeHtml(trimmed);
  return '#';
}

function imageSrc(image: { type: string; data: Uint8Array }): string {
  if (image.data.length > 2_000_000) return '';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < image.data.length; i += chunk) {
    binary += String.fromCharCode(...image.data.subarray(i, i + chunk));
  }
  return `data:${image.type};base64,${btoa(binary)}`;
}

function inlinesToHtml(runs: Inline[], embedImages: boolean): string {
  let out = '';
  for (const run of runs) {
    if (run.kind === 'break') {
      out += '<br>';
      continue;
    }
    if (run.kind === 'image') {
      const src = embedImages ? imageSrc(run.image) : imageFileName(run.image);
      out += `<img src="${src}" alt="${escapeHtml(run.image.alt ?? '')}">`;
      continue;
    }
    let html = escapeHtml(run.text).replace(/\t/g, '&emsp;');
    if (run.code) html = `<code>${html}</code>`;
    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    if (run.underline) html = `<u>${html}</u>`;
    if (run.strike) html = `<s>${html}</s>`;
    if (run.superscript) html = `<sup>${html}</sup>`;
    if (run.subscript) html = `<sub>${html}</sub>`;
    const styles: string[] = [];
    if (run.color) styles.push(`color:#${run.color}`);
    if (run.size) styles.push(`font-size:${run.size}pt`);
    if (styles.length) html = `<span style="${styles.join(';')}">${html}</span>`;
    if (run.href) html = `<a href="${safeHref(run.href)}">${html}</a>`;
    out += html;
  }
  return out;
}

export interface HtmlOptions {
  /** Inline images as data URIs (default true). */
  embedImages?: boolean;
  /** Wrap in a full document with minimal styling. */
  fullDocument?: boolean;
  title?: string;
}

export function documentToHtml(doc: RichDocument, options: HtmlOptions = {}): string {
  const embed = options.embedImages ?? true;
  const shift = headingShift(doc);
  const out: string[] = [];
  const listStack: Array<{ ordered: boolean; level: number }> = [];

  const closeLists = (toLevel: number): void => {
    while (listStack.length > toLevel) {
      const top = listStack.pop()!;
      out.push(top.ordered ? '</ol>' : '</ul>');
    }
  };

  const visit = (blocks: Block[]): void => {
    for (const block of blocks) {
      if (block.kind === 'paragraph' && block.list) {
        const target = block.list.level + 1;
        if (listStack.length > target) closeLists(target);
        const top = listStack[listStack.length - 1];
        if (listStack.length === target && top && top.ordered !== block.list.ordered) closeLists(target - 1);
        while (listStack.length < target) {
          const ordered = listStack.length === target - 1 ? block.list.ordered : false;
          listStack.push({ ordered, level: listStack.length });
          out.push(ordered ? '<ol>' : '<ul>');
        }
        const check =
          block.list.checked === undefined ? '' : `<input type="checkbox" disabled${block.list.checked ? ' checked' : ''}> `;
        out.push(`<li>${check}${inlinesToHtml(block.runs, embed)}</li>`);
        continue;
      }
      closeLists(0);
      switch (block.kind) {
        case 'paragraph': {
          const align = block.align && block.align !== 'left' ? ` style="text-align:${block.align}"` : '';
          if (block.style === 'code') {
            const lang = block.language ? ` class="language-${escapeHtml(block.language)}"` : '';
            out.push(`<pre><code${lang}>${escapeHtml(inlinesToText(block.runs))}</code></pre>`);
          } else if (block.style === 'quote') {
            out.push(`<blockquote><p${align}>${inlinesToHtml(block.runs, embed)}</p></blockquote>`);
          } else {
            const level = effectiveLevel(block.style, shift);
            const tag = level ? `h${level}` : 'p';
            const cls = block.style === 'caption' ? ' class="caption"' : block.style === 'subtitle' ? ' class="subtitle"' : '';
            out.push(`<${tag}${cls}${align}>${inlinesToHtml(block.runs, embed)}</${tag}>`);
          }
          break;
        }
        case 'table': {
          out.push('<table>');
          block.rows.forEach((row, i) => {
            const isHeader = row.header || (i === 0 && row.cells.every((c) => c.header));
            if (i === 0 && isHeader) out.push('<thead>');
            if (i === 1 && block.rows[0] && (block.rows[0].header || block.rows[0].cells.every((c) => c.header))) out.push('</thead><tbody>');
            else if (i === 0 && !isHeader) out.push('<tbody>');
            out.push('<tr>');
            for (const cell of row.cells) {
              const tag = isHeader || cell.header ? 'th' : 'td';
              const span = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
              const align = cell.align && cell.align !== 'left' ? ` style="text-align:${cell.align}"` : '';
              const inner = cell.blocks
                .map((b) => (b.kind === 'paragraph' ? inlinesToHtml(b.runs, embed) : ''))
                .filter(Boolean)
                .join('<br>');
              out.push(`<${tag}${span}${align}>${inner}</${tag}>`);
            }
            out.push('</tr>');
          });
          if (block.rows.length === 1 && (block.rows[0]?.header || block.rows[0]?.cells.every((c) => c.header))) out.push('</thead>');
          else out.push('</tbody>');
          out.push('</table>');
          break;
        }
        case 'image': {
          const src = embed ? imageSrc(block.image) : imageFileName(block.image);
          const align = block.align && block.align !== 'left' ? ` style="text-align:${block.align}"` : '';
          const size = block.image.width ? ` width="${Math.round(block.image.width * 1.333)}"` : '';
          out.push(`<figure${align}><img src="${src}" alt="${escapeHtml(block.image.alt ?? '')}"${size}>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`);
          break;
        }
        case 'rule':
          out.push('<hr>');
          break;
        case 'pageBreak':
          out.push('<div style="page-break-after:always;break-after:page"></div>');
          break;
      }
    }
    closeLists(0);
  };
  visit(doc.blocks);

  const body = out.join('\n');
  if (!options.fullDocument) return body;
  const title = escapeHtml(options.title ?? doc.meta.title ?? 'Document');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { max-width: 46rem; margin: 3rem auto; padding: 0 1.25rem; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1c1e; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 0.5em; }
  h1 { font-size: 2rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.25rem; }
  .subtitle { color: #555; font-size: 1.15rem; margin-top: -0.75rem; }
  .caption { color: #666; font-size: 0.9rem; }
  pre { background: #f4f4f5; padding: 1rem; border-radius: 8px; overflow: auto; font-size: 0.9rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
  blockquote { margin: 1rem 0; padding: 0.25rem 1rem; border-left: 4px solid #d4d4d8; color: #444; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #d4d4d8; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; }
  img { max-width: 100%; height: auto; }
  figure { margin: 1rem 0; }
  hr { border: 0; border-top: 1px solid #d4d4d8; margin: 2rem 0; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
