/** Browser-side file download and clipboard helpers with real error handling. */

/** Trigger a download of a Blob, cleaning up the object URL afterwards. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename(filename);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Safari needs the URL alive briefly after the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/**
 * Copy to the clipboard, falling back to a hidden textarea when the async
 * Clipboard API is unavailable or blocked (non-secure contexts, Firefox with
 * dom.events.asyncClipboard disabled, some in-app browsers).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText && window.isSecureContext) {
      return await navigator.clipboard.readText();
    }
  } catch {
    /* permission denied or unsupported */
  }
  return null;
}

function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Read a File as UTF-8 text, rejecting with a message worth showing a user. */
export function readFileAsText(file: File, maxBytes = 25 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) {
    return Promise.reject(
      new Error(
        `“${file.name}” is too large: ${describeSize(file.size)}. The limit for text input is ${describeSize(maxBytes)}.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`));
    reader.onabort = () => reject(new Error(`Reading “${file.name}” was cancelled.`));
    reader.readAsText(file, 'utf-8');
  });
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`));
    reader.readAsArrayBuffer(file);
  });
}

/** Names Windows refuses to create, regardless of extension. */
const RESERVED_NAMES =
  /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * A filesystem-safe filename derived from arbitrary text. Illegal characters
 * become dashes, path separators can never survive, and an over-long name is
 * truncated from the middle of the stem so the extension is preserved.
 */
export function safeFilename(name: string, fallback = 'download'): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!cleaned) return fallback;

  const dot = cleaned.lastIndexOf('.');
  const hasExt = dot > 0 && dot < cleaned.length - 1 && cleaned.length - dot <= 12;
  let stem = hasExt ? cleaned.slice(0, dot) : cleaned;
  const ext = hasExt ? cleaned.slice(dot) : '';

  if (RESERVED_NAMES.test(stem)) stem = `${stem}-file`;

  const MAX = 120;
  if (stem.length + ext.length > MAX) stem = stem.slice(0, Math.max(1, MAX - ext.length));

  const result = `${stem}${ext}`.replace(/^[-.]+|[-]+$/g, '');
  return result || fallback;
}

/** A sortable, filename-safe local timestamp: `YYYYMMDD-HHMMSS`. */
export function timestampSuffix(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
