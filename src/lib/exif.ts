/**
 * EXIF / metadata reader for JPEG, PNG, WebP and HEIC-less basics, plus a
 * JPEG metadata stripper that removes APPn segments without re-encoding
 * pixels (lossless).
 */

export interface ExifEntry {
  tag: number;
  name: string;
  value: string;
  raw: unknown;
  group: 'image' | 'exif' | 'gps' | 'thumbnail' | 'interop';
}

export interface ExifReport {
  format: string;
  width?: number;
  height?: number;
  entries: ExifEntry[];
  gps?: { latitude: number; longitude: number; altitude?: number };
  dateTaken?: string;
  camera?: string;
  lens?: string;
  orientation?: number;
  hasExif: boolean;
  hasIcc: boolean;
  hasXmp: boolean;
  segments: Array<{ marker: string; length: number; description: string }>;
  warnings: string[];
}

const TAG_NAMES: Record<number, string> = {
  0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution',
  0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x013e: 'WhitePoint', 0x0213: 'YCbCrPositioning',
  0x8298: 'Copyright', 0x8769: 'ExifIFDPointer', 0x8825: 'GPSInfoIFDPointer', 0x829a: 'ExposureTime', 0x829d: 'FNumber',
  0x8822: 'ExposureProgram', 0x8827: 'ISOSpeedRatings', 0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
  0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9203: 'BrightnessValue',
  0x9204: 'ExposureBiasValue', 0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance', 0x9207: 'MeteringMode', 0x9208: 'LightSource',
  0x9209: 'Flash', 0x920a: 'FocalLength', 0x927c: 'MakerNote', 0x9286: 'UserComment', 0x9291: 'SubSecTimeOriginal', 0xa000: 'FlashpixVersion',
  0xa001: 'ColorSpace', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa005: 'InteroperabilityIFDPointer', 0xa20e: 'FocalPlaneXResolution',
  0xa20f: 'FocalPlaneYResolution', 0xa210: 'FocalPlaneResolutionUnit', 0xa217: 'SensingMethod', 0xa300: 'FileSource', 0xa301: 'SceneType',
  0xa401: 'CustomRendered', 0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa404: 'DigitalZoomRatio', 0xa405: 'FocalLengthIn35mmFilm',
  0xa406: 'SceneCaptureType', 0xa407: 'GainControl', 0xa408: 'Contrast', 0xa409: 'Saturation', 0xa40a: 'Sharpness', 0xa420: 'ImageUniqueID',
  0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber', 0xa432: 'LensSpecification', 0xa433: 'LensMake', 0xa434: 'LensModel', 0xa435: 'LensSerialNumber',
  0x0100: 'ImageWidth', 0x0101: 'ImageLength', 0x0102: 'BitsPerSample', 0x0103: 'Compression', 0x0106: 'PhotometricInterpretation',
  0x0111: 'StripOffsets', 0x0115: 'SamplesPerPixel', 0x0116: 'RowsPerStrip', 0x0117: 'StripByteCounts', 0x0201: 'JPEGInterchangeFormat',
  0x0202: 'JPEGInterchangeFormatLength', 0x9101: 'ComponentsConfiguration', 0x9102: 'CompressedBitsPerPixel', 0xa500: 'Gamma',
  0x4746: 'Rating', 0x9c9b: 'XPTitle', 0x9c9c: 'XPComment', 0x9c9d: 'XPAuthor', 0x9c9e: 'XPKeywords', 0x9c9f: 'XPSubject',
};

const GPS_TAG_NAMES: Record<number, string> = {
  0: 'GPSVersionID', 1: 'GPSLatitudeRef', 2: 'GPSLatitude', 3: 'GPSLongitudeRef', 4: 'GPSLongitude', 5: 'GPSAltitudeRef', 6: 'GPSAltitude',
  7: 'GPSTimeStamp', 8: 'GPSSatellites', 9: 'GPSStatus', 12: 'GPSSpeedRef', 13: 'GPSSpeed', 16: 'GPSImgDirectionRef', 17: 'GPSImgDirection',
  18: 'GPSMapDatum', 27: 'GPSProcessingMethod', 29: 'GPSDateStamp', 31: 'GPSHPositioningError',
};

const ORIENTATIONS: Record<number, string> = {
  1: 'Normal', 2: 'Mirrored horizontally', 3: 'Rotated 180°', 4: 'Mirrored vertically', 5: 'Mirrored + rotated 90° CCW', 6: 'Rotated 90° CW', 7: 'Mirrored + rotated 90° CW', 8: 'Rotated 90° CCW',
};

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

type Rational = { num: number; den: number };

function readValue(view: DataView, type: number, count: number, valueOffset: number, little: boolean, tiffStart: number): unknown {
  const size = TYPE_SIZES[type] ?? 1;
  const total = size * count;
  const offset = total > 4 ? tiffStart + view.getUint32(valueOffset, little) : valueOffset;
  if (offset + total > view.byteLength) return null;
  const read = (i: number): number | Rational => {
    const at = offset + i * size;
    switch (type) {
      case 1:
      case 7:
        return view.getUint8(at);
      case 6:
        return view.getInt8(at);
      case 3:
        return view.getUint16(at, little);
      case 8:
        return view.getInt16(at, little);
      case 4:
        return view.getUint32(at, little);
      case 9:
        return view.getInt32(at, little);
      case 5:
        return { num: view.getUint32(at, little), den: view.getUint32(at + 4, little) };
      case 10:
        return { num: view.getInt32(at, little), den: view.getInt32(at + 4, little) };
      case 11:
        return view.getFloat32(at, little);
      case 12:
        return view.getFloat64(at, little);
      default:
        return view.getUint8(at);
    }
  };
  if (type === 2) {
    let s = '';
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }
  if (type === 7 && count > 64) return `(${count} bytes)`;
  if (count === 1) return read(0);
  const arr: Array<number | Rational> = [];
  for (let i = 0; i < Math.min(count, 256); i++) arr.push(read(i));
  return arr;
}

const isRational = (v: unknown): v is Rational => typeof v === 'object' && v !== null && 'num' in v && 'den' in v;
const ratio = (r: Rational) => (r.den === 0 ? 0 : r.num / r.den);

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (isRational(v)) return v.den === 1 ? String(v.num) : `${ratio(v).toFixed(3)} (${v.num}/${v.den})`;
  if (Array.isArray(v)) return v.map(str).join(', ');
  return JSON.stringify(v);
}

function formatValue(tag: number, name: string, raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (name === 'Orientation' && typeof raw === 'number') return `${raw} (${ORIENTATIONS[raw] ?? 'unknown'})`;
  if (name === 'ExposureTime' && isRational(raw)) {
    const v = ratio(raw);
    return v >= 1 ? `${v.toFixed(1)} s` : `1/${Math.round(1 / v)} s`;
  }
  if (name === 'FNumber' && isRational(raw)) return `f/${ratio(raw).toFixed(1)}`;
  if (name === 'FocalLength' && isRational(raw)) return `${ratio(raw).toFixed(1)} mm`;
  if (name === 'FocalLengthIn35mmFilm') return `${str(raw)} mm`;
  if (name === 'ISOSpeedRatings') return `ISO ${Array.isArray(raw) ? str(raw[0]) : str(raw)}`;
  if (name === 'ExposureBiasValue' && isRational(raw)) return `${ratio(raw) >= 0 ? '+' : ''}${ratio(raw).toFixed(1)} EV`;
  if (name === 'Flash' && typeof raw === 'number') return raw & 1 ? `Fired (0x${raw.toString(16)})` : `Did not fire (0x${raw.toString(16)})`;
  if (name === 'ColorSpace') return raw === 1 ? 'sRGB' : raw === 0xffff ? 'Uncalibrated' : str(raw);
  if (name === 'MeteringMode' && typeof raw === 'number') return ['Unknown', 'Average', 'Center-weighted', 'Spot', 'Multi-spot', 'Pattern', 'Partial'][raw] ?? str(raw);
  if (name === 'ExposureProgram' && typeof raw === 'number') return ['Not defined', 'Manual', 'Program', 'Aperture priority', 'Shutter priority', 'Creative', 'Action', 'Portrait', 'Landscape'][raw] ?? str(raw);
  if (name === 'WhiteBalance') return raw === 0 ? 'Auto' : raw === 1 ? 'Manual' : str(raw);
  if (name === 'ExposureMode') return raw === 0 ? 'Auto' : raw === 1 ? 'Manual' : raw === 2 ? 'Auto bracket' : str(raw);
  if (name === 'SceneCaptureType' && typeof raw === 'number') return ['Standard', 'Landscape', 'Portrait', 'Night'][raw] ?? str(raw);
  if (name === 'ResolutionUnit') return raw === 2 ? 'inch' : raw === 3 ? 'cm' : str(raw);
  if ((name === 'ExifVersion' || name === 'FlashpixVersion') && Array.isArray(raw)) return raw.map((n) => String.fromCharCode(Number(n))).join('');
  if (name === 'LensSpecification' && Array.isArray(raw)) {
    const r = raw.map((x) => (isRational(x) ? ratio(x) : Number(x)));
    return `${r[0]}–${r[1]} mm f/${r[2]}–${r[3]}`;
  }
  if (name.startsWith('XP') && Array.isArray(raw)) {
    const bytes = new Uint8Array(raw.map(Number));
    return new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/, '');
  }
  void tag;
  return str(raw);
}

function parseIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean, group: ExifEntry['group'], names: Record<number, string>, entries: ExifEntry[], pointers: Record<string, number>): number {
  const start = tiffStart + ifdOffset;
  if (start + 2 > view.byteLength) return 0;
  const count = view.getUint16(start, little);
  if (count > 500) return 0;
  for (let i = 0; i < count; i++) {
    const e = start + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = view.getUint16(e, little);
    const type = view.getUint16(e + 2, little);
    const n = view.getUint32(e + 4, little);
    const raw = readValue(view, type, n, e + 8, little, tiffStart);
    const name = names[tag] ?? `Tag 0x${tag.toString(16).padStart(4, '0')}`;
    if (name === 'ExifIFDPointer' || name === 'GPSInfoIFDPointer' || name === 'InteroperabilityIFDPointer') {
      pointers[name] = Number(raw);
      continue;
    }
    if (name === 'MakerNote') {
      entries.push({ tag, name, value: `(${n} bytes, proprietary)`, raw: null, group });
      continue;
    }
    entries.push({ tag, name, value: formatValue(tag, name, raw), raw, group });
  }
  const nextOffsetAt = start + 2 + count * 12;
  return nextOffsetAt + 4 <= view.byteLength ? view.getUint32(nextOffsetAt, little) : 0;
}

function dmsToDecimal(v: unknown, ref: unknown): number | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const [d, m, s] = v.map((x) => (isRational(x) ? ratio(x) : Number(x))) as [number, number, number];
  let dec = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') dec = -dec;
  return dec;
}

export function parseExifBlock(bytes: Uint8Array): { entries: ExifEntry[]; orientation?: number; gps?: ExifReport['gps'] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ExifEntry[] = [];
  const byteOrder = view.getUint16(0);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) throw new Error('Invalid TIFF header in EXIF block.');
  const firstIfd = view.getUint32(4, little);
  const pointers: Record<string, number> = {};
  const next = parseIfd(view, 0, firstIfd, little, 'image', TAG_NAMES, entries, pointers);
  if (pointers.ExifIFDPointer) parseIfd(view, 0, pointers.ExifIFDPointer, little, 'exif', TAG_NAMES, entries, pointers);
  if (pointers.GPSInfoIFDPointer) parseIfd(view, 0, pointers.GPSInfoIFDPointer, little, 'gps', GPS_TAG_NAMES, entries, pointers);
  if (pointers.InteroperabilityIFDPointer) parseIfd(view, 0, pointers.InteroperabilityIFDPointer, little, 'interop', TAG_NAMES, entries, pointers);
  if (next && next < bytes.byteLength) parseIfd(view, 0, next, little, 'thumbnail', TAG_NAMES, entries, {});

  const orientationEntry = entries.find((e) => e.name === 'Orientation' && e.group === 'image');
  const orientation = typeof orientationEntry?.raw === 'number' ? orientationEntry.raw : undefined;
  const lat = entries.find((e) => e.name === 'GPSLatitude');
  const latRef = entries.find((e) => e.name === 'GPSLatitudeRef');
  const lon = entries.find((e) => e.name === 'GPSLongitude');
  const lonRef = entries.find((e) => e.name === 'GPSLongitudeRef');
  const alt = entries.find((e) => e.name === 'GPSAltitude');
  let gps: ExifReport['gps'];
  if (lat && lon) {
    const latitude = dmsToDecimal(lat.raw, latRef?.raw);
    const longitude = dmsToDecimal(lon.raw, lonRef?.raw);
    if (latitude !== null && longitude !== null) gps = { latitude, longitude, altitude: alt && isRational(alt.raw) ? ratio(alt.raw) : undefined };
  }
  return { entries, orientation, gps };
}

const JPEG_MARKERS: Record<number, string> = {
  0xc0: 'SOF0 (baseline)', 0xc1: 'SOF1', 0xc2: 'SOF2 (progressive)', 0xc4: 'DHT', 0xd8: 'SOI', 0xd9: 'EOI', 0xda: 'SOS', 0xdb: 'DQT', 0xdd: 'DRI',
  0xe0: 'APP0 (JFIF)', 0xe1: 'APP1 (EXIF/XMP)', 0xe2: 'APP2 (ICC)', 0xe3: 'APP3', 0xe4: 'APP4', 0xe5: 'APP5', 0xe6: 'APP6', 0xe7: 'APP7',
  0xe8: 'APP8', 0xe9: 'APP9', 0xea: 'APP10', 0xeb: 'APP11', 0xec: 'APP12', 0xed: 'APP13 (IPTC/Photoshop)', 0xee: 'APP14 (Adobe)', 0xef: 'APP15', 0xfe: 'COM (comment)',
};

export function readImageMetadata(buffer: ArrayBuffer): ExifReport {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const report: ExifReport = { format: 'unknown', entries: [], hasExif: false, hasIcc: false, hasXmp: false, segments: [], warnings: [] };

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    report.format = 'JPEG';
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) {
        report.segments.push({ marker: `0xFF${marker.toString(16).toUpperCase()}`, length: 0, description: JPEG_MARKERS[marker] ?? 'unknown' });
        break;
      }
      const len = view.getUint16(i + 2);
      const segStart = i + 4;
      const segEnd = i + 2 + len;
      report.segments.push({ marker: `0xFF${marker.toString(16).toUpperCase()}`, length: len, description: JPEG_MARKERS[marker] ?? 'unknown' });
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        report.height = view.getUint16(segStart + 1);
        report.width = view.getUint16(segStart + 3);
      }
      if (marker === 0xe1) {
        const header = String.fromCharCode(...bytes.subarray(segStart, segStart + 6));
        if (header.startsWith('Exif\0')) {
          report.hasExif = true;
          try {
            const parsed = parseExifBlock(bytes.subarray(segStart + 6, segEnd));
            report.entries.push(...parsed.entries);
            report.orientation = parsed.orientation;
            report.gps = parsed.gps;
          } catch (e) {
            report.warnings.push(e instanceof Error ? e.message : 'EXIF block could not be parsed.');
          }
        } else if (String.fromCharCode(...bytes.subarray(segStart, segStart + 29)).startsWith('http://ns.adobe.com/xap/1.0/')) {
          report.hasXmp = true;
          const xmp = new TextDecoder().decode(bytes.subarray(segStart + 29, segEnd));
          const grab = (re: RegExp) => re.exec(xmp)?.[1];
          const creator = grab(/<dc:creator>[\s\S]*?<rdf:li>([^<]+)<\/rdf:li>/) ?? grab(/xmp:CreatorTool="([^"]+)"/);
          const title = grab(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/);
          const rating = grab(/xmp:Rating="(\d)"/);
          if (creator) report.entries.push({ tag: 0, name: 'XMP:Creator', value: creator, raw: creator, group: 'image' });
          if (title) report.entries.push({ tag: 0, name: 'XMP:Title', value: title, raw: title, group: 'image' });
          if (rating) report.entries.push({ tag: 0, name: 'XMP:Rating', value: rating, raw: rating, group: 'image' });
        }
      }
      if (marker === 0xe2) report.hasIcc = true;
      if (marker === 0xfe) {
        const comment = new TextDecoder().decode(bytes.subarray(segStart, segEnd)).replace(/\0+$/, '');
        report.entries.push({ tag: 0xfe, name: 'Comment', value: comment, raw: comment, group: 'image' });
      }
      i = segEnd;
    }
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    report.format = 'PNG';
    let i = 8;
    while (i + 8 <= bytes.length) {
      const len = view.getUint32(i);
      const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
      const dataStart = i + 8;
      report.segments.push({ marker: type, length: len, description: PNG_CHUNKS[type] ?? 'ancillary chunk' });
      if (type === 'IHDR') {
        report.width = view.getUint32(dataStart);
        report.height = view.getUint32(dataStart + 4);
        const depth = bytes[dataStart + 8]!;
        const colorType = bytes[dataStart + 9]!;
        report.entries.push({ tag: 0, name: 'BitDepth', value: String(depth), raw: depth, group: 'image' });
        report.entries.push({ tag: 0, name: 'ColorType', value: PNG_COLOR_TYPES[colorType] ?? String(colorType), raw: colorType, group: 'image' });
      } else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
        const data = bytes.subarray(dataStart, dataStart + len);
        const nul = data.indexOf(0);
        const key = new TextDecoder().decode(data.subarray(0, nul < 0 ? data.length : nul));
        let value: string;
        if (type === 'tEXt') value = new TextDecoder('latin1').decode(data.subarray(nul + 1));
        else if (type === 'iTXt') {
          // compression flag, method, language tag \0, translated keyword \0, text
          let p = nul + 1 + 2;
          const langEnd = data.indexOf(0, p);
          p = langEnd + 1;
          const transEnd = data.indexOf(0, p);
          p = transEnd + 1;
          value = data[nul + 1] === 0 ? new TextDecoder().decode(data.subarray(p)) : '(compressed text)';
        } else value = '(compressed text)';
        if (key === 'XML:com.adobe.xmp') report.hasXmp = true;
        report.entries.push({ tag: 0, name: key, value: value.length > 500 ? `${value.slice(0, 500)}…` : value, raw: value, group: 'image' });
      } else if (type === 'eXIf') {
        report.hasExif = true;
        try {
          const parsed = parseExifBlock(bytes.subarray(dataStart, dataStart + len));
          report.entries.push(...parsed.entries);
          report.orientation = parsed.orientation;
          report.gps = parsed.gps;
        } catch (e) {
          report.warnings.push(e instanceof Error ? e.message : 'EXIF chunk could not be parsed.');
        }
      } else if (type === 'iCCP') report.hasIcc = true;
      else if (type === 'pHYs') {
        const x = view.getUint32(dataStart);
        const unit = bytes[dataStart + 8];
        if (unit === 1) report.entries.push({ tag: 0, name: 'Resolution', value: `${Math.round(x * 0.0254)} dpi`, raw: x, group: 'image' });
      } else if (type === 'tIME') {
        const y = view.getUint16(dataStart);
        const parts = [y, bytes[dataStart + 2], bytes[dataStart + 3], bytes[dataStart + 4], bytes[dataStart + 5], bytes[dataStart + 6]];
        const v = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')} ${String(parts[3]).padStart(2, '0')}:${String(parts[4]).padStart(2, '0')}:${String(parts[5]).padStart(2, '0')}`;
        report.entries.push({ tag: 0, name: 'ModificationTime', value: v, raw: v, group: 'image' });
      }
      if (type === 'IEND') break;
      i = dataStart + len + 4;
    }
  } else if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    report.format = 'WebP';
    let i = 12;
    while (i + 8 <= bytes.length) {
      const type = String.fromCharCode(...bytes.subarray(i, i + 4));
      const len = view.getUint32(i + 4, true);
      report.segments.push({ marker: type, length: len, description: WEBP_CHUNKS[type] ?? 'chunk' });
      const dataStart = i + 8;
      if (type === 'VP8X') {
        report.width = 1 + (bytes[dataStart + 4]! | (bytes[dataStart + 5]! << 8) | (bytes[dataStart + 6]! << 16));
        report.height = 1 + (bytes[dataStart + 7]! | (bytes[dataStart + 8]! << 8) | (bytes[dataStart + 9]! << 16));
      } else if (type === 'VP8 ' && report.width === undefined) {
        report.width = view.getUint16(dataStart + 6, true) & 0x3fff;
        report.height = view.getUint16(dataStart + 8, true) & 0x3fff;
      } else if (type === 'VP8L' && report.width === undefined) {
        const b = view.getUint32(dataStart + 1, true);
        report.width = (b & 0x3fff) + 1;
        report.height = ((b >> 14) & 0x3fff) + 1;
      } else if (type === 'EXIF') {
        report.hasExif = true;
        try {
          let off = dataStart;
          if (String.fromCharCode(...bytes.subarray(off, off + 4)) === 'Exif') off += 6;
          const parsed = parseExifBlock(bytes.subarray(off, dataStart + len));
          report.entries.push(...parsed.entries);
          report.orientation = parsed.orientation;
          report.gps = parsed.gps;
        } catch (e) {
          report.warnings.push(e instanceof Error ? e.message : 'EXIF chunk could not be parsed.');
        }
      } else if (type === 'XMP ') report.hasXmp = true;
      else if (type === 'ICCP') report.hasIcc = true;
      i = dataStart + len + (len % 2);
    }
  } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    report.format = 'GIF';
    report.width = view.getUint16(6, true);
    report.height = view.getUint16(8, true);
  } else if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 0x2a)) {
    report.format = 'TIFF';
    report.hasExif = true;
    try {
      const parsed = parseExifBlock(bytes);
      report.entries.push(...parsed.entries);
      report.orientation = parsed.orientation;
      report.gps = parsed.gps;
      const w = parsed.entries.find((e) => e.name === 'ImageWidth');
      const h = parsed.entries.find((e) => e.name === 'ImageLength');
      if (typeof w?.raw === 'number') report.width = w.raw;
      if (typeof h?.raw === 'number') report.height = h.raw;
    } catch (e) {
      report.warnings.push(e instanceof Error ? e.message : 'TIFF could not be parsed.');
    }
  } else if (String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    report.format = /hei|mif|avif|avis/i.test(brand) ? (brand.startsWith('avi') ? 'AVIF' : 'HEIF/HEIC') : `ISO BMFF (${brand})`;
    report.warnings.push('Container-level metadata for HEIF/AVIF is not fully parsed; EXIF may be present inside the meta box.');
  }

  const get = (name: string) => report.entries.find((e) => e.name === name);
  const make = get('Make')?.value;
  const model = get('Model')?.value;
  if (make || model) report.camera = model && make && model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(' ');
  report.lens = get('LensModel')?.value;
  const dto = get('DateTimeOriginal')?.value ?? get('DateTime')?.value;
  if (dto) report.dateTaken = dto.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  if (!report.width) {
    const px = get('PixelXDimension');
    const py = get('PixelYDimension');
    if (typeof px?.raw === 'number' && typeof py?.raw === 'number') {
      report.width = px.raw;
      report.height = py.raw;
    }
  }
  return report;
}

const PNG_CHUNKS: Record<string, string> = {
  IHDR: 'header', PLTE: 'palette', IDAT: 'image data', IEND: 'end', tEXt: 'text metadata', iTXt: 'international text', zTXt: 'compressed text',
  eXIf: 'EXIF', iCCP: 'ICC profile', pHYs: 'physical dimensions', tIME: 'modification time', gAMA: 'gamma', cHRM: 'chromaticity', sRGB: 'sRGB intent',
  bKGD: 'background', tRNS: 'transparency', sBIT: 'significant bits', acTL: 'APNG control', fcTL: 'APNG frame control', fdAT: 'APNG frame data',
};
const PNG_COLOR_TYPES: Record<number, string> = { 0: 'Greyscale', 2: 'RGB', 3: 'Indexed', 4: 'Greyscale + alpha', 6: 'RGBA' };
const WEBP_CHUNKS: Record<string, string> = { 'VP8 ': 'lossy bitstream', VP8L: 'lossless bitstream', VP8X: 'extended header', ALPH: 'alpha', ANIM: 'animation', ANMF: 'frame', EXIF: 'EXIF', 'XMP ': 'XMP', ICCP: 'ICC profile' };

/** Remove all APPn/COM segments from a JPEG without re-encoding pixels. */
export function stripJpegMetadata(buffer: ArrayBuffer, options: { keepIcc?: boolean; keepOrientation?: boolean } = {}): { bytes: Uint8Array; removed: number } {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG file.');
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let removed = 0;
  const view = new DataView(buffer);
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!;
    if (marker === 0xda) {
      parts.push(bytes.subarray(i));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd8) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = view.getUint16(i + 2);
    const segEnd = i + 2 + len;
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    const isIcc = marker === 0xe2 && String.fromCharCode(...bytes.subarray(i + 4, i + 15)).startsWith('ICC_PROFILE');
    if (isMeta && !(options.keepIcc && isIcc)) {
      removed += len + 2;
      if (options.keepOrientation && marker === 0xe1 && String.fromCharCode(...bytes.subarray(i + 4, i + 9)) === 'Exif\0') {
        try {
          const parsed = parseExifBlock(bytes.subarray(i + 10, segEnd));
          if (parsed.orientation && parsed.orientation !== 1) parts.push(buildOrientationSegment(parsed.orientation));
        } catch {
          /* ignore */
        }
      }
    } else parts.push(bytes.subarray(i, segEnd));
    i = segEnd;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return { bytes: out, removed };
}

function buildOrientationSegment(orientation: number): Uint8Array {
  // Minimal EXIF APP1 with a single Orientation tag (big-endian).
  const tiff = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const header = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const len = 2 + header.length + tiff.length;
  const out = new Uint8Array(2 + len);
  out[0] = 0xff;
  out[1] = 0xe1;
  out[2] = (len >> 8) & 0xff;
  out[3] = len & 0xff;
  out.set(header, 4);
  out.set(tiff, 4 + header.length);
  return out;
}

/** Remove metadata chunks from a PNG (keeps critical chunks and transparency/gamma). */
export function stripPngMetadata(buffer: ArrayBuffer): { bytes: Uint8Array; removed: number } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'bKGD', 'pHYs', 'acTL', 'fcTL', 'fdAT', 'sBIT']);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let removed = 0;
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (keep.has(type)) parts.push(bytes.subarray(i, end));
    else removed += end - i;
    if (type === 'IEND') break;
    i = end;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return { bytes: out, removed };
}
