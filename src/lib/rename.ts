/**
 * Batch filename transformation.
 *
 * Rules are applied in a fixed, predictable order and the result is always
 * validated: reserved Windows device names, illegal characters, path traversal
 * attempts, over-long names and collisions are all detected *before* anything
 * is written, because the user only finds out a batch rename was wrong after
 * it has already happened.
 */

export interface NameParts {
  base: string;
  extension: string; // without the dot; '' when there is none
}

/** Split a filename into base + extension, treating dotfiles correctly. */
export function splitName(filename: string): NameParts {
  const name = filename;
  const lastDot = name.lastIndexOf('.');
  // ".gitignore" is a base name, not an extension.
  if (lastDot <= 0) return { base: name, extension: '' };
  return { base: name.slice(0, lastDot), extension: name.slice(lastDot + 1) };
}

export function joinName(parts: NameParts): string {
  return parts.extension ? `${parts.base}.${parts.extension}` : parts.base;
}

export type CaseMode =
  | 'none'
  | 'lower'
  | 'upper'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab';

export type ExtensionMode = 'keep' | 'replace' | 'lower' | 'upper' | 'remove' | 'add';

export interface RenameRules {
  /** Text to find (plain or regex). */
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;

  prefix: string;
  suffix: string;

  caseMode: CaseMode;

  /** Insert a sequential counter. */
  numbering: boolean;
  numberStart: number;
  numberPadding: number;
  numberSeparator: string;
  numberPosition: 'prefix' | 'suffix';

  extensionMode: ExtensionMode;
  newExtension: string;

  /** Replace spaces and unsafe characters with a URL/CLI-friendly form. */
  slugify: boolean;
  /** Strip accents to their ASCII base letters. */
  removeAccents: boolean;
  /** Collapse repeated separators and trim them from the ends. */
  tidySeparators: boolean;

  /** Remove the first N characters from the base name. */
  trimStart: number;
  /** Remove the last N characters from the base name. */
  trimEnd: number;

  /** Insert the current date, formatted as YYYY-MM-DD. */
  includeDate: boolean;
  datePosition: 'prefix' | 'suffix';
}

export const defaultRenameRules: RenameRules = {
  find: '',
  replace: '',
  useRegex: false,
  caseSensitive: false,
  prefix: '',
  suffix: '',
  caseMode: 'none',
  numbering: false,
  numberStart: 1,
  numberPadding: 2,
  numberSeparator: '-',
  numberPosition: 'suffix',
  extensionMode: 'keep',
  newExtension: '',
  slugify: false,
  removeAccents: false,
  tidySeparators: false,
  trimStart: 0,
  trimEnd: 0,
  includeDate: false,
  datePosition: 'prefix',
};

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

// Control chars plus the characters Windows/macOS refuse in filenames.
// The control-character range is the entire point of this pattern.
// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function splitWords(input: string): string[] {
  return (
    input
      // camelCase / PascalCase boundaries
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_\-.]+/)
      .filter(Boolean)
  );
}

export function applyCase(input: string, mode: CaseMode): string {
  if (mode === 'none') return input;
  if (mode === 'lower') return input.toLowerCase();
  if (mode === 'upper') return input.toUpperCase();

  const words = splitWords(input);
  if (words.length === 0) return input;

  switch (mode) {
    case 'title':
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    case 'sentence': {
      const joined = words.join(' ').toLowerCase();
      return joined.charAt(0).toUpperCase() + joined.slice(1);
    }
    case 'camel':
      return words
        .map((w, i) =>
          i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
        )
        .join('');
    case 'pascal':
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    default:
      return input;
  }
}

export function slugifyName(input: string): string {
  return stripAccents(input)
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export interface RenamePreviewItem {
  id: string;
  original: string;
  result: string;
  size?: number;
  changed: boolean;
  errors: string[];
  warnings: string[];
}

/** Apply the rule set to one filename. Pure; the index drives the counter. */
export function applyRules(
  filename: string,
  rules: RenameRules,
  index: number,
  now: Date = new Date(),
): { result: string; errors: string[] } {
  const errors: string[] = [];
  const parts = splitName(filename);
  let base = parts.base;
  let extension = parts.extension;

  // 1. find & replace (base name only — extension is handled separately)
  if (rules.find) {
    if (rules.useRegex) {
      try {
        const re = new RegExp(rules.find, rules.caseSensitive ? 'g' : 'gi');
        base = base.replace(re, rules.replace);
      } catch (e) {
        errors.push(`Invalid regex: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      if (rules.caseSensitive) {
        base = base.split(rules.find).join(rules.replace);
      } else {
        const escaped = rules.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        base = base.replace(new RegExp(escaped, 'gi'), rules.replace);
      }
    }
  }

  // 2. trim characters
  if (rules.trimStart > 0) base = base.slice(rules.trimStart);
  if (rules.trimEnd > 0) base = base.slice(0, Math.max(0, base.length - rules.trimEnd));

  // 3. accents & case
  if (rules.removeAccents) base = stripAccents(base);
  base = applyCase(base, rules.caseMode);

  // 4. affixes
  if (rules.prefix) base = rules.prefix + base;
  if (rules.suffix) base = base + rules.suffix;

  // 5. date
  if (rules.includeDate) {
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    base = rules.datePosition === 'prefix' ? `${stamp}-${base}` : `${base}-${stamp}`;
  }

  // 6. numbering
  if (rules.numbering) {
    const n = String(rules.numberStart + index).padStart(Math.max(0, rules.numberPadding), '0');
    base =
      rules.numberPosition === 'prefix'
        ? `${n}${rules.numberSeparator}${base}`
        : `${base}${rules.numberSeparator}${n}`;
  }

  // 7. slugify (after everything else so affixes get normalised too)
  if (rules.slugify) base = slugifyName(base);

  // 8. tidy separators
  if (rules.tidySeparators) {
    base = base
      .replace(/\s+/g, ' ')
      .replace(/([-_.])\1+/g, '$1')
      .replace(/^[-_.\s]+|[-_.\s]+$/g, '');
  }

  // 9. extension
  switch (rules.extensionMode) {
    case 'lower':
      extension = extension.toLowerCase();
      break;
    case 'upper':
      extension = extension.toUpperCase();
      break;
    case 'remove':
      extension = '';
      break;
    case 'replace':
    case 'add':
      extension = rules.newExtension.replace(/^\./, '').trim();
      break;
    case 'keep':
    default:
      break;
  }

  const result = joinName({ base, extension });
  return { result, errors };
}

/** Validate a produced filename against real filesystem constraints. */
export function validateFilename(name: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (name.trim() === '') {
    errors.push('The resulting name is empty.');
    return { errors, warnings };
  }
  if (name === '.' || name === '..') {
    errors.push('“.” and “..” are not valid filenames.');
  }
  if (name.includes('/') || name.includes('\\')) {
    errors.push('The name contains a path separator, which would move the file.');
  }
  const illegal = name.match(ILLEGAL_CHARS);
  if (illegal) {
    const unique = [...new Set(illegal)].map((c) =>
      c.charCodeAt(0) < 32 ? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}` : c,
    );
    errors.push(`Contains characters that are illegal on Windows: ${unique.join(' ')}`);
  }
  const { base } = splitName(name);
  if (WINDOWS_RESERVED.has(base.toLowerCase())) {
    errors.push(`“${base}” is a reserved device name on Windows.`);
  }
  if (name.endsWith('.') || name.endsWith(' ')) {
    warnings.push('Windows silently strips trailing dots and spaces from filenames.');
  }
  if (new TextEncoder().encode(name).length > 255) {
    errors.push('Longer than 255 bytes, which exceeds most filesystem limits.');
  }
  if (name.startsWith('.')) {
    warnings.push('Starts with a dot, so it will be hidden on macOS and Linux.');
  }
  if (/[^\x20-\x7E]/.test(name)) {
    warnings.push('Contains non-ASCII characters, which some older tools mishandle.');
  }
  return { errors, warnings };
}

export interface RenameInput {
  id: string;
  name: string;
  size?: number;
}

/** Build a full preview for a batch, including collision detection. */
export function buildRenamePreview(
  files: RenameInput[],
  rules: RenameRules,
  now: Date = new Date(),
): RenamePreviewItem[] {
  const items: RenamePreviewItem[] = files.map((file, index) => {
    const { result, errors } = applyRules(file.name, rules, index, now);
    const validation = validateFilename(result);
    return {
      id: file.id,
      original: file.name,
      result,
      ...(file.size !== undefined ? { size: file.size } : {}),
      changed: result !== file.name,
      errors: [...errors, ...validation.errors],
      warnings: validation.warnings,
    };
  });

  // Collisions are case-insensitive because macOS and Windows are.
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.result.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const item of items) {
    if ((counts.get(item.result.toLowerCase()) ?? 0) > 1) {
      item.errors.push('Another file in this batch would end up with the same name.');
    }
  }

  return items;
}

/** Append “ (2)”, “ (3)”… to names that would otherwise collide. */
export function deduplicateNames(items: RenamePreviewItem[]): RenamePreviewItem[] {
  const used = new Set<string>();
  return items.map((item) => {
    const parts = splitName(item.result);
    let candidate = item.result;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = joinName({ base: `${parts.base} (${counter})`, extension: parts.extension });
      counter++;
    }
    used.add(candidate.toLowerCase());
    const errors = item.errors.filter(
      (e) => e !== 'Another file in this batch would end up with the same name.',
    );
    return { ...item, result: candidate, changed: candidate !== item.original, errors };
  });
}

/** Extension-only quick presets, the most common reason people open this tool. */
export const EXTENSION_PRESETS: Array<{ label: string; from: string; to: string }> = [
  { label: '.jpeg → .jpg', from: 'jpeg', to: 'jpg' },
  { label: '.txt → .md', from: 'txt', to: 'md' },
  { label: '.htm → .html', from: 'htm', to: 'html' },
  { label: '.jsx → .tsx', from: 'jsx', to: 'tsx' },
  { label: '.yml → .yaml', from: 'yml', to: 'yaml' },
];
