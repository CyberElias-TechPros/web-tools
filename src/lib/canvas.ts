/**
 * Shared browser-canvas helpers for the image tools: decoding, drawing,
 * encoding, cropping, rotating, flipping, pixel access and SVG rasterising.
 * DOM-only — never imported by unit-tested pure logic.
 */

export type DecodedImage = ImageBitmap | HTMLImageElement;

export interface Size {
  width: number;
  height: number;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new Error('Could not obtain a 2D drawing context.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

export async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`“${(file as File).name ?? 'This file'}” could not be decoded as an image. HEIC and RAW formats are not supported by browsers.`));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function sizeOf(source: DecodedImage | HTMLCanvasElement): Size {
  if ('naturalWidth' in source) return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  return { width: source.width, height: source.height };
}

export function releaseImage(source: DecodedImage): void {
  if ('close' in source && typeof source.close === 'function') source.close();
}

/** Multi-step downscale for quality; direct draw when upscaling. */
export function drawToCanvas(source: DecodedImage | HTMLCanvasElement, target: Size, background: string | null = null): HTMLCanvasElement {
  const natural = sizeOf(source);
  let cur: CanvasImageSource = source;
  let w = natural.width;
  let h = natural.height;
  while (w / 2 > target.width && h / 2 > target.height) {
    const nw = Math.max(target.width, Math.round(w / 2));
    const nh = Math.max(target.height, Math.round(h / 2));
    const c = createCanvas(nw, nh);
    context2d(c).drawImage(cur, 0, 0, w, h, 0, 0, nw, nh);
    cur = c;
    w = nw;
    h = nh;
  }
  const canvas = createCanvas(target.width, target.height);
  const ctx = context2d(canvas);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(cur, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`The browser could not encode ${type}.`))), type, quality);
  });
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function supportsEncoding(type: string): boolean {
  try {
    const c = createCanvas(2, 2);
    return c.toDataURL(type).startsWith(`data:${type}`);
  } catch {
    return false;
  }
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropCanvas(source: DecodedImage | HTMLCanvasElement, rect: CropRect, output?: Size): HTMLCanvasElement {
  const size = output ?? { width: rect.width, height: rect.height };
  const canvas = createCanvas(size.width, size.height);
  context2d(canvas).drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function transformCanvas(source: DecodedImage | HTMLCanvasElement, options: { rotate?: 0 | 90 | 180 | 270; flipX?: boolean; flipY?: boolean }): HTMLCanvasElement {
  const { width, height } = sizeOf(source);
  const rotate = options.rotate ?? 0;
  const swap = rotate === 90 || rotate === 270;
  const canvas = createCanvas(swap ? height : width, swap ? width : height);
  const ctx = context2d(canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
  ctx.drawImage(source, -width / 2, -height / 2);
  return canvas;
}

export function pixelsOf(source: DecodedImage | HTMLCanvasElement, maxSide = 400): ImageData {
  const { width, height } = sizeOf(source);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = drawToCanvas(source, { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
  return context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

export async function rasterizeSvg(svg: string, size: Size, background: string | null = null): Promise<HTMLCanvasElement> {
  const withSize = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const blob = new Blob([withSize], { type: 'image/svg+xml;charset=utf-8' });
  const img = await decodeImage(blob);
  const canvas = createCanvas(size.width, size.height);
  const ctx = context2d(canvas);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function fitWithin(size: Size, max: Size): Size {
  const scale = Math.min(max.width / size.width, max.height / size.height, 1);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

export function coverSize(size: Size, target: Size): CropRect {
  const scale = Math.max(target.width / size.width, target.height / size.height);
  const w = target.width / scale;
  const h = target.height / scale;
  return { x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',') as [string, string];
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

export interface PlaceholderOptions {
  width: number;
  height: number;
  background: string;
  foreground: string;
  text?: string;
  fontSize?: number;
  pattern?: 'none' | 'grid' | 'diagonal' | 'dots';
  format: 'svg' | 'png' | 'jpeg';
}

export function placeholderSvg(o: PlaceholderOptions): string {
  const text = o.text ?? `${o.width} × ${o.height}`;
  const fontSize = o.fontSize ?? Math.max(12, Math.round(Math.min(o.width, o.height) / 8));
  let pattern = '';
  if (o.pattern === 'grid') pattern = `<defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0v24" fill="none" stroke="${o.foreground}" stroke-opacity=".15"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>`;
  else if (o.pattern === 'diagonal') pattern = `<defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="16" stroke="${o.foreground}" stroke-opacity=".12" stroke-width="6"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>`;
  else if (o.pattern === 'dots') pattern = `<defs><pattern id="p" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1.6" fill="${o.foreground}" fill-opacity=".2"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}"><rect width="100%" height="100%" fill="${o.background}"/>${pattern}<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" font-weight="600" fill="${o.foreground}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`;
}

/**
 * Re-encode an arbitrary browser-decodable image (WebP, GIF, BMP, SVG, AVIF…)
 * as PNG so it can be embedded in a PDF. Returns null when the browser cannot
 * decode the format.
 */
export async function rasterizeToPng(data: Uint8Array, type: string): Promise<{ data: Uint8Array; type: 'image/png' } | null> {
  try {
    const blob = new Blob([data as BlobPart], { type });
    const image = await decodeImage(blob);
    const canvas = drawToCanvas(image, sizeOf(image));
    releaseImage(image);
    const png = await canvasToBlob(canvas, 'image/png');
    return { data: await blobToBytes(png), type: 'image/png' };
  } catch {
    return null;
  }
}
