import type { LucideIcon } from 'lucide-react';
import {
  Binary,
  CaseSensitive,
  FileType2,
  GitCompareArrows,
  ImageDown,
  KeyRound,
  Regex,
  Table2,
  Waves,
  Clock,
} from 'lucide-react';

export type ToolCategory = 'content' | 'data' | 'productivity';

export interface Tool {
  slug: string;
  name: string;
  /** One-line value proposition, used on cards and as the meta description. */
  tagline: string;
  /** The concrete pain this removes — shown on the tool page. */
  problem: string;
  category: ToolCategory;
  icon: LucideIcon;
  keywords: string[];
  /** True when the tool can accept files, used for the "drop anywhere" hint. */
  acceptsFiles: boolean;
}

export const CATEGORIES: Record<ToolCategory, { label: string; description: string }> = {
  content: {
    label: 'Content & formatting',
    description: 'Clean up text, patterns and structured documents.',
  },
  data: {
    label: 'Files & data',
    description: 'Convert, compress and reorganise files without uploading them.',
  },
  productivity: {
    label: 'Daily productivity',
    description: 'Small utilities that remove recurring mental overhead.',
  },
};

export const TOOLS: Tool[] = [
  {
    slug: 'markdown-to-text',
    name: 'Markdown to Clean Text',
    tagline: 'Strip Markdown and rich-text artefacts down to clean, paste-ready plain text.',
    problem:
      'Copying between editors drags along asterisks, stray links, smart quotes and invisible characters. This removes them while keeping the structure a human actually reads.',
    category: 'content',
    icon: CaseSensitive,
    keywords: ['markdown', 'plain text', 'strip formatting', 'clean', 'converter', 'unicode'],
    acceptsFiles: true,
  },
  {
    slug: 'regex-tester',
    name: 'Regex Visualiser & Tester',
    tagline: 'Test a pattern live, see it explained in plain English, and catch dangerous ones.',
    problem:
      'Regular expressions are write-only. This shows every match as you type, breaks the pattern into a readable tree and warns about catastrophic backtracking before it reaches production.',
    category: 'content',
    icon: Regex,
    keywords: ['regex', 'regexp', 'pattern', 'match', 'test', 'explain', 'redos'],
    acceptsFiles: true,
  },
  {
    slug: 'json-formatter',
    name: 'JSON Validator & Formatter',
    tagline: 'Find the exact character that broke your JSON, then format, repair or query it.',
    problem:
      '“Unexpected token in JSON at position 4823” tells you nothing. This points at the line and column, explains what is wrong, and can repair trailing commas, comments and single quotes automatically.',
    category: 'content',
    icon: Binary,
    keywords: ['json', 'validate', 'format', 'beautify', 'minify', 'repair', 'lint'],
    acceptsFiles: true,
  },
  {
    slug: 'image-compressor',
    name: 'Bulk Image Compressor',
    tagline: 'Compress and resize many images at once — entirely on your device.',
    problem:
      'Upload limits and slow pages are usually one oversized hero image. Drop a folder in, get WebP or JPEG at the size you need, and download everything as a ZIP. Nothing is uploaded anywhere.',
    category: 'data',
    icon: ImageDown,
    keywords: ['image', 'compress', 'resize', 'webp', 'jpeg', 'optimise', 'bulk', 'batch'],
    acceptsFiles: true,
  },
  {
    slug: 'csv-json',
    name: 'CSV ⇄ JSON Converter',
    tagline: 'Move between spreadsheets and APIs in both directions, with real type inference.',
    problem:
      'Spreadsheet people send CSV, developers need JSON, and naive splitting on commas destroys quoted fields. This handles quotes, embedded newlines, ragged rows and nested structures.',
    category: 'data',
    icon: Table2,
    keywords: ['csv', 'json', 'convert', 'spreadsheet', 'excel', 'tsv', 'data'],
    acceptsFiles: true,
  },
  {
    slug: 'file-renamer',
    name: 'Bulk File Renamer',
    tagline: 'Rename or re-extension hundreds of files with a live, validated preview.',
    problem:
      'Batch renaming is destructive and error-prone. Here you see every result before committing, with collisions, illegal characters and Windows reserved names flagged in advance.',
    category: 'data',
    icon: FileType2,
    keywords: ['rename', 'batch', 'extension', 'files', 'bulk', 'slugify'],
    acceptsFiles: true,
  },
  {
    slug: 'timezone-planner',
    name: 'Time Zone Meeting Planner',
    tagline: 'Find the hour that is least awful for everyone, across any number of zones.',
    problem:
      'Scheduling across zones means mental arithmetic plus a DST trap twice a year. This scores every slot in the day against each participant’s working hours and exports a calendar invite.',
    category: 'productivity',
    icon: Clock,
    keywords: ['timezone', 'meeting', 'schedule', 'utc', 'planner', 'world clock', 'dst'],
    acceptsFiles: false,
  },
  {
    slug: 'svg-generator',
    name: 'SVG Wave & Blob Generator',
    tagline: 'Generate organic section dividers and background shapes, copy as SVG, CSS or JSX.',
    problem:
      'Every landing page needs a wave divider or a soft blob, and nobody wants to open a vector editor for it. Tune it with sliders, keep the seed you like, copy the markup.',
    category: 'productivity',
    icon: Waves,
    keywords: ['svg', 'wave', 'blob', 'divider', 'background', 'generator', 'shape', 'design'],
    acceptsFiles: false,
  },
  {
    slug: 'text-diff',
    name: 'Smart Text Diff',
    tagline: 'See exactly what changed between two blocks of text, down to the word.',
    problem:
      'Spotting the one changed character between two config files by eye does not work. This aligns the two sides, highlights word-level changes inside modified lines and exports a unified patch.',
    category: 'productivity',
    icon: GitCompareArrows,
    keywords: ['diff', 'compare', 'text', 'changes', 'merge', 'patch', 'unified'],
    acceptsFiles: true,
  },
  {
    slug: 'password-generator',
    name: 'Password & Passphrase Generator',
    tagline: 'Cryptographically secure passwords and memorable passphrases, with honest entropy.',
    problem:
      'Most generators use Math.random and quote a strength score they invented. This uses the Web Crypto API with unbiased sampling and shows the real entropy in bits and the time to crack it.',
    category: 'productivity',
    icon: KeyRound,
    keywords: ['password', 'passphrase', 'generator', 'secure', 'random', 'entropy', 'diceware'],
    acceptsFiles: false,
  },
];

export const TOOLS_BY_SLUG: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((tool) => [tool.slug, tool]),
);

export function toolsByCategory(category: ToolCategory): Tool[] {
  return TOOLS.filter((tool) => tool.category === category);
}

/** Simple relevance search over name, tagline and keywords. */
export function searchTools(query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  const terms = q.split(/\s+/);
  return TOOLS.map((tool) => {
    const haystack = `${tool.name} ${tool.tagline} ${tool.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (tool.name.toLowerCase().includes(term)) score += 10;
      if (tool.keywords.some((k) => k.startsWith(term))) score += 6;
      if (haystack.includes(term)) score += 2;
    }
    return { tool, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}
