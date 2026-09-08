/**
 * Deterministic SVG wave, blob and pattern generation.
 *
 * All generators take an explicit numeric seed and use a small PRNG, so a shape
 * the user likes can be reproduced exactly from its seed — which is what makes
 * the "regenerate" button safe to press.
 */

/** Mulberry32: tiny, fast, good enough distribution for visual randomness. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, precision = 2): number =>
  Math.round(n * 10 ** precision) / 10 ** precision;

// --- waves ---------------------------------------------------------------------

export type WaveEdge = 'top' | 'bottom';

export interface WaveOptions {
  width: number;
  height: number;
  /** Number of crests across the width. */
  complexity: number;
  /** 0..1 — how tall the crests are relative to the height. */
  amplitude: number;
  /** 0..1 — how irregular successive crests are. */
  variance: number;
  seed: number;
  edge: WaveEdge;
  /** Flip the wave horizontally. */
  flipX: boolean;
  /** Smooth (cubic) vs angular (linear) crests. */
  smooth: boolean;
}

export const defaultWaveOptions: WaveOptions = {
  width: 1440,
  height: 320,
  complexity: 4,
  amplitude: 0.5,
  variance: 0.35,
  seed: 12345,
  edge: 'bottom',
  flipX: false,
  smooth: true,
};

/** Build the `d` attribute for a closed wave shape. */
export function generateWavePath(options: WaveOptions): string {
  const { width, height, complexity, amplitude, variance, seed, edge, smooth, flipX } = options;
  const rand = createRandom(seed);
  const points = Math.max(2, Math.round(complexity) * 2);
  const step = width / points;
  const midY = height * (edge === 'bottom' ? 0.5 : 0.5);
  const maxAmp = height * 0.5 * Math.max(0.02, amplitude);

  const nodes: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= points; i++) {
    const x = i * step;
    const direction = i % 2 === 0 ? 1 : -1;
    const jitter = 1 - variance * rand();
    const y = midY + direction * maxAmp * jitter;
    nodes.push({ x: round(flipX ? width - x : x), y: round(y) });
  }
  if (flipX) nodes.reverse();

  let d = `M 0 ${round(nodes[0]!.y)}`;
  if (smooth) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i]!;
      const next = nodes[i + 1]!;
      const cx = round((current.x + next.x) / 2);
      d += ` C ${cx} ${current.y}, ${cx} ${next.y}, ${round(next.x)} ${next.y}`;
    }
  } else {
    for (let i = 1; i < nodes.length; i++) {
      d += ` L ${round(nodes[i]!.x)} ${round(nodes[i]!.y)}`;
    }
  }

  // Close the shape against the chosen edge.
  if (edge === 'bottom') d += ` L ${width} ${height} L 0 ${height} Z`;
  else d += ` L ${width} 0 L 0 0 Z`;

  return d;
}

// --- blobs ----------------------------------------------------------------------

export interface BlobOptions {
  size: number;
  /** Number of control points around the circumference. */
  points: number;
  /** 0..1 — how far each point can deviate from a perfect circle. */
  randomness: number;
  seed: number;
  /** 0..1 — corner smoothing of the cubic handles. */
  smoothing: number;
}

export const defaultBlobOptions: BlobOptions = {
  size: 500,
  points: 6,
  randomness: 0.35,
  seed: 4242,
  smoothing: 1,
};

export function generateBlobPath(options: BlobOptions): string {
  const { size, randomness, seed, smoothing } = options;
  const count = Math.max(3, Math.min(24, Math.round(options.points)));
  const rand = createRandom(seed);
  const cx = size / 2;
  const cy = size / 2;
  const baseRadius = size * 0.38;

  const nodes = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const radius = baseRadius * (1 - randomness / 2 + rand() * randomness);
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });

  // Catmull-Rom -> cubic Bézier so the outline is smooth and closed.
  const tension = (smoothing * 1) / 6;
  let d = `M ${round(nodes[0]!.x)} ${round(nodes[0]!.y)}`;
  for (let i = 0; i < count; i++) {
    const p0 = nodes[(i - 1 + count) % count]!;
    const p1 = nodes[i]!;
    const p2 = nodes[(i + 1) % count]!;
    const p3 = nodes[(i + 2) % count]!;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
  }
  return d + ' Z';
}

// --- fills ------------------------------------------------------------------------

export type FillMode = 'solid' | 'linear' | 'radial';

export interface FillOptions {
  mode: FillMode;
  color1: string;
  color2: string;
  /** Degrees, for linear gradients. */
  angle: number;
  opacity: number;
}

export const defaultFillOptions: FillOptions = {
  mode: 'linear',
  color1: '#6366f1',
  color2: '#ec4899',
  angle: 90,
  opacity: 1,
};

function gradientCoords(angle: number): { x1: string; y1: string; x2: string; y2: string } {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = round(50 + Math.cos(rad + Math.PI) * 50, 1);
  const y1 = round(50 + Math.sin(rad + Math.PI) * 50, 1);
  const x2 = round(50 + Math.cos(rad) * 50, 1);
  const y2 = round(50 + Math.sin(rad) * 50, 1);
  return { x1: `${x1}%`, y1: `${y1}%`, x2: `${x2}%`, y2: `${y2}%` };
}

/** Escape a value for safe interpolation into an XML attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildDefs(fill: FillOptions, id: string): { defs: string; fillRef: string } {
  if (fill.mode === 'solid') return { defs: '', fillRef: escapeXml(fill.color1) };
  if (fill.mode === 'radial') {
    return {
      defs: `  <defs>
    <radialGradient id="${id}" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="${escapeXml(fill.color1)}" />
      <stop offset="100%" stop-color="${escapeXml(fill.color2)}" />
    </radialGradient>
  </defs>\n`,
      fillRef: `url(#${id})`,
    };
  }
  const c = gradientCoords(fill.angle);
  return {
    defs: `  <defs>
    <linearGradient id="${id}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">
      <stop offset="0%" stop-color="${escapeXml(fill.color1)}" />
      <stop offset="100%" stop-color="${escapeXml(fill.color2)}" />
    </linearGradient>
  </defs>\n`,
    fillRef: `url(#${id})`,
  };
}

export interface SvgDocumentOptions {
  width: number;
  height: number;
  path: string;
  fill: FillOptions;
  /** Extra stacked layers rendered behind the main path at reduced opacity. */
  layers?: Array<{ path: string; opacity: number }>;
  title: string;
}

export function buildSvgDocument(options: SvgDocumentOptions): string {
  const { width, height, path, fill, layers = [], title } = options;
  const id = 'grad';
  const { defs, fillRef } = buildDefs(fill, id);
  const layerMarkup = layers
    .map(
      (layer) =>
        `  <path d="${layer.path}" fill="${fillRef}" opacity="${round(layer.opacity, 3)}" />`,
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
${defs}${layerMarkup ? layerMarkup + '\n' : ''}  <path d="${path}" fill="${fillRef}" opacity="${round(fill.opacity, 3)}" />
</svg>
`;
}

/** Data-URI form, ready to paste into a CSS `background-image`. */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg.replace(/\n\s*/g, ' ').trim())
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')
    .replace(/%22/g, "'");
  return `data:image/svg+xml,${encoded}`;
}

export function svgToCss(svg: string): string {
  return `background-image: url("${svgToDataUri(svg)}");
background-repeat: no-repeat;
background-size: cover;`;
}

export function svgToJsx(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/\b([a-z]+)-([a-z])/g, (match, a: string, b: string) => {
      // Convert kebab-case attributes to camelCase, leaving CSS-ish values alone.
      if (['data', 'aria'].includes(a)) return match;
      return `${a}${b.toUpperCase()}`;
    })
    .replace(/class=/g, 'className=');
}
