/**
 * Conservative SVG optimiser: strips editor metadata, comments, empty
 * groups/defs, default attributes, rounds numbers and collapses whitespace.
 * Also converts SVG to a data URI / CSS background / React component.
 */

export interface SvgOptimizeOptions {
  precision: number;
  removeComments: boolean;
  removeMetadata: boolean;
  removeEditorData: boolean;
  removeXmlDeclaration: boolean;
  removeDimensions: boolean;
  removeEmptyGroups: boolean;
  removeDefaults: boolean;
  removeIds: boolean;
  collapseWhitespace: boolean;
  removeTitle: boolean;
  currentColor: boolean;
}

export const defaultSvgOptions: SvgOptimizeOptions = {
  precision: 2,
  removeComments: true,
  removeMetadata: true,
  removeEditorData: true,
  removeXmlDeclaration: true,
  removeDimensions: false,
  removeEmptyGroups: true,
  removeDefaults: true,
  removeIds: false,
  collapseWhitespace: true,
  removeTitle: false,
  currentColor: false,
};

const EDITOR_NS = ['inkscape', 'sodipodi', 'sketch', 'illustrator', 'i:', 'x:', 'xap', 'adobe', 'figma', 'serif', 'vectornator', 'krita', 'svg-edit', 'dc', 'cc', 'rdf'];

const DEFAULT_ATTRS: Array<[RegExp, string]> = [
  [/\s+fill-opacity="1"/g, ''],
  [/\s+stroke-opacity="1"/g, ''],
  [/\s+opacity="1"/g, ''],
  [/\s+stroke-width="1"/g, ''],
  [/\s+stroke-linecap="butt"/g, ''],
  [/\s+stroke-linejoin="miter"/g, ''],
  [/\s+stroke-miterlimit="4"/g, ''],
  [/\s+stroke-dasharray="none"/g, ''],
  [/\s+stroke="none"/g, ''],
  [/\s+fill-rule="nonzero"/g, ''],
  [/\s+clip-rule="nonzero"/g, ''],
  [/\s+font-style="normal"/g, ''],
  [/\s+font-weight="normal"/g, ''],
  [/\s+version="1\.[01]"/g, ''],
  [/\s+baseProfile="[^"]*"/g, ''],
  [/\s+enable-background="[^"]*"/g, ''],
  [/\s+xml:space="preserve"/g, ''],
  [/\s+xmlns:xlink="[^"]*"(?![\s\S]*xlink:)/g, ''],
];

function roundNumbers(text: string, precision: number): string {
  const factor = 10 ** precision;
  return text.replace(/-?\d*\.\d+(?:e-?\d+)?/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    const rounded = Math.round(n * factor) / factor;
    let s = String(rounded);
    if (s.startsWith('0.')) s = s.slice(1);
    else if (s.startsWith('-0.')) s = `-${s.slice(2)}`;
    return s;
  });
}

export function optimizeSvg(input: string, options: Partial<SvgOptimizeOptions> = {}): { svg: string; before: number; after: number } {
  const opts = { ...defaultSvgOptions, ...options };
  let svg = input;
  const before = new TextEncoder().encode(input).length;
  if (!/<svg[\s>]/i.test(svg)) throw new Error('This does not look like an SVG document (no <svg> element).');

  if (opts.removeXmlDeclaration) svg = svg.replace(/<\?xml[\s\S]*?\?>\s*/gi, '').replace(/<!DOCTYPE[\s\S]*?>\s*/gi, '');
  if (opts.removeComments) svg = svg.replace(/<!--[\s\S]*?-->/g, '');
  if (opts.removeMetadata) svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, '').replace(/<desc[\s\S]*?<\/desc>/gi, '');
  if (opts.removeTitle) svg = svg.replace(/<title[\s\S]*?<\/title>/gi, '');
  if (opts.removeEditorData) {
    for (const ns of EDITOR_NS) {
      svg = svg.replace(new RegExp(`<${ns}:[^>]*?(?:/>|>[\\s\\S]*?</${ns}:[^>]*>)`, 'gi'), '');
      svg = svg.replace(new RegExp(`\\s+${ns}:[\\w.-]+="[^"]*"`, 'gi'), '');
      svg = svg.replace(new RegExp(`\\s+xmlns:${ns}="[^"]*"`, 'gi'), '');
    }
    svg = svg.replace(/\s+data-name="[^"]*"/g, '');
  }
  if (opts.removeDefaults) for (const [re, rep] of DEFAULT_ATTRS) svg = svg.replace(re, rep);
  if (opts.removeIds) {
    // Only drop ids that are never referenced.
    const referenced = new Set<string>();
    for (const m of svg.matchAll(/(?:href|xlink:href)="#([^"]+)"/g)) referenced.add(m[1]!);
    for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) referenced.add(m[1]!);
    svg = svg.replace(/\s+id="([^"]+)"/g, (full, id: string) => (referenced.has(id) ? full : ''));
  }
  if (opts.removeDimensions) {
    svg = svg.replace(/<svg([^>]*)>/i, (_full, attrs: string) => {
      if (!/viewBox=/.test(attrs)) {
        const w = /\swidth="([\d.]+)(?:px)?"/.exec(attrs)?.[1];
        const h = /\sheight="([\d.]+)(?:px)?"/.exec(attrs)?.[1];
        if (w && h) attrs += ` viewBox="0 0 ${w} ${h}"`;
      }
      return `<svg${attrs.replace(/\s+(width|height)="[^"]*"/g, '')}>`;
    });
  }
  if (opts.currentColor) {
    svg = svg.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,8}|black|rgb\([^)]*\))"/g, '$1="currentColor"');
  }
  if (opts.precision >= 0) {
    svg = svg.replace(/(\s(?:d|points|viewBox|transform|x|y|cx|cy|r|rx|ry|x1|x2|y1|y2|width|height|stroke-width|offset|dx|dy)=")([^"]*)(")/g, (_, pre: string, val: string, post: string) => pre + roundNumbers(val, opts.precision) + post);
    // Path data: collapse separators.
    svg = svg.replace(/\sd="([^"]*)"/g, (_, d: string) => ` d="${d.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').replace(/\s?([MLHVCSQTAZmlhvcsqtaz])\s?/g, '$1').replace(/(\d)-/g, '$1 -').trim()}"`);
  }
  if (opts.removeEmptyGroups) {
    let prev = '';
    while (prev !== svg) {
      prev = svg;
      svg = svg.replace(/<g(\s[^>]*)?>\s*<\/g>/g, '').replace(/<defs(\s[^>]*)?>\s*<\/defs>/g, '');
    }
  }
  if (opts.collapseWhitespace) {
    svg = svg
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+\/>/g, '/>')
      .replace(/\s+>/g, '>')
      .trim();
  }
  return { svg, before, after: new TextEncoder().encode(svg).length };
}

export function svgToDataUri(svg: string): string {
  const encoded = svg
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/{/g, '%7B')
    .replace(/}/g, '%7D')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/\s+/g, ' ');
  return `data:image/svg+xml,${encoded}`;
}

export function svgToBase64DataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export function svgToReactComponent(svg: string, name = 'Icon', typescript = true): string {
  let body = svg
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\sclass=/g, ' className=')
    .replace(/\s([a-z]+)-([a-z])/g, (_, a: string, b: string) => ` ${a}${b.toUpperCase()}`) // stroke-width → strokeWidth
    .replace(/xlink:href/g, 'xlinkHref')
    .replace(/xml:space="[^"]*"/g, '')
    .replace(/style="([^"]*)"/g, (_, css: string) => {
      const obj = css
        .split(';')
        .filter((d) => d.includes(':'))
        .map((d) => {
          const [k, v] = d.split(':') as [string, string];
          const key = k.trim().replace(/-([a-z])/g, (__, c: string) => c.toUpperCase());
          return `${key}: '${v.trim()}'`;
        })
        .join(', ');
      return `style={{ ${obj} }}`;
    })
    .trim();
  body = body.replace(/<svg([^>]*)>/, (_, attrs: string) => `<svg${attrs} {...props}>`);
  const propsType = typescript ? ': React.SVGProps<SVGSVGElement>' : '';
  return `${typescript ? "import type * as React from 'react';\n\n" : ''}export function ${name}(props${propsType}) {\n  return (\n    ${body.split('\n').join('\n    ')}\n  );\n}\n`;
}

export function svgDimensions(svg: string): { width: number; height: number } | null {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb.every((n) => Number.isFinite(n))) return { width: vb[2]!, height: vb[3]! };
  const w = /<svg[^>]*\swidth="([\d.]+)/.exec(svg)?.[1];
  const h = /<svg[^>]*\sheight="([\d.]+)/.exec(svg)?.[1];
  if (w && h) return { width: Number(w), height: Number(h) };
  return null;
}
