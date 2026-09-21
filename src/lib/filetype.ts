/**
 * File type detection from magic bytes, hex dump rendering and basic
 * text-encoding sniffing (BOM, UTF-8 validity, line endings).
 */

export interface FileSignature {
  mime: string;
  extension: string;
  description: string;
  category: 'image' | 'video' | 'audio' | 'archive' | 'document' | 'font' | 'executable' | 'data' | 'text' | 'other';
}

interface Magic extends FileSignature {
  offset: number;
  bytes: number[] | string;
  check?: (b: Uint8Array) => boolean;
}

const MAGICS: Magic[] = [
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png', extension: 'png', description: 'PNG image', category: 'image' },
  { offset: 0, bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg', extension: 'jpg', description: 'JPEG image', category: 'image' },
  { offset: 0, bytes: 'GIF87a', mime: 'image/gif', extension: 'gif', description: 'GIF image (87a)', category: 'image' },
  { offset: 0, bytes: 'GIF89a', mime: 'image/gif', extension: 'gif', description: 'GIF image (89a)', category: 'image' },
  { offset: 0, bytes: 'RIFF', mime: 'image/webp', extension: 'webp', description: 'WebP image', category: 'image', check: (b) => ascii(b, 8, 12) === 'WEBP' },
  { offset: 0, bytes: 'RIFF', mime: 'audio/wav', extension: 'wav', description: 'WAV audio', category: 'audio', check: (b) => ascii(b, 8, 12) === 'WAVE' },
  { offset: 0, bytes: 'RIFF', mime: 'video/avi', extension: 'avi', description: 'AVI video', category: 'video', check: (b) => ascii(b, 8, 12) === 'AVI ' },
  { offset: 0, bytes: [0x42, 0x4d], mime: 'image/bmp', extension: 'bmp', description: 'Bitmap image', category: 'image' },
  { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00], mime: 'image/tiff', extension: 'tif', description: 'TIFF image (little-endian)', category: 'image' },
  { offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a], mime: 'image/tiff', extension: 'tif', description: 'TIFF image (big-endian)', category: 'image' },
  { offset: 0, bytes: [0x00, 0x00, 0x01, 0x00], mime: 'image/x-icon', extension: 'ico', description: 'Windows icon', category: 'image' },
  { offset: 0, bytes: [0x00, 0x00, 0x02, 0x00], mime: 'image/x-icon', extension: 'cur', description: 'Windows cursor', category: 'image' },
  { offset: 4, bytes: 'ftypavif', mime: 'image/avif', extension: 'avif', description: 'AVIF image', category: 'image' },
  { offset: 4, bytes: 'ftypheic', mime: 'image/heic', extension: 'heic', description: 'HEIC image', category: 'image' },
  { offset: 4, bytes: 'ftypheix', mime: 'image/heic', extension: 'heic', description: 'HEIC image', category: 'image' },
  { offset: 4, bytes: 'ftypmif1', mime: 'image/heif', extension: 'heif', description: 'HEIF image', category: 'image' },
  { offset: 4, bytes: 'ftypqt  ', mime: 'video/quicktime', extension: 'mov', description: 'QuickTime video', category: 'video' },
  { offset: 4, bytes: 'ftypM4A', mime: 'audio/mp4', extension: 'm4a', description: 'MPEG-4 audio', category: 'audio' },
  { offset: 4, bytes: 'ftyp', mime: 'video/mp4', extension: 'mp4', description: 'MPEG-4 video', category: 'video' },
  { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3], mime: 'video/webm', extension: 'webm', description: 'WebM / Matroska video', category: 'video' },
  { offset: 0, bytes: 'FLV', mime: 'video/x-flv', extension: 'flv', description: 'Flash video', category: 'video' },
  { offset: 0, bytes: 'ID3', mime: 'audio/mpeg', extension: 'mp3', description: 'MP3 audio (ID3 tag)', category: 'audio' },
  { offset: 0, bytes: [0xff, 0xfb], mime: 'audio/mpeg', extension: 'mp3', description: 'MP3 audio', category: 'audio' },
  { offset: 0, bytes: [0xff, 0xf3], mime: 'audio/mpeg', extension: 'mp3', description: 'MP3 audio', category: 'audio' },
  { offset: 0, bytes: [0xff, 0xf2], mime: 'audio/mpeg', extension: 'mp3', description: 'MP3 audio', category: 'audio' },
  { offset: 0, bytes: 'OggS', mime: 'audio/ogg', extension: 'ogg', description: 'Ogg container', category: 'audio' },
  { offset: 0, bytes: 'fLaC', mime: 'audio/flac', extension: 'flac', description: 'FLAC audio', category: 'audio' },
  { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip', extension: 'zip', description: 'ZIP archive', category: 'archive' },
  { offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06], mime: 'application/zip', extension: 'zip', description: 'ZIP archive (empty)', category: 'archive' },
  { offset: 0, bytes: [0x1f, 0x8b], mime: 'application/gzip', extension: 'gz', description: 'GZIP archive', category: 'archive' },
  { offset: 0, bytes: 'BZh', mime: 'application/x-bzip2', extension: 'bz2', description: 'BZIP2 archive', category: 'archive' },
  { offset: 0, bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], mime: 'application/x-xz', extension: 'xz', description: 'XZ archive', category: 'archive' },
  { offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], mime: 'application/x-7z-compressed', extension: '7z', description: '7-Zip archive', category: 'archive' },
  { offset: 0, bytes: 'Rar!', mime: 'application/vnd.rar', extension: 'rar', description: 'RAR archive', category: 'archive' },
  { offset: 257, bytes: 'ustar', mime: 'application/x-tar', extension: 'tar', description: 'TAR archive', category: 'archive' },
  { offset: 0, bytes: [0x28, 0xb5, 0x2f, 0xfd], mime: 'application/zstd', extension: 'zst', description: 'Zstandard archive', category: 'archive' },
  { offset: 0, bytes: '%PDF', mime: 'application/pdf', extension: 'pdf', description: 'PDF document', category: 'document' },
  { offset: 0, bytes: '{\\rtf', mime: 'application/rtf', extension: 'rtf', description: 'Rich Text document', category: 'document' },
  { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], mime: 'application/msword', extension: 'doc', description: 'Legacy Office document (OLE2: .doc/.xls/.ppt/.msg)', category: 'document' },
  { offset: 0, bytes: '%!PS', mime: 'application/postscript', extension: 'ps', description: 'PostScript', category: 'document' },
  { offset: 0, bytes: 'SQLite format 3', mime: 'application/vnd.sqlite3', extension: 'sqlite', description: 'SQLite database', category: 'data' },
  { offset: 0, bytes: 'wOFF', mime: 'font/woff', extension: 'woff', description: 'WOFF font', category: 'font' },
  { offset: 0, bytes: 'wOF2', mime: 'font/woff2', extension: 'woff2', description: 'WOFF2 font', category: 'font' },
  { offset: 0, bytes: 'OTTO', mime: 'font/otf', extension: 'otf', description: 'OpenType font (CFF)', category: 'font' },
  { offset: 0, bytes: [0x00, 0x01, 0x00, 0x00, 0x00], mime: 'font/ttf', extension: 'ttf', description: 'TrueType font', category: 'font' },
  { offset: 0, bytes: 'ttcf', mime: 'font/collection', extension: 'ttc', description: 'TrueType collection', category: 'font' },
  { offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46], mime: 'application/x-elf', extension: 'elf', description: 'ELF executable (Linux)', category: 'executable' },
  { offset: 0, bytes: 'MZ', mime: 'application/vnd.microsoft.portable-executable', extension: 'exe', description: 'Windows executable / DLL', category: 'executable' },
  { offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe], mime: 'application/x-mach-binary', extension: 'macho', description: 'Mach-O executable (64-bit)', category: 'executable' },
  { offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe], mime: 'application/x-mach-binary', extension: 'macho', description: 'Mach-O universal binary / Java class', category: 'executable' },
  { offset: 0, bytes: [0x00, 0x61, 0x73, 0x6d], mime: 'application/wasm', extension: 'wasm', description: 'WebAssembly module', category: 'executable' },
  { offset: 0, bytes: 'dex\n', mime: 'application/octet-stream', extension: 'dex', description: 'Android Dalvik executable', category: 'executable' },
  { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf', extension: 'pdf', description: 'PDF document', category: 'document' },
  { offset: 0, bytes: 'PAR1', mime: 'application/vnd.apache.parquet', extension: 'parquet', description: 'Apache Parquet', category: 'data' },
  { offset: 0, bytes: [0x08, 0x00, 0x00, 0x00], mime: 'application/octet-stream', extension: 'bin', description: 'Binary data', category: 'other' },
  { offset: 0, bytes: [0xef, 0xbb, 0xbf], mime: 'text/plain', extension: 'txt', description: 'UTF-8 text with BOM', category: 'text' },
  { offset: 0, bytes: [0xff, 0xfe], mime: 'text/plain', extension: 'txt', description: 'UTF-16 LE text', category: 'text' },
  { offset: 0, bytes: [0xfe, 0xff], mime: 'text/plain', extension: 'txt', description: 'UTF-16 BE text', category: 'text' },
  { offset: 0, bytes: '#!', mime: 'text/x-script', extension: 'sh', description: 'Script with shebang', category: 'text' },
  { offset: 0, bytes: '<?xml', mime: 'application/xml', extension: 'xml', description: 'XML document', category: 'text' },
  { offset: 0, bytes: '<svg', mime: 'image/svg+xml', extension: 'svg', description: 'SVG image', category: 'image' },
  { offset: 0, bytes: '<!DOCTYPE html', mime: 'text/html', extension: 'html', description: 'HTML document', category: 'text' },
  { offset: 0, bytes: '<!doctype html', mime: 'text/html', extension: 'html', description: 'HTML document', category: 'text' },
  { offset: 0, bytes: '<html', mime: 'text/html', extension: 'html', description: 'HTML document', category: 'text' },
  { offset: 0, bytes: '-----BEGIN ', mime: 'application/x-pem-file', extension: 'pem', description: 'PEM certificate / key', category: 'data' },
  { offset: 0, bytes: 'BEGIN:VCARD', mime: 'text/vcard', extension: 'vcf', description: 'vCard contact', category: 'text' },
  { offset: 0, bytes: 'BEGIN:VCALENDAR', mime: 'text/calendar', extension: 'ics', description: 'iCalendar', category: 'text' },
  { offset: 0, bytes: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00], mime: 'application/x-ms-shortcut', extension: 'lnk', description: 'Windows shortcut', category: 'other' },
  { offset: 0, bytes: 'ISc(', mime: 'application/octet-stream', extension: 'cab', description: 'InstallShield cabinet', category: 'archive' },
  { offset: 0, bytes: 'MSCF', mime: 'application/vnd.ms-cab-compressed', extension: 'cab', description: 'Microsoft cabinet', category: 'archive' },
  { offset: 0, bytes: [0xed, 0xab, 0xee, 0xdb], mime: 'application/x-rpm', extension: 'rpm', description: 'RPM package', category: 'archive' },
  { offset: 0, bytes: '!<arch>', mime: 'application/x-archive', extension: 'deb', description: 'Unix archive (.deb/.a)', category: 'archive' },
  { offset: 0, bytes: 'GLTF', mime: 'model/gltf-binary', extension: 'glb', description: 'glTF binary model', category: 'other' },
  { offset: 0, bytes: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20], mime: 'image/jp2', extension: 'jp2', description: 'JPEG 2000', category: 'image' },
  { offset: 0, bytes: [0x76, 0x2f, 0x31, 0x01], mime: 'image/x-exr', extension: 'exr', description: 'OpenEXR image', category: 'image' },
  { offset: 0, bytes: '8BPS', mime: 'image/vnd.adobe.photoshop', extension: 'psd', description: 'Photoshop document', category: 'image' },
  { offset: 0, bytes: 'BLENDER', mime: 'application/x-blender', extension: 'blend', description: 'Blender file', category: 'other' },
  { offset: 0, bytes: 'DICM', mime: 'application/dicom', extension: 'dcm', description: 'DICOM medical image', category: 'image' },
  { offset: 0, bytes: [0x4b, 0x44, 0x4d], mime: 'application/x-apple-diskimage', extension: 'dmg', description: 'Apple disk image', category: 'archive' },
  { offset: 0, bytes: 'xar!', mime: 'application/x-xar', extension: 'pkg', description: 'macOS installer package', category: 'archive' },
];

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}

const ZIP_SUBTYPES: Array<{ needle: string; sig: FileSignature }> = [
  { needle: 'word/', sig: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', description: 'Word document', category: 'document' } },
  { needle: 'xl/', sig: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', description: 'Excel workbook', category: 'document' } },
  { needle: 'ppt/', sig: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx', description: 'PowerPoint presentation', category: 'document' } },
  { needle: 'META-INF/MANIFEST.MF', sig: { mime: 'application/java-archive', extension: 'jar', description: 'Java archive', category: 'archive' } },
  { needle: 'AndroidManifest.xml', sig: { mime: 'application/vnd.android.package-archive', extension: 'apk', description: 'Android package', category: 'archive' } },
  { needle: 'mimetypeapplication/epub+zip', sig: { mime: 'application/epub+zip', extension: 'epub', description: 'EPUB e-book', category: 'document' } },
  { needle: 'mimetypeapplication/vnd.oasis.opendocument.text', sig: { mime: 'application/vnd.oasis.opendocument.text', extension: 'odt', description: 'OpenDocument text', category: 'document' } },
  { needle: 'mimetypeapplication/vnd.oasis.opendocument.spreadsheet', sig: { mime: 'application/vnd.oasis.opendocument.spreadsheet', extension: 'ods', description: 'OpenDocument spreadsheet', category: 'document' } },
  { needle: 'Payload/', sig: { mime: 'application/octet-stream', extension: 'ipa', description: 'iOS app package', category: 'archive' } },
  { needle: 'extension.vsixmanifest', sig: { mime: 'application/vsix', extension: 'vsix', description: 'VS Code extension', category: 'archive' } },
  { needle: 'sketch', sig: { mime: 'application/zip', extension: 'sketch', description: 'Sketch design file', category: 'document' } },
];

export function detectFileType(bytes: Uint8Array): FileSignature | null {
  const matches = (m: Magic) => {
    const needle = typeof m.bytes === 'string' ? Array.from(m.bytes, (c) => c.charCodeAt(0)) : m.bytes;
    if (bytes.length < m.offset + needle.length) return false;
    for (let i = 0; i < needle.length; i++) if (bytes[m.offset + i] !== needle[i]) return false;
    return m.check ? m.check(bytes) : true;
  };
  for (const m of MAGICS) {
    if (matches(m)) {
      if (m.extension === 'zip') {
        const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
        for (const sub of ZIP_SUBTYPES) if (head.includes(sub.needle)) return sub.sig;
        // Check the central directory at the end for file names too.
        const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
        for (const sub of ZIP_SUBTYPES) if (tail.includes(sub.needle.replace('mimetype', ''))) return sub.sig;
      }
      return { mime: m.mime, extension: m.extension, description: m.description, category: m.category };
    }
  }
  return null;
}

export interface TextSniff {
  isText: boolean;
  encoding: 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'latin1' | 'binary';
  lineEndings: 'LF' | 'CRLF' | 'CR' | 'mixed' | 'none';
  lines: number;
  hasNullBytes: boolean;
  guess: string | null;
}

export function sniffText(bytes: Uint8Array): TextSniff {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  let encoding: TextSniff['encoding'] = 'utf-8';
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) encoding = 'utf-8-bom';
  else if (sample[0] === 0xff && sample[1] === 0xfe) encoding = 'utf-16le';
  else if (sample[0] === 0xfe && sample[1] === 0xff) encoding = 'utf-16be';
  const hasNullBytes = sample.includes(0) && !encoding.startsWith('utf-16');
  let text = '';
  let valid = true;
  try {
    text = new TextDecoder(encoding === 'utf-8-bom' ? 'utf-8' : encoding, { fatal: true }).decode(sample);
  } catch {
    valid = false;
  }
  if (!valid) {
    text = new TextDecoder('latin1').decode(sample);
    encoding = 'latin1';
  }
  let control = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 27) control++;
  }
  const isText = !hasNullBytes && control / Math.max(1, text.length) < 0.01;
  if (!isText) return { isText: false, encoding: 'binary', lineEndings: 'none', lines: 0, hasNullBytes, guess: null };
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf, lf, cr].filter((n) => n > 0).length;
  const lineEndings: TextSniff['lineEndings'] = kinds === 0 ? 'none' : kinds > 1 ? 'mixed' : crlf ? 'CRLF' : lf ? 'LF' : 'CR';
  const trimmed = text.trimStart();
  let guess: string | null;
  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(text);
      guess = 'JSON';
    } catch {
      guess = 'JSON (possibly truncated)';
    }
  } else if (/^<\?xml|^<svg/i.test(trimmed)) guess = trimmed.startsWith('<svg') ? 'SVG' : 'XML';
  else if (/^<!doctype html|^<html/i.test(trimmed)) guess = 'HTML';
  else if (/^#!/.test(trimmed)) guess = 'Shell script';
  else if (/^---\n|^[\w-]+:\s/.test(trimmed) && !trimmed.includes('{')) guess = 'YAML';
  else if (/^(#+\s|\*\s|-\s|\d+\.\s)/m.test(trimmed) && /\n/.test(trimmed)) guess = 'Markdown';
  else if (/^[^\n]*,[^\n]*\n[^\n]*,/.test(trimmed)) guess = 'CSV';
  else if (/^\s*(import|export|const|let|function|class)\b/m.test(trimmed)) guess = 'JavaScript / TypeScript';
  else if (/^\s*(def|import|from|class)\s/m.test(trimmed) && /:\s*$/m.test(trimmed)) guess = 'Python';
  else if (/^\[[\w.-]+\]\s*$/m.test(trimmed) && /^[\w-]+\s*=/m.test(trimmed)) guess = 'INI / TOML';
  else guess = 'Plain text';
  return { isText: true, encoding, lineEndings, lines: text ? text.split(/\r\n|\r|\n/).length : 0, hasNullBytes, guess };
}

export function hexDump(bytes: Uint8Array, options: { offset?: number; length?: number; width?: number } = {}): string {
  const width = options.width ?? 16;
  const start = options.offset ?? 0;
  const end = Math.min(bytes.length, start + (options.length ?? 512));
  const lines: string[] = [];
  for (let i = start; i < end; i += width) {
    const chunk = bytes.subarray(i, Math.min(end, i + width));
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0'));
    const hexStr = `${hex.slice(0, 8).join(' ')}  ${hex.slice(8).join(' ')}`.padEnd(width * 3 + 1);
    const asciiStr = Array.from(chunk, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hexStr} |${asciiStr}|`);
  }
  return lines.join('\n');
}

export function byteHistogram(bytes: Uint8Array): { entropy: number; printable: number; nulls: number; highBit: number } {
  const counts = new Uint32Array(256);
  const sample = bytes.subarray(0, Math.min(bytes.length, 1 << 20));
  for (const b of sample) counts[b]!++;
  let entropy = 0;
  let printable = 0;
  let highBit = 0;
  for (let i = 0; i < 256; i++) {
    const c = counts[i]!;
    if (!c) continue;
    const p = c / sample.length;
    entropy -= p * Math.log2(p);
    if (i >= 0x20 && i < 0x7f) printable += c;
    if (i >= 0x80) highBit += c;
  }
  return { entropy, printable: printable / Math.max(1, sample.length), nulls: counts[0]! / Math.max(1, sample.length), highBit: highBit / Math.max(1, sample.length) };
}

export const MIME_TYPES: Array<{ extension: string; mime: string; description: string }> = [
  { extension: 'html', mime: 'text/html', description: 'HTML document' },
  { extension: 'css', mime: 'text/css', description: 'Stylesheet' },
  { extension: 'js', mime: 'text/javascript', description: 'JavaScript' },
  { extension: 'mjs', mime: 'text/javascript', description: 'JavaScript module' },
  { extension: 'json', mime: 'application/json', description: 'JSON' },
  { extension: 'xml', mime: 'application/xml', description: 'XML' },
  { extension: 'txt', mime: 'text/plain', description: 'Plain text' },
  { extension: 'csv', mime: 'text/csv', description: 'CSV' },
  { extension: 'md', mime: 'text/markdown', description: 'Markdown' },
  { extension: 'pdf', mime: 'application/pdf', description: 'PDF' },
  { extension: 'zip', mime: 'application/zip', description: 'ZIP archive' },
  { extension: 'gz', mime: 'application/gzip', description: 'GZIP' },
  { extension: 'png', mime: 'image/png', description: 'PNG image' },
  { extension: 'jpg', mime: 'image/jpeg', description: 'JPEG image' },
  { extension: 'gif', mime: 'image/gif', description: 'GIF image' },
  { extension: 'webp', mime: 'image/webp', description: 'WebP image' },
  { extension: 'avif', mime: 'image/avif', description: 'AVIF image' },
  { extension: 'svg', mime: 'image/svg+xml', description: 'SVG image' },
  { extension: 'ico', mime: 'image/x-icon', description: 'Icon' },
  { extension: 'mp3', mime: 'audio/mpeg', description: 'MP3 audio' },
  { extension: 'wav', mime: 'audio/wav', description: 'WAV audio' },
  { extension: 'ogg', mime: 'audio/ogg', description: 'Ogg audio' },
  { extension: 'mp4', mime: 'video/mp4', description: 'MP4 video' },
  { extension: 'webm', mime: 'video/webm', description: 'WebM video' },
  { extension: 'woff', mime: 'font/woff', description: 'WOFF font' },
  { extension: 'woff2', mime: 'font/woff2', description: 'WOFF2 font' },
  { extension: 'ttf', mime: 'font/ttf', description: 'TrueType font' },
  { extension: 'otf', mime: 'font/otf', description: 'OpenType font' },
  { extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', description: 'Word' },
  { extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'Excel' },
  { extension: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', description: 'PowerPoint' },
  { extension: 'wasm', mime: 'application/wasm', description: 'WebAssembly' },
  { extension: 'ics', mime: 'text/calendar', description: 'Calendar' },
  { extension: 'vcf', mime: 'text/vcard', description: 'vCard' },
  { extension: 'yaml', mime: 'application/yaml', description: 'YAML' },
  { extension: 'toml', mime: 'application/toml', description: 'TOML' },
  { extension: 'sh', mime: 'application/x-sh', description: 'Shell script' },
  { extension: 'py', mime: 'text/x-python', description: 'Python' },
  { extension: 'epub', mime: 'application/epub+zip', description: 'EPUB' },
  { extension: 'apk', mime: 'application/vnd.android.package-archive', description: 'Android package' },
  { extension: 'exe', mime: 'application/vnd.microsoft.portable-executable', description: 'Windows executable' },
  { extension: 'dmg', mime: 'application/x-apple-diskimage', description: 'Apple disk image' },
];
