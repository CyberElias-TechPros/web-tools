/**
 * PPTX (PresentationML) text extraction: slide titles, body text (with
 * bullet levels), tables and speaker notes, in presentation order.
 */

import { readZip } from '@/lib/zip-reader';
import type { RichDocument, Block, Paragraph } from '@/lib/richdoc';

export interface SlideText {
  number: number;
  title: string;
  /** Paragraphs with their indent level. */
  paragraphs: Array<{ text: string; level: number; bullet: boolean }>;
  tables: string[][][];
  notes: string;
}

export interface Presentation {
  slides: SlideText[];
  warnings: string[];
}

function parseXml(source: string, part: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror')[0]) throw new Error(`“${part}” is not well-formed XML.`);
  return doc;
}

function all(root: ParentNode, name: string): Element[] {
  const out: Element[] = [];
  root.querySelectorAll('*').forEach((el) => {
    if (el.localName === name) out.push(el);
  });
  return out;
}

function paragraphText(p: Element): string {
  let text = '';
  for (const node of Array.from(p.children)) {
    if (node.localName === 'r' || node.localName === 'fld') {
      for (const t of Array.from(node.children)) if (t.localName === 't') text += t.textContent ?? '';
    } else if (node.localName === 'br') {
      text += '\n';
    }
  }
  return text;
}

function paragraphLevel(p: Element): { level: number; bullet: boolean } {
  const pPr = Array.from(p.children).find((c) => c.localName === 'pPr');
  const level = Number(pPr?.getAttribute('lvl') ?? 0);
  const noBullet = pPr ? Array.from(pPr.children).some((c) => c.localName === 'buNone') : false;
  return { level: Number.isFinite(level) ? level : 0, bullet: !noBullet };
}

export async function parsePptx(input: ArrayBuffer | Uint8Array | Blob): Promise<Presentation> {
  const bytes =
    input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : input instanceof Uint8Array ? input : new Uint8Array(input);
  const zip = await readZip(bytes).catch((e: unknown) => {
    throw new Error(`Could not open the presentation: ${e instanceof Error ? e.message : String(e)}`);
  });
  const presentationEntry = zip.file('ppt/presentation.xml');
  if (!presentationEntry) throw new Error('This file is not a PowerPoint presentation (.pptx).');
  const warnings: string[] = [];

  // Slide order comes from presentation.xml → sldIdLst → r:id → rels.
  const presentation = parseXml(await zip.extractText(presentationEntry), 'ppt/presentation.xml');
  const relsEntry = zip.file('ppt/_rels/presentation.xml.rels');
  const rels = new Map<string, string>();
  if (relsEntry) {
    const relsXml = parseXml(await zip.extractText(relsEntry), 'presentation.xml.rels');
    for (const rel of all(relsXml, 'Relationship')) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\//, '')}`);
    }
  }
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  let slidePaths = all(presentation, 'sldId')
    .map((el) => el.getAttributeNS(R_NS, 'id') ?? el.getAttribute('r:id'))
    .map((id) => (id ? rels.get(id) : undefined))
    .filter((p): p is string => Boolean(p));
  if (!slidePaths.length) {
    slidePaths = zip.entries
      .map((e) => e.name)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]));
  }

  const slides: SlideText[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const path = slidePaths[i]!;
    const entry = zip.file(path);
    if (!entry) {
      warnings.push(`Slide ${i + 1} is missing from the file.`);
      continue;
    }
    const xml = parseXml(await zip.extractText(entry), path);
    const slide: SlideText = { number: i + 1, title: '', paragraphs: [], tables: [], notes: '' };

    // Shapes in z-order; title placeholder first if present.
    const shapes = all(xml, 'sp');
    const isTitle = (sp: Element): boolean =>
      all(sp, 'ph').some((ph) => /^(title|ctrTitle)$/.test(ph.getAttribute('type') ?? ''));
    const ordered = [...shapes.filter(isTitle), ...shapes.filter((s) => !isTitle(s))];
    for (const sp of ordered) {
      const txBody = Array.from(sp.children).find((c) => c.localName === 'txBody');
      if (!txBody) continue;
      const paras = Array.from(txBody.children).filter((c) => c.localName === 'p');
      const texts = paras.map((p) => ({ text: paragraphText(p), ...paragraphLevel(p) })).filter((p) => p.text.trim());
      if (!texts.length) continue;
      if (isTitle(sp) && !slide.title) {
        slide.title = texts.map((t) => t.text).join(' ');
        continue;
      }
      slide.paragraphs.push(...texts);
    }
    for (const tbl of all(xml, 'tbl')) {
      const rows = all(tbl, 'tr').map((tr) => all(tr, 'tc').map((tc) => all(tc, 'p').map(paragraphText).join('\n').trim()));
      if (rows.length) slide.tables.push(rows);
    }

    // Notes: slide rels → notesSlide.
    const slideName = path.split('/').pop()!;
    const slideRels = zip.file(`ppt/slides/_rels/${slideName}.rels`);
    if (slideRels) {
      const relXml = parseXml(await zip.extractText(slideRels), `${slideName}.rels`);
      const notesRel = all(relXml, 'Relationship').find((r) => /notesSlide$/.test(r.getAttribute('Type') ?? ''));
      const target = notesRel?.getAttribute('Target');
      if (target) {
        const notesPath = target.startsWith('/') ? target.slice(1) : `ppt/slides/${target}`.replace(/\/slides\/\.\.\//, '/');
        const notesEntry = zip.file(notesPath.replace('ppt/slides/../', 'ppt/'));
        if (notesEntry) {
          const notesXml = parseXml(await zip.extractText(notesEntry), notesPath);
          const bodyShapes = all(notesXml, 'sp').filter((sp) => all(sp, 'ph').some((ph) => ph.getAttribute('type') === 'body'));
          const lines = bodyShapes.flatMap((sp) => all(sp, 'p').map(paragraphText)).filter((t) => t.trim());
          slide.notes = lines.join('\n');
        }
      }
    }
    slides.push(slide);
  }
  if (!slides.length) throw new Error('The presentation has no slides.');
  return { slides, warnings };
}

export function presentationToText(pres: Presentation, options: { notes?: boolean } = {}): string {
  const out: string[] = [];
  for (const slide of pres.slides) {
    out.push(`--- Slide ${slide.number} ---`);
    if (slide.title) out.push(slide.title, '');
    for (const p of slide.paragraphs) out.push(`${'  '.repeat(p.level)}${p.bullet && p.level >= 0 ? '• ' : ''}${p.text}`);
    for (const table of slide.tables) {
      out.push('');
      for (const row of table) out.push(row.join('\t'));
    }
    if (options.notes !== false && slide.notes) out.push('', `Notes: ${slide.notes}`);
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

export function presentationToRichDocument(pres: Presentation, options: { notes?: boolean } = {}): RichDocument {
  const blocks: Block[] = [];
  pres.slides.forEach((slide, index) => {
    if (index > 0) blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'paragraph', style: 'caption', runs: [{ kind: 'text', text: `Slide ${slide.number}` }] });
    if (slide.title) blocks.push({ kind: 'paragraph', style: 'h1', runs: [{ kind: 'text', text: slide.title }] });
    let counter = 0;
    for (const p of slide.paragraphs) {
      const para: Paragraph = { kind: 'paragraph', style: 'normal', runs: [{ kind: 'text', text: p.text }] };
      if (p.bullet) para.list = { ordered: false, level: Math.min(5, p.level), index: ++counter };
      blocks.push(para);
    }
    for (const table of slide.tables) {
      blocks.push({
        kind: 'table',
        rows: table.map((row, r) => ({
          header: r === 0,
          cells: row.map((cell) => ({ blocks: [{ kind: 'paragraph' as const, style: 'normal' as const, runs: [{ kind: 'text' as const, text: cell }] }], header: r === 0 })),
        })),
      });
    }
    if (options.notes !== false && slide.notes) {
      blocks.push({ kind: 'paragraph', style: 'quote', runs: [{ kind: 'text', text: 'Notes: ', bold: true }, { kind: 'text', text: slide.notes }] });
    }
  });
  return { blocks, meta: {}, warnings: pres.warnings };
}

export function looksLikePptx(file: { name: string; type: string }): boolean {
  return /\.pptx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}
