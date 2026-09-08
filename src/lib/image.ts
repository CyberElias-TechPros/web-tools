/**
 * In-browser image compression and resizing.
 *
 * Decoding uses `createImageBitmap` (off the main thread where supported) and
 * encoding uses OffscreenCanvas when available, falling back to a regular
 * canvas. Nothing is ever uploaded — the file never leaves the device.
 */

export type OutputFormat = 'image/jpeg' | 'image/webp' | 'image/png' | 'original';

export type ResizeMode = 'none' | 'fit' | 'exact-width' | 'exact-height' | 'percentage' | 'max-dimension';

export interface CompressOptions {
  format: OutputFormat;
  /** 0..1, ignored for PNG. */
  quality: number;
  resizeMode: ResizeMode;
  maxWidth: number;
  maxHeight: number;
  percentage: number;
  /** Never scale an image up beyond its natural size. */
  preventUpscale: boolean;
  /** Flatten transparency onto this colour when the target has no alpha. */
  backgroundColor: string;
  /** Try progressively lower quality until the file fits this size (KB). 0 = off. */
  targetSizeKb: number;
}

export const defaultCompressOptions: CompressOptions = {
  format: 'image/webp',
  quality: 0.82,
  resizeMode: 'max-dimension',
  maxWidth: 1920,
  maxHeight: 1920,
  percentage: 100,
  preventUpscale: true,
  backgroundColor: '#ffffff',
  targetSizeKb: 0,
};

export const SUPPORTED_INPUT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
];

/** 100 MB per file: beyond this, decoding reliably OOMs mobile Safari. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_PIXELS = 50_000_000;

export interface ImageDimensions {
  width: number;
  height: number;
}

export function computeTargetSize(
  natural: ImageDimensions,
  options: CompressOptions,
): ImageDimensions {
  const { width, height } = natural;
  let target: ImageDimensions;

  switch (options.resizeMode) {
    case 'none':
      return { width, height };
    case 'percentage': {
      const scale = Math.max(1, Math.min(400, options.percentage)) / 100;
      target = { width: Math.round(width * scale), height: Math.round(height * scale) };
      break;
    }
    case 'exact-width': {
      const w = Math.max(1, options.maxWidth);
      target = { width: w, height: Math.round((height / width) * w) };
      break;
    }
    case 'exact-height': {
      const h = Math.max(1, options.maxHeight);
      target = { width: Math.round((width / height) * h), height: h };
      break;
    }
    case 'max-dimension': {
      const limit = Math.max(1, Math.max(options.maxWidth, options.maxHeight));
      const longest = Math.max(width, height);
      if (longest <= limit) return { width, height };
      const scale = limit / longest;
      target = { width: Math.round(width * scale), height: Math.round(height * scale) };
      break;
    }
    case 'fit':
    default: {
      const scale = Math.min(
        Math.max(1, options.maxWidth) / width,
        Math.max(1, options.maxHeight) / height,
      );
      const applied = options.preventUpscale ? Math.min(1, scale) : scale;
      target = { width: Math.round(width * applied), height: Math.round(height * applied) };
      break;
    }
  }

  if (options.preventUpscale) {
    if (target.width > width || target.height > height) return { width, height };
  }
  return {
    width: Math.max(1, target.width),
    height: Math.max(1, target.height),
  };
}

export function resolveOutputType(inputType: string, format: OutputFormat): string {
  if (format !== 'original') return format;
  // Formats a canvas cannot re-encode losslessly fall back to PNG.
  if (['image/jpeg', 'image/png', 'image/webp'].includes(inputType)) return inputType;
  return 'image/png';
}

export function extensionForType(type: string): string {
  switch (type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
    case 'image/avif':
      return 'avif';
    default:
      return 'img';
  }
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  type: string;
  /** Number of encode passes used (>1 when hitting a target size). */
  passes: number;
}

interface CanvasLike {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

function createCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: CanvasLike, type: string, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality });
  }
  const el = canvas as unknown as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    el.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser failed to encode the image.'))),
      type,
      quality,
    );
  });
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* SVG and some AVIF files need the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This file could not be decoded as an image.'));
      img.src = url;
    });
  } finally {
    // Revoked on the next tick so the decoded image is retained.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function dimensionsOf(source: ImageBitmap | HTMLImageElement): ImageDimensions {
  if ('naturalWidth' in source) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }
  return { width: source.width, height: source.height };
}

/**
 * Downscale in halving steps.
 * A single large drawImage aliases badly; halving repeatedly approximates a
 * proper box filter and looks dramatically better at 3x+ reductions.
 */
function drawScaled(
  source: ImageBitmap | HTMLImageElement,
  target: ImageDimensions,
  backgroundColor: string | null,
): CanvasLike {
  const natural = dimensionsOf(source);
  let currentWidth = natural.width;
  let currentHeight = natural.height;
  let current: CanvasLike | null = null;

  const makeContext = (w: number, h: number): { canvas: CanvasLike; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not obtain a 2D drawing context.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { canvas, ctx };
  };

  while (currentWidth / 2 > target.width && currentHeight / 2 > target.height) {
    const nextWidth = Math.max(target.width, Math.round(currentWidth / 2));
    const nextHeight = Math.max(target.height, Math.round(currentHeight / 2));
    const { canvas, ctx } = makeContext(nextWidth, nextHeight);
    ctx.drawImage(
      (current ?? source) as CanvasImageSource,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );
    current = canvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const { canvas, ctx } = makeContext(target.width, target.height);
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, target.width, target.height);
  }
  ctx.drawImage(
    (current ?? source) as CanvasImageSource,
    0,
    0,
    currentWidth,
    currentHeight,
    0,
    0,
    target.width,
    target.height,
  );
  return canvas;
}

/** Compress and/or resize a single image entirely on the client. */
export async function compressImage(
  file: File,
  options: Partial<CompressOptions> = {},
): Promise<CompressResult> {
  const opts = { ...defaultCompressOptions, ...options };

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the ${MAX_FILE_BYTES / 1024 / 1024} MB limit for in-browser processing.`,
    );
  }

  const source = await decode(file);
  const natural = dimensionsOf(source);
  if (natural.width === 0 || natural.height === 0) {
    throw new Error('The image reported zero dimensions and cannot be processed.');
  }
  if (natural.width * natural.height > MAX_PIXELS) {
    throw new Error(
      `This image is ${(natural.width * natural.height / 1e6).toFixed(0)} megapixels, above the ${MAX_PIXELS / 1e6} MP limit.`,
    );
  }

  const target = computeTargetSize(natural, opts);
  const outputType = resolveOutputType(file.type, opts.format);
  const needsBackground = outputType === 'image/jpeg';
  const canvas = drawScaled(source, target, needsBackground ? opts.backgroundColor : null);

  if ('close' in source && typeof source.close === 'function') source.close();

  const isLossless = outputType === 'image/png';
  let quality = isLossless ? 1 : Math.max(0.05, Math.min(1, opts.quality));
  let blob = await canvasToBlob(canvas, outputType, quality);
  let passes = 1;

  // Binary-search the quality when the user asked for a target file size.
  if (opts.targetSizeKb > 0 && !isLossless) {
    const targetBytes = opts.targetSizeKb * 1024;
    let low = 0.05;
    let high = quality;
    for (let i = 0; i < 7 && blob.size > targetBytes; i++) {
      quality = (low + high) / 2;
       
      const candidate = await canvasToBlob(canvas, outputType, quality);
      passes++;
      if (candidate.size > targetBytes) high = quality;
      else low = quality;
      blob = candidate;
      if (Math.abs(candidate.size - targetBytes) / targetBytes < 0.05) break;
    }
  }

  return { blob, width: target.width, height: target.height, type: outputType, passes };
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 100);
}
