/**
 * Colour parsing, conversion (hex/rgb/hsl/hwb/cmyk/oklch/lab), contrast and
 * palette generation. All maths in sRGB unless stated.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}
export interface HSL {
  h: number;
  s: number;
  l: number;
}
export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

export const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc',
  bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e', coral: '#ff7f50',
  cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b', darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969',
  dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff',
  maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db',
  mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500',
  orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

const HEX_TO_NAME: Record<string, string> = {};
for (const [name, hex] of Object.entries(NAMED_COLORS)) if (!HEX_TO_NAME[hex]) HEX_TO_NAME[hex] = name;

export const clamp = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, n));
const round = (n: number, places = 0): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

function parseNumberToken(token: string, max: number): number {
  const t = token.trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) return (parseFloat(t) / 100) * max;
  return parseFloat(t);
}

/** "50%" → 0.5, "50" → 0.5 (CSS Color 4 allows bare numbers), "0.5" → 0.5. */
function parsePercentish(token: string): number {
  const t = token.trim();
  if (t === 'none') return 0;
  const n = parseFloat(t);
  if (t.endsWith('%') || n > 1) return n / 100;
  return n;
}

function parseHue(token: string): number {
  const t = token.trim().toLowerCase();
  if (t === 'none') return 0;
  const n = parseFloat(t);
  if (t.endsWith('rad')) return (n * 180) / Math.PI;
  if (t.endsWith('turn')) return n * 360;
  if (t.endsWith('grad')) return n * 0.9;
  return n;
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const t = token.trim();
  if (t.endsWith('%')) return clamp(parseFloat(t) / 100);
  return clamp(parseFloat(t));
}

function splitArgs(inner: string): { parts: string[]; alpha?: string } {
  let body = inner.trim();
  let alpha: string | undefined;
  const slash = body.indexOf('/');
  if (slash >= 0) {
    alpha = body.slice(slash + 1).trim();
    body = body.slice(0, slash).trim();
  }
  let parts = body.split(/[\s,]+/).filter(Boolean);
  if (alpha === undefined && parts.length === 4) {
    alpha = parts[3];
    parts = parts.slice(0, 3);
  }
  return { parts, alpha };
}

export function parseColor(input: string): RGB | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED_COLORS[str]) return parseColor(NAMED_COLORS[str]);

  const hex = /^#?([0-9a-f]{3,8})$/.exec(str);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = /^([a-z]+)\((.*)\)$/.exec(str);
  if (!fn) {
    // Bare "255, 0, 0" or "255 0 0"
    const bare = str.split(/[\s,]+/).filter(Boolean);
    if (bare.length === 3 && bare.every((p) => /^\d+(\.\d+)?$/.test(p))) {
      const [r, g, b] = bare.map(Number) as [number, number, number];
      if (r <= 255 && g <= 255 && b <= 255) return { r, g, b, a: 1 };
    }
    return null;
  }
  const name = fn[1]!;
  const { parts, alpha } = splitArgs(fn[2]!);
  if (parts.length < 3) return null;
  const a = parseAlpha(alpha);
  const [p0, p1, p2] = parts as [string, string, string];
  switch (name) {
    case 'rgb':
    case 'rgba':
      return { r: clamp(parseNumberToken(p0, 255), 0, 255), g: clamp(parseNumberToken(p1, 255), 0, 255), b: clamp(parseNumberToken(p2, 255), 0, 255), a };
    case 'hsl':
    case 'hsla': {
      const rgb = hslToRgb({ h: parseHue(p0), s: parsePercentish(p1), l: parsePercentish(p2) });
      return { ...rgb, a };
    }
    case 'hwb': {
      const rgb = hwbToRgb(parseHue(p0), parsePercentish(p1), parsePercentish(p2));
      return { ...rgb, a };
    }
    case 'oklch': {
      const l = p0.includes('%') ? parseFloat(p0) / 100 : parseFloat(p0);
      const c = p1.includes('%') ? (parseFloat(p1) / 100) * 0.4 : parseFloat(p1);
      const rgb = oklchToRgb({ l, c, h: parseHue(p2) });
      return { ...rgb, a };
    }
    case 'oklab': {
      const l = p0.includes('%') ? parseFloat(p0) / 100 : parseFloat(p0);
      const aa = p1.includes('%') ? (parseFloat(p1) / 100) * 0.4 : parseFloat(p1);
      const bb = p2.includes('%') ? (parseFloat(p2) / 100) * 0.4 : parseFloat(p2);
      const rgb = oklabToRgb(l, aa, bb);
      return { ...rgb, a };
    }
    case 'lab': {
      const rgb = labToRgb(parseNumberToken(p0, 100), parseNumberToken(p1, 125), parseNumberToken(p2, 125));
      return { ...rgb, a };
    }
    case 'cmyk':
    case 'device-cmyk': {
      const k = parts[3] !== undefined ? parseNumberToken(parts[3], 1) : 0;
      const rgb = cmykToRgb(parseNumberToken(p0, 1), parseNumberToken(p1, 1), parseNumberToken(p2, 1), k);
      return { ...rgb, a: parts[3] !== undefined && alpha !== undefined ? a : 1 };
    }
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                */
/* -------------------------------------------------------------------------- */

export function rgbToHex(c: RGB, withAlpha = false): string {
  const h = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return withAlpha || c.a < 1 ? `${base}${h(c.a * 255)}` : base;
}

export function rgbToHsl(c: RGB): HSL {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60) % 360, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = clamp(s);
  const lig = clamp(l);
  if (sat === 0) return { r: lig * 255, g: lig * 255, b: lig * 255, a: 1 };
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: f(hue + 1 / 3) * 255, g: f(hue) * 255, b: f(hue - 1 / 3) * 255, a: 1 };
}

export function rgbToHwb(c: RGB): { h: number; w: number; b: number } {
  const { h } = rgbToHsl(c);
  const w = Math.min(c.r, c.g, c.b) / 255;
  const b = 1 - Math.max(c.r, c.g, c.b) / 255;
  return { h, w, b };
}

export function hwbToRgb(h: number, w: number, b: number): RGB {
  let white = clamp(w);
  let black = clamp(b);
  if (white + black > 1) {
    const sum = white + black;
    white /= sum;
    black /= sum;
  }
  const base = hslToRgb({ h, s: 1, l: 0.5 });
  const f = (v: number) => (v / 255) * (1 - white - black) + white;
  return { r: f(base.r) * 255, g: f(base.g) * 255, b: f(base.b) * 255, a: 1 };
}

export function rgbToCmyk(c: RGB): { c: number; m: number; y: number; k: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  return { c: (1 - r - k) / (1 - k), m: (1 - g - k) / (1 - k), y: (1 - b - k) / (1 - k), k };
}

export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  return { r: 255 * (1 - clamp(c)) * (1 - clamp(k)), g: 255 * (1 - clamp(m)) * (1 - clamp(k)), b: 255 * (1 - clamp(y)) * (1 - clamp(k)), a: 1 };
}

// sRGB <-> linear
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklab(c: RGB): { l: number; a: number; b: number } {
  const r = toLinear(c.r / 255);
  const g = toLinear(c.g / 255);
  const b = toLinear(c.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb(L: number, A: number, B: number): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: clamp(fromLinear(r)) * 255, g: clamp(fromLinear(g)) * 255, b: clamp(fromLinear(b)) * 255, a: 1 };
}

export function rgbToOklch(c: RGB): OKLCH {
  const { l, a, b } = rgbToOklab(c);
  const chroma = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c: chroma, h: chroma < 1e-4 ? 0 : h };
}

export function oklchToRgb({ l, c, h }: OKLCH): RGB {
  const rad = (h * Math.PI) / 180;
  return oklabToRgb(l, c * Math.cos(rad), c * Math.sin(rad));
}

export function rgbToLab(c: RGB): { l: number; a: number; b: number } {
  const r = toLinear(c.r / 255);
  const g = toLinear(c.g / 255);
  const b = toLinear(c.b / 255);
  let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function labToRgb(l: number, a: number, b: number): RGB {
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = f(x) * 0.95047;
  y = f(y);
  z = f(z) * 1.08883;
  const r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return { r: clamp(fromLinear(r)) * 255, g: clamp(fromLinear(g)) * 255, b: clamp(fromLinear(bb)) * 255, a: 1 };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export interface ColorFormats {
  hex: string;
  hexAlpha: string;
  rgb: string;
  rgbLegacy: string;
  hsl: string;
  hwb: string;
  cmyk: string;
  oklch: string;
  oklab: string;
  lab: string;
  name: string | null;
  swiftUI: string;
  android: string;
  tailwind: string;
}

export function formatColor(c: RGB): ColorFormats {
  const hsl = rgbToHsl(c);
  const hwb = rgbToHwb(c);
  const cmyk = rgbToCmyk(c);
  const oklch = rgbToOklch(c);
  const oklab = rgbToOklab(c);
  const lab = rgbToLab(c);
  const hex = rgbToHex({ ...c, a: 1 });
  const alpha = c.a < 1 ? ` / ${round(c.a, 3)}` : '';
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  return {
    hex,
    hexAlpha: rgbToHex(c, true),
    rgb: `rgb(${r} ${g} ${b}${alpha})`,
    rgbLegacy: c.a < 1 ? `rgba(${r}, ${g}, ${b}, ${round(c.a, 3)})` : `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${round(hsl.h)} ${round(hsl.s * 100)}% ${round(hsl.l * 100)}%${alpha})`,
    hwb: `hwb(${round(hwb.h)} ${round(hwb.w * 100)}% ${round(hwb.b * 100)}%${alpha})`,
    cmyk: `cmyk(${round(cmyk.c * 100)}%, ${round(cmyk.m * 100)}%, ${round(cmyk.y * 100)}%, ${round(cmyk.k * 100)}%)`,
    oklch: `oklch(${round(oklch.l * 100, 1)}% ${round(oklch.c, 3)} ${round(oklch.h, 1)}${alpha})`,
    oklab: `oklab(${round(oklab.l * 100, 1)}% ${round(oklab.a, 3)} ${round(oklab.b, 3)}${alpha})`,
    lab: `lab(${round(lab.l, 1)} ${round(lab.a, 1)} ${round(lab.b, 1)}${alpha})`,
    name: HEX_TO_NAME[hex] ?? null,
    swiftUI: `Color(red: ${round(c.r / 255, 3)}, green: ${round(c.g / 255, 3)}, blue: ${round(c.b / 255, 3)}${c.a < 1 ? `, opacity: ${round(c.a, 3)}` : ''})`,
    android: `0x${c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0').toUpperCase() : 'FF'}${hex.slice(1).toUpperCase()}`,
    tailwind: `[${hex}]`,
  };
}

/* -------------------------------------------------------------------------- */
/* Contrast & accessibility                                                   */
/* -------------------------------------------------------------------------- */

export function relativeLuminance(c: RGB): number {
  return 0.2126 * toLinear(c.r / 255) + 0.7152 * toLinear(c.g / 255) + 0.0722 * toLinear(c.b / 255);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export interface ContrastReport {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  aaUi: boolean;
  grade: 'Fail' | 'AA Large' | 'AA' | 'AAA';
}

export function contrastReport(fg: RGB, bg: RGB): ContrastReport {
  const composed = fg.a < 1 ? blend(fg, bg) : fg;
  const ratio = contrastRatio(composed, bg);
  const aaNormal = ratio >= 4.5;
  const aaLarge = ratio >= 3;
  const aaaNormal = ratio >= 7;
  const aaaLarge = ratio >= 4.5;
  return { ratio, aaNormal, aaLarge, aaaNormal, aaaLarge, aaUi: ratio >= 3, grade: aaaNormal ? 'AAA' : aaNormal ? 'AA' : aaLarge ? 'AA Large' : 'Fail' };
}

/** APCA-style lightness contrast (Lc), simplified from the 0.98G formula. */
export function apcaContrast(text: RGB, bg: RGB): number {
  const ytxt = apcaLuminance(text);
  const ybg = apcaLuminance(bg);
  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const scale = 1.14;
  const loClip = 0.1;
  const deltaMin = 0.0005;
  const fix = (y: number) => (y > blkThrs ? y : y + (blkThrs - y) ** blkClmp);
  const tx = fix(ytxt);
  const bgy = fix(ybg);
  if (Math.abs(bgy - tx) < deltaMin) return 0;
  let sapc: number;
  if (bgy > tx) sapc = (bgy ** normBG - tx ** normTXT) * scale;
  else sapc = (bgy ** revBG - tx ** revTXT) * scale;
  if (Math.abs(sapc) < loClip) return 0;
  return (sapc > 0 ? sapc - 0.027 : sapc + 0.027) * 100;
}

function apcaLuminance(c: RGB): number {
  const f = (v: number) => (v / 255) ** 2.4;
  return 0.2126729 * f(c.r) + 0.7151522 * f(c.g) + 0.072175 * f(c.b);
}

export function blend(fg: RGB, bg: RGB): RGB {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

/* -------------------------------------------------------------------------- */
/* Palettes                                                                   */
/* -------------------------------------------------------------------------- */

export function adjust(c: RGB, delta: { h?: number; s?: number; l?: number }): RGB {
  const hsl = rgbToHsl(c);
  const next = hslToRgb({ h: hsl.h + (delta.h ?? 0), s: clamp(hsl.s + (delta.s ?? 0)), l: clamp(hsl.l + (delta.l ?? 0)) });
  return { ...next, a: c.a };
}

export type HarmonyName = 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'tetradic' | 'monochromatic';

export function harmonies(c: RGB): Record<HarmonyName, RGB[]> {
  const rot = (deg: number) => adjust(c, { h: deg });
  return {
    complementary: [c, rot(180)],
    analogous: [rot(-30), c, rot(30)],
    triadic: [c, rot(120), rot(240)],
    'split-complementary': [c, rot(150), rot(210)],
    tetradic: [c, rot(90), rot(180), rot(270)],
    monochromatic: [-0.3, -0.15, 0, 0.15, 0.3].map((l) => adjust(c, { l })),
  };
}

/** Generate a Tailwind-style 50–950 scale in OKLCH keeping the hue constant. */
export function tonalScale(c: RGB): Array<{ step: number; color: RGB }> {
  const { c: chroma, h } = rgbToOklch(c);
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const lightness = [0.977, 0.945, 0.885, 0.805, 0.715, 0.62, 0.53, 0.44, 0.36, 0.29, 0.22];
  return steps.map((step, i) => {
    const l = lightness[i]!;
    // Reduce chroma at the extremes to stay in gamut and look natural.
    const factor = 1 - Math.abs(l - 0.62) * 1.2;
    return { step, color: oklchToRgb({ l, c: chroma * clamp(factor, 0.15, 1), h }) };
  });
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  const k = clamp(t);
  const out = oklabToRgb(la.l + (lb.l - la.l) * k, la.a + (lb.a - la.a) * k, la.b + (lb.b - la.b) * k);
  return { ...out, a: a.a + (b.a - a.a) * k };
}

export function randomColor(): RGB {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return { r: bytes[0]!, g: bytes[1]!, b: bytes[2]!, a: 1 };
}

export function isDark(c: RGB): boolean {
  return relativeLuminance(c) < 0.35;
}

export function colorDistance(a: RGB, b: RGB): number {
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  return Math.sqrt((la.l - lb.l) ** 2 + (la.a - lb.a) ** 2 + (la.b - lb.b) ** 2);
}

export function nearestNamedColor(c: RGB): { name: string; hex: string; distance: number } {
  let best = { name: 'black', hex: '#000000', distance: Infinity };
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    const d = colorDistance(c, parseColor(hex)!);
    if (d < best.distance) best = { name, hex, distance: d };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Colour blindness simulation (Machado et al. 2009 matrices)                */
/* -------------------------------------------------------------------------- */

const CVD_MATRICES: Record<string, number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

export type ColorVisionDeficiency = keyof typeof CVD_MATRICES;

export const CVD_TYPES: Array<{ id: ColorVisionDeficiency; label: string; prevalence: string }> = [
  { id: 'protanopia', label: 'Protanopia', prevalence: 'red-blind · ~1% of men' },
  { id: 'deuteranopia', label: 'Deuteranopia', prevalence: 'green-blind · ~1% of men' },
  { id: 'tritanopia', label: 'Tritanopia', prevalence: 'blue-blind · rare' },
  { id: 'achromatopsia', label: 'Achromatopsia', prevalence: 'total colour blindness' },
];

export function simulateCvd(c: RGB, type: ColorVisionDeficiency): RGB {
  const m = CVD_MATRICES[type]!;
  const r = toLinear(c.r / 255);
  const g = toLinear(c.g / 255);
  const b = toLinear(c.b / 255);
  const rr = m[0]! * r + m[1]! * g + m[2]! * b;
  const gg = m[3]! * r + m[4]! * g + m[5]! * b;
  const bb = m[6]! * r + m[7]! * g + m[8]! * b;
  return { r: clamp(fromLinear(clamp(rr))) * 255, g: clamp(fromLinear(clamp(gg))) * 255, b: clamp(fromLinear(clamp(bb))) * 255, a: c.a };
}
