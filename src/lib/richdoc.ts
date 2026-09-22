/**
 * A small, format-neutral document model.
 *
 * DOCX and Markdown are parsed *into* this model; PDF, HTML, Markdown and
 * plain text are rendered *from* it. Keeping one intermediate representation
 * means every importer automatically gains every exporter.
 */

export interface TextRun {
  kind: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** Hex colour without '#', e.g. 'C03030'. */
  color?: string;
  /** Font size in points; absent means "inherit from the paragraph". */
  size?: number;
  href?: string;
}

export interface LineBreak {
  kind: 'break';
}

export interface InlineImage {
  kind: 'image';
  image: DocImage;
}

export type Inline = TextRun | LineBreak | InlineImage;

export interface DocImage {
  data: Uint8Array;
  /** MIME type such as image/png. */
  type: string;
  /** Intended display size in points (1/72 inch); 0 when unknown. */
  width: number;
  height: number;
  alt?: string;
  /** Non-embeddable format (EMF/WMF/TIFF…) — renderers should show a placeholder. */
  unsupported?: boolean;
}

export type ParagraphStyle =
  | 'normal'
  | 'title'
  | 'subtitle'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'quote'
  | 'code'
  | 'caption';

export type Alignment = 'left' | 'center' | 'right' | 'justify';

export interface ListInfo {
  ordered: boolean;
  /** 0-based nesting depth. */
  level: number;
  /** 1-based item number within its list, for ordered lists. */
  index: number;
  /** Checkbox state for task lists. */
  checked?: boolean;
  /** Pre-formatted marker label ("1.", "a)", "•"); renderers fall back to a default. */
  marker?: string;
}

export interface Paragraph {
  kind: 'paragraph';
  runs: Inline[];
  style: ParagraphStyle;
  align?: Alignment;
  list?: ListInfo;
  pageBreakBefore?: boolean;
  /** Extra left indent in points (beyond list indentation). */
  indent?: number;
  /** Fenced-code language hint. */
  language?: string;
}

export interface TableCell {
  blocks: Block[];
  /** Column span, default 1. */
  colSpan?: number;
  header?: boolean;
  align?: Alignment;
}

export interface TableRow {
  cells: TableCell[];
  header?: boolean;
}

export interface Table {
  kind: 'table';
  rows: TableRow[];
  /** Relative column widths (any unit); renderers normalise them. */
  columnWidths?: number[];
}

export interface ImageBlock {
  kind: 'image';
  image: DocImage;
  align?: Alignment;
  caption?: string;
}

export interface PageBreak {
  kind: 'pageBreak';
}

export interface HorizontalRule {
  kind: 'rule';
}

export type Block = Paragraph | Table | ImageBlock | PageBreak | HorizontalRule;

export interface DocumentMeta {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  created?: Date;
  modified?: Date;
}

export interface RichDocument {
  blocks: Block[];
  meta: DocumentMeta;
  /** Non-fatal problems encountered while importing (unsupported features, etc.). */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function text(content: string, props: Omit<TextRun, 'kind' | 'text'> = {}): TextRun {
  return { kind: 'text', text: content, ...props };
}

export function paragraph(runs: Inline[] | string, style: ParagraphStyle = 'normal'): Paragraph {
  return { kind: 'paragraph', runs: typeof runs === 'string' ? [text(runs)] : runs, style };
}

export function emptyDocument(): RichDocument {
  return { blocks: [], meta: {}, warnings: [] };
}

export function inlinesToText(runs: Inline[]): string {
  let out = '';
  for (const run of runs) {
    if (run.kind === 'text') out += run.text;
    else if (run.kind === 'break') out += '\n';
    else if (run.image.alt) out += `[${run.image.alt}]`;
  }
  return out;
}

export function isHeading(style: ParagraphStyle): boolean {
  return style === 'title' || /^h[1-6]$/.test(style);
}

export function headingLevel(style: ParagraphStyle): number {
  if (style === 'title') return 1;
  if (style === 'subtitle') return 2;
  const m = /^h([1-6])$/.exec(style);
  return m ? Number(m[1]) : 0;
}

/** Collapse adjacent runs that share identical formatting. */
export function mergeRuns(runs: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (
      run.kind === 'text' &&
      last?.kind === 'text' &&
      last.bold === run.bold &&
      last.italic === run.italic &&
      last.underline === run.underline &&
      last.strike === run.strike &&
      last.code === run.code &&
      last.superscript === run.superscript &&
      last.subscript === run.subscript &&
      last.color === run.color &&
      last.size === run.size &&
      last.href === run.href
    ) {
      last.text += run.text;
    } else {
      out.push(run.kind === 'text' ? { ...run } : run);
    }
  }
  return out;
}

/** Plain-text word count over the whole document. */
export function countWords(doc: RichDocument): number {
  let count = 0;
  const visit = (blocks: Block[]): void => {
    for (const block of blocks) {
      if (block.kind === 'paragraph') {
        const words = inlinesToText(block.runs).trim().split(/\s+/).filter(Boolean);
        count += words.length;
      } else if (block.kind === 'table') {
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
      }
    }
  };
  visit(doc.blocks);
  return count;
}

/** Count images anywhere in the document. */
export function countImages(doc: RichDocument): number {
  let count = 0;
  const visit = (blocks: Block[]): void => {
    for (const block of blocks) {
      if (block.kind === 'image') count++;
      else if (block.kind === 'paragraph') count += block.runs.filter((r) => r.kind === 'image').length;
      else if (block.kind === 'table') for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
    }
  };
  visit(doc.blocks);
  return count;
}
