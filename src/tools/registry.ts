import type { LucideIcon } from 'lucide-react';
import {
  ALargeSmall,
  Archive,
  Binary,
  BookOpenText,
  Braces,
  Cake,
  Calculator,
  CalendarClock,
  CalendarDays,
  Camera,
  CaseSensitive,
  Clock,
  Coins,
  Combine,
  Contrast,
  Crop,
  Database,
  Dice5,
  Eraser,
  FileCheck2,
  FileCode2,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FileType2,
  Fingerprint,
  FolderArchive,
  GitCompareArrows,
  Hash,
  HeartPulse,
  Hourglass,
  ImageDown,
  ImagePlus,
  Images,
  KeyRound,
  Landmark,
  Layers,
  Link2,
  ListOrdered,
  Lock,
  Paintbrush,
  Palette,
  Percent,
  Pilcrow,
  Pipette,
  Presentation,
  QrCode,
  Radio,
  Receipt,
  Regex,
  Ruler,
  Scissors,
  SearchCode,
  ShieldCheck,
  Sparkles,
  Stamp,
  SwatchBook,
  Table2,
  Tags,
  Terminal,
  TextSelect,
  Timer,
  TrendingUp,
  Type,
  Users,
  Wand2,
  Waves,
} from 'lucide-react';

export type ToolCategory = 'documents' | 'text' | 'developer' | 'design' | 'data' | 'time' | 'everyday';

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

export interface CategoryInfo {
  label: string;
  /** Short display title used in big chapter headings. */
  title: string;
  description: string;
  /** OKLCH hue used to tint cards and icons for this category. */
  hue: number;
}

export const CATEGORY_ORDER: ToolCategory[] = ['documents', 'text', 'developer', 'design', 'data', 'time', 'everyday'];

export const CATEGORIES: Record<ToolCategory, CategoryInfo> = {
  documents: {
    label: 'Documents & PDF',
    title: 'Documents',
    description: 'Combine, split, convert and clean up Word, PDF, Excel and PowerPoint files.',
    hue: 25,
  },
  text: {
    label: 'Text & writing',
    title: 'Text',
    description: 'Clean, transform, count and inspect text down to the last invisible character.',
    hue: 60,
  },
  developer: {
    label: 'Developer utilities',
    title: 'Developer',
    description: 'Encode, decode, format, hash and inspect the things developers touch every day.',
    hue: 200,
  },
  design: {
    label: 'Images & design',
    title: 'Design',
    description: 'Convert and compress images, build palettes, gradients, icons and QR codes.',
    hue: 300,
  },
  data: {
    label: 'Files & data',
    title: 'Files',
    description: 'Convert, bundle, inspect and rename files without letting them leave your machine.',
    hue: 150,
  },
  time: {
    label: 'Time & dates',
    title: 'Time',
    description: 'Plan across zones, count days, work out ages and keep track of what is coming.',
    hue: 250,
  },
  everyday: {
    label: 'Everyday calculators',
    title: 'Everyday',
    description: 'Money, measurements, chance and passwords — the small maths of daily life.',
    hue: 100,
  },
};

export const TOOLS: Tool[] = [
  /* ---------------------------------------------------------------------- */
  /* Documents & PDF                                                        */
  /* ---------------------------------------------------------------------- */
  {
    slug: 'word-to-pdf',
    name: 'Word to PDF Combiner',
    tagline: 'Turn one or many .docx files into a single, clean PDF — headings, lists, tables and images included.',
    problem:
      'Combining a handful of Word documents into one PDF normally means opening each one, exporting, then merging the exports in yet another tool. Drop the .docx files here, order them, and download one PDF. Nothing is uploaded.',
    category: 'documents',
    icon: FileText,
    keywords: ['docx', 'word', 'pdf', 'convert', 'combine', 'merge', 'document', 'office'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-merge',
    name: 'PDF Merger',
    tagline: 'Combine PDFs into one file, in any order, with thumbnails so you know what you are joining.',
    problem:
      'Scans, invoices and signed pages arrive as separate PDFs and need to become one. Drop them in, drag to reorder, pick page ranges if you only need part of a file, and download the result.',
    category: 'documents',
    icon: Combine,
    keywords: ['pdf', 'merge', 'combine', 'join', 'concatenate', 'append'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-split',
    name: 'PDF Splitter',
    tagline: 'Extract pages or page ranges from a PDF, or burst it into one file per page.',
    problem:
      'You need pages 3–5 of a forty-page report, or every chapter as its own file. Type a range like “1-3, 7, 10-end”, preview what will be produced, and download individual PDFs or a ZIP.',
    category: 'documents',
    icon: Scissors,
    keywords: ['pdf', 'split', 'extract', 'pages', 'range', 'burst', 'separate'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-organizer',
    name: 'PDF Page Organizer',
    tagline: 'Rotate, delete and reorder PDF pages visually, then save a new file.',
    problem:
      'A page scanned upside down, a blank page in the middle, two pages swapped. Here every page is a thumbnail you can rotate, remove or move, and the export writes a fresh PDF with your layout.',
    category: 'documents',
    icon: Layers,
    keywords: ['pdf', 'rotate', 'reorder', 'delete', 'pages', 'organise', 'arrange'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-to-images',
    name: 'PDF to Images',
    tagline: 'Render PDF pages to PNG, JPEG or WebP at the resolution you choose.',
    problem:
      'Screenshots of PDFs are blurry and cropped. This rasterises each page at a real DPI, with transparent or white backgrounds, and downloads them individually or as a ZIP.',
    category: 'documents',
    icon: FileImage,
    keywords: ['pdf', 'png', 'jpeg', 'webp', 'image', 'render', 'convert', 'thumbnail'],
    acceptsFiles: true,
  },
  {
    slug: 'images-to-pdf',
    name: 'Images to PDF',
    tagline: 'Put photos, scans and screenshots onto PDF pages with margins and fit options.',
    problem:
      'A stack of phone photos of receipts needs to become one document. Choose page size, orientation and margins, order the images, and get a properly sized PDF with each image fitted to its page.',
    category: 'documents',
    icon: Images,
    keywords: ['jpg', 'png', 'image', 'photo', 'pdf', 'convert', 'scan', 'combine'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-text-extractor',
    name: 'PDF Text Extractor',
    tagline: 'Pull the text out of a PDF page by page, search it, and export as TXT or Markdown.',
    problem:
      'Copying text out of a PDF viewer loses line breaks, merges columns and stops at page boundaries. This extracts every page with its layout preserved as well as possible, and lets you search across the whole file.',
    category: 'documents',
    icon: TextSelect,
    keywords: ['pdf', 'text', 'extract', 'copy', 'search', 'ocr', 'txt'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-metadata',
    name: 'PDF Metadata Editor',
    tagline: 'See and edit a PDF’s title, author, subject and keywords — or strip them entirely.',
    problem:
      'PDFs quietly carry the author’s name, the software used and the creation date. View everything a file reveals, correct it before sending, or remove it all with one click.',
    category: 'documents',
    icon: Tags,
    keywords: ['pdf', 'metadata', 'author', 'title', 'properties', 'privacy', 'strip', 'edit'],
    acceptsFiles: true,
  },
  {
    slug: 'pdf-watermark',
    name: 'PDF Watermark & Page Numbers',
    tagline: 'Stamp a diagonal text watermark and add page numbers to any PDF.',
    problem:
      'Marking a draft “CONFIDENTIAL” or numbering a merged document should not need a paid PDF editor. Set the text, angle, opacity and colour, preview it on the first page, and download.',
    category: 'documents',
    icon: Stamp,
    keywords: ['pdf', 'watermark', 'stamp', 'page numbers', 'draft', 'confidential', 'footer'],
    acceptsFiles: true,
  },
  {
    slug: 'markdown-to-pdf',
    name: 'Markdown to PDF',
    tagline: 'Write or paste Markdown and download a typeset PDF or standalone HTML.',
    problem:
      'README files, notes and specs live in Markdown, but people want a PDF. This renders headings, lists, tables, code blocks and links with sensible typography and page numbers.',
    category: 'documents',
    icon: FileCode2,
    keywords: ['markdown', 'md', 'pdf', 'html', 'export', 'convert', 'document'],
    acceptsFiles: true,
  },
  {
    slug: 'docx-converter',
    name: 'Word to Markdown & HTML',
    tagline: 'Convert .docx to Markdown, clean HTML or plain text without losing the structure.',
    problem:
      'Pasting from Word into a wiki, CMS or repository brings a mess of styles. This reads the document itself — headings, lists, tables, links, footnotes — and writes clean Markdown or HTML.',
    category: 'documents',
    icon: Pilcrow,
    keywords: ['docx', 'word', 'markdown', 'html', 'text', 'convert', 'export'],
    acceptsFiles: true,
  },
  {
    slug: 'spreadsheet-converter',
    name: 'Excel to CSV & JSON',
    tagline: 'Open .xlsx workbooks in the browser and export any sheet as CSV, JSON or Markdown.',
    problem:
      'Getting data out of a spreadsheet for a script or an API should not require Excel. Drop the workbook, preview each sheet with real dates and numbers, and export exactly the shape you need.',
    category: 'documents',
    icon: FileSpreadsheet,
    keywords: ['xlsx', 'excel', 'spreadsheet', 'csv', 'json', 'convert', 'sheet', 'table'],
    acceptsFiles: true,
  },
  {
    slug: 'pptx-extractor',
    name: 'PowerPoint Text Extractor',
    tagline: 'Get the text and speaker notes out of a .pptx as Markdown or plain text, slide by slide.',
    problem:
      'Turning a deck into notes, a script or a summary means clicking through every slide. This reads the slides and their notes in order and writes them out as a clean outline.',
    category: 'documents',
    icon: Presentation,
    keywords: ['pptx', 'powerpoint', 'slides', 'notes', 'text', 'extract', 'outline'],
    acceptsFiles: true,
  },

  /* ---------------------------------------------------------------------- */
  /* Text & writing                                                         */
  /* ---------------------------------------------------------------------- */
  {
    slug: 'markdown-to-text',
    name: 'Markdown to Clean Text',
    tagline: 'Strip Markdown and rich-text artefacts down to clean, paste-ready plain text.',
    problem:
      'Copying between editors drags along asterisks, stray links, smart quotes and invisible characters. This removes them while keeping the structure a human actually reads.',
    category: 'text',
    icon: CaseSensitive,
    keywords: ['markdown', 'plain text', 'strip formatting', 'clean', 'converter', 'unicode'],
    acceptsFiles: true,
  },
  {
    slug: 'text-diff',
    name: 'Smart Text Diff',
    tagline: 'See exactly what changed between two blocks of text, down to the word.',
    problem:
      'Spotting the one changed character between two config files by eye does not work. This aligns the two sides, highlights word-level changes inside modified lines and exports a unified patch.',
    category: 'text',
    icon: GitCompareArrows,
    keywords: ['diff', 'compare', 'text', 'changes', 'merge', 'patch', 'unified'],
    acceptsFiles: true,
  },
  {
    slug: 'case-converter',
    name: 'Case Converter',
    tagline: 'Switch between camelCase, snake_case, kebab-case, Title Case and a dozen more — with smart word splitting.',
    problem:
      'Renaming a variable, a header or a filename by hand is tedious and error-prone. Paste any text, see every case at once, and copy the one you need. Acronyms and numbers are handled properly.',
    category: 'text',
    icon: ALargeSmall,
    keywords: ['case', 'camel', 'snake', 'kebab', 'pascal', 'title', 'uppercase', 'lowercase', 'convert'],
    acceptsFiles: false,
  },
  {
    slug: 'slug-generator',
    name: 'Slug Generator',
    tagline: 'Make clean URL slugs and file names from any title, with accents transliterated and stop words optional.',
    problem:
      'CMS slugs made from “Café & Résumé — Part 2!” end up ugly or broken. This transliterates accents, removes punctuation, collapses separators and shows the result as you type.',
    category: 'text',
    icon: Link2,
    keywords: ['slug', 'url', 'seo', 'filename', 'kebab', 'permalink', 'transliterate'],
    acceptsFiles: false,
  },
  {
    slug: 'lorem-ipsum',
    name: 'Lorem Ipsum Generator',
    tagline: 'Placeholder paragraphs, sentences, words and lists — classic Latin or readable English.',
    problem:
      'Mock-ups need filler text of a specific length, and copy-pasting the same paragraph five times looks wrong. Pick the unit and the count, choose a flavour, and copy it as text, HTML or Markdown.',
    category: 'text',
    icon: Type,
    keywords: ['lorem', 'ipsum', 'placeholder', 'dummy text', 'filler', 'generator'],
    acceptsFiles: false,
  },
  {
    slug: 'line-tools',
    name: 'Line Sorter & Deduplicator',
    tagline: 'Sort, deduplicate, trim, number, shuffle, reverse and filter lines of text in one place.',
    problem:
      'Lists of emails, URLs or IDs come with duplicates, stray whitespace and random order. Chain the operations you need, see the counts change live, and copy the cleaned list.',
    category: 'text',
    icon: ListOrdered,
    keywords: ['sort', 'dedupe', 'unique', 'lines', 'trim', 'shuffle', 'reverse', 'number', 'filter'],
    acceptsFiles: true,
  },
  {
    slug: 'word-counter',
    name: 'Word Counter & Readability',
    tagline: 'Words, characters, sentences, reading time and readability scores, plus the most used words.',
    problem:
      'Character limits, reading levels and word counts matter for essays, tweets, ads and product copy. Paste text and get every count instantly, with Flesch, Gunning fog and reading time.',
    category: 'text',
    icon: BookOpenText,
    keywords: ['word count', 'character count', 'readability', 'flesch', 'reading time', 'keywords', 'statistics'],
    acceptsFiles: true,
  },
  {
    slug: 'text-cleaner',
    name: 'Invisible Character Cleaner',
    tagline: 'Find and remove zero-width spaces, smart quotes, stray whitespace and other invisible junk.',
    problem:
      'A config value “looks right” but fails because of a zero-width space or a non-breaking space pasted from a web page. This highlights every hidden character and cleans them with one click.',
    category: 'text',
    icon: Eraser,
    keywords: ['zero width', 'invisible', 'whitespace', 'clean', 'smart quotes', 'unicode', 'normalize'],
    acceptsFiles: true,
  },
  {
    slug: 'unicode-inspector',
    name: 'Unicode Character Inspector',
    tagline: 'Break any text into code points with names, blocks, UTF-8 bytes and escape sequences.',
    problem:
      'Is that an em dash or a hyphen? A Cyrillic “а” or a Latin “a”? Paste text and see every character’s code point, name, category, UTF-8 and UTF-16 encodings, and how to escape it.',
    category: 'text',
    icon: SearchCode,
    keywords: ['unicode', 'code point', 'utf-8', 'character', 'inspect', 'emoji', 'escape'],
    acceptsFiles: false,
  },
  {
    slug: 'string-escaper',
    name: 'String Escaper',
    tagline: 'Escape and unescape strings for JavaScript, JSON, HTML, CSV, shell, regex and more.',
    problem:
      'Getting a multi-line string with quotes into a JSON file or a shell command by hand always breaks somewhere. Pick the target language and copy a correctly escaped literal.',
    category: 'text',
    icon: Terminal,
    keywords: ['escape', 'unescape', 'json', 'javascript', 'shell', 'regex', 'string', 'quote'],
    acceptsFiles: false,
  },
  {
    slug: 'fancy-text',
    name: 'Fancy Unicode Text',
    tagline: 'Turn plain text into 𝗯𝗼𝗹𝗱, 𝘪𝘵𝘢𝘭𝘪𝘤, 𝚖𝚘𝚗𝚘, ⓒⓘⓡⓒⓛⓔⓓ and other Unicode styles for bios and posts.',
    problem:
      'Platforms that do not allow formatting still render Unicode mathematical alphabets. See your text in every style at once and copy the one you want, with a note on screen-reader impact.',
    category: 'text',
    icon: Sparkles,
    keywords: ['fancy', 'unicode', 'bold', 'italic', 'font', 'instagram', 'twitter', 'bio', 'style'],
    acceptsFiles: false,
  },

  /* ---------------------------------------------------------------------- */
  /* Developer utilities                                                    */
  /* ---------------------------------------------------------------------- */
  {
    slug: 'regex-tester',
    name: 'Regex Visualiser & Tester',
    tagline: 'Test a pattern live, see it explained in plain English, and catch dangerous ones.',
    problem:
      'Regular expressions are write-only. This shows every match as you type, breaks the pattern into a readable tree and warns about catastrophic backtracking before it reaches production.',
    category: 'developer',
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
    category: 'developer',
    icon: Binary,
    keywords: ['json', 'validate', 'format', 'beautify', 'minify', 'repair', 'lint'],
    acceptsFiles: true,
  },
  {
    slug: 'base64',
    name: 'Base64 Encoder & Decoder',
    tagline: 'Encode text and files to Base64 (standard or URL-safe) and decode it back, UTF-8 correct.',
    problem:
      'btoa() breaks on anything outside ASCII and decoders silently accept garbage. This handles Unicode properly, detects data URIs, shows byte sizes, and decodes files back to downloads.',
    category: 'developer',
    icon: Binary,
    keywords: ['base64', 'encode', 'decode', 'data uri', 'url safe', 'binary'],
    acceptsFiles: true,
  },
  {
    slug: 'url-encoder',
    name: 'URL Encoder & Parser',
    tagline: 'Percent-encode or decode text and take any URL apart into scheme, host, path and query parameters.',
    problem:
      'encodeURI and encodeURIComponent do different things and both differ from form encoding. Pick the right one, and paste a long URL to see every query parameter decoded in a table.',
    category: 'developer',
    icon: Link2,
    keywords: ['url', 'encode', 'decode', 'percent', 'query string', 'parse', 'uri'],
    acceptsFiles: false,
  },
  {
    slug: 'html-entities',
    name: 'HTML Entity Encoder',
    tagline: 'Escape text for HTML with named or numeric entities, and decode any entity back to characters.',
    problem:
      'Putting user text or code samples into HTML safely needs &lt; &amp; and friends; reading entity soup needs the reverse. Both directions, with a full named-entity table.',
    category: 'developer',
    icon: Braces,
    keywords: ['html', 'entities', 'escape', 'unescape', 'encode', 'decode', '&amp;'],
    acceptsFiles: false,
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT Decoder & Verifier',
    tagline: 'Decode a JSON Web Token’s header and claims, check expiry, and verify HMAC signatures locally.',
    problem:
      'Pasting production tokens into a random website is a bad idea. This decodes them in your browser, explains each registered claim in plain language, flags expired tokens and can verify HS256/384/512 with your secret.',
    category: 'developer',
    icon: Fingerprint,
    keywords: ['jwt', 'token', 'decode', 'verify', 'claims', 'hs256', 'oauth', 'auth'],
    acceptsFiles: false,
  },
  {
    slug: 'hash-generator',
    name: 'Hash & HMAC Generator',
    tagline: 'MD5, SHA-1, SHA-256, SHA-384, SHA-512, CRC32 and HMAC for any text, computed instantly.',
    problem:
      'Checking a digest or producing an HMAC signature usually means a terminal and remembering flags. Type or paste text, see every algorithm side by side, and compare against an expected value.',
    category: 'developer',
    icon: Hash,
    keywords: ['hash', 'md5', 'sha256', 'sha1', 'sha512', 'hmac', 'crc32', 'checksum', 'digest'],
    acceptsFiles: false,
  },
  {
    slug: 'uuid-generator',
    name: 'UUID & ULID Generator',
    tagline: 'Generate v4, v7, v1 and v5 UUIDs, ULIDs and nanoids in bulk, and inspect any UUID’s version and timestamp.',
    problem:
      'Test fixtures, database seeds and API examples need identifiers that look real. Generate as many as you need in the format you use, and decode the timestamp hidden inside v1, v7 and ULID values.',
    category: 'developer',
    icon: Fingerprint,
    keywords: ['uuid', 'guid', 'ulid', 'nanoid', 'generate', 'unique id', 'v4', 'v7'],
    acceptsFiles: false,
  },
  {
    slug: 'timestamp-converter',
    name: 'Unix Timestamp Converter',
    tagline: 'Convert between Unix seconds/milliseconds, ISO 8601 and human dates in any time zone.',
    problem:
      'Is 1712345678 seconds or milliseconds? Which day is it in Tokyo? Paste any timestamp or date and see every representation at once, with relative time and ISO week.',
    category: 'developer',
    icon: CalendarClock,
    keywords: ['unix', 'epoch', 'timestamp', 'iso 8601', 'date', 'convert', 'milliseconds'],
    acceptsFiles: false,
  },
  {
    slug: 'cron-parser',
    name: 'Cron Expression Explainer',
    tagline: 'Translate a cron schedule into plain English and list the next runs.',
    problem:
      '“0 */6 * * 1-5” is easy to write and easy to get wrong. This explains the expression field by field, shows the next ten run times in your zone or UTC, and helps build one from options.',
    category: 'developer',
    icon: Timer,
    keywords: ['cron', 'crontab', 'schedule', 'explain', 'next run', 'job'],
    acceptsFiles: false,
  },
  {
    slug: 'json-to-types',
    name: 'JSON to TypeScript & Schema',
    tagline: 'Paste JSON and get TypeScript interfaces, Zod schemas, JSON Schema, Python dataclasses or Go structs.',
    problem:
      'Writing types for an API response by hand takes ages and misses optional fields. This infers types from real samples, merges array items, marks optional keys and emits the target you need.',
    category: 'developer',
    icon: FileJson2,
    keywords: ['json', 'typescript', 'types', 'interface', 'zod', 'json schema', 'python', 'go', 'generate'],
    acceptsFiles: true,
  },
  {
    slug: 'xml-formatter',
    name: 'XML Formatter & Converter',
    tagline: 'Pretty-print, minify and validate XML, or convert it to JSON and back.',
    problem:
      'Minified XML from a SOAP service or a config export is unreadable. Format it with the indent you like, get precise error positions when it is broken, and turn it into JSON for scripts.',
    category: 'developer',
    icon: FileCode2,
    keywords: ['xml', 'format', 'pretty', 'minify', 'validate', 'json', 'convert'],
    acceptsFiles: true,
  },
  {
    slug: 'yaml-json',
    name: 'YAML to JSON Converter',
    tagline: 'Convert YAML to JSON and JSON to YAML with validation and line-accurate errors.',
    problem:
      'Kubernetes manifests, CI configs and OpenAPI specs move between YAML and JSON constantly. Paste either, get the other, and see exactly where a bad indent broke the document.',
    category: 'developer',
    icon: Braces,
    keywords: ['yaml', 'yml', 'json', 'convert', 'kubernetes', 'config', 'validate'],
    acceptsFiles: true,
  },
  {
    slug: 'sql-formatter',
    name: 'SQL Formatter',
    tagline: 'Format SQL for PostgreSQL, MySQL, SQLite, T-SQL, BigQuery and more, or minify it back.',
    problem:
      'A 400-character query pasted from logs is impossible to review. Choose the dialect and keyword case, and get properly indented SQL that shows the structure of the joins and subqueries.',
    category: 'developer',
    icon: Database,
    keywords: ['sql', 'format', 'beautify', 'minify', 'postgres', 'mysql', 'query'],
    acceptsFiles: true,
  },
  {
    slug: 'css-formatter',
    name: 'CSS Formatter & Minifier',
    tagline: 'Beautify or minify CSS and see rule, selector and declaration statistics.',
    problem:
      'Minified CSS from a build is impossible to debug, and hand-written CSS bloats production. Format one way or the other, and see how many bytes the minified version saves.',
    category: 'developer',
    icon: Paintbrush,
    keywords: ['css', 'format', 'beautify', 'minify', 'prettify', 'stylesheet'],
    acceptsFiles: true,
  },
  {
    slug: 'html-formatter',
    name: 'HTML Formatter & Minifier',
    tagline: 'Indent messy HTML so it reads like a document, or minify it for delivery.',
    problem:
      'View-source and CMS exports produce HTML on a single line or with random indents. This re-indents the tree properly, preserves pre and script blocks, and can strip comments and whitespace.',
    category: 'developer',
    icon: FileCode2,
    keywords: ['html', 'format', 'beautify', 'indent', 'minify', 'markup'],
    acceptsFiles: true,
  },
  {
    slug: 'number-base',
    name: 'Number Base Converter',
    tagline: 'Convert between binary, octal, decimal, hex and any base 2–36, with Roman numerals, words and two’s complement.',
    problem:
      'Reading a permission mask, a colour value or a bit flag means converting bases in your head. Type a number in any base and see every other base, its bit pattern and its English words.',
    category: 'developer',
    icon: Calculator,
    keywords: ['binary', 'hex', 'octal', 'decimal', 'base', 'convert', 'roman', 'bits'],
    acceptsFiles: false,
  },
  {
    slug: 'chmod-calculator',
    name: 'Chmod Calculator',
    tagline: 'Turn checkboxes into chmod numbers like 755, explain symbolic modes and preview ls -l output.',
    problem:
      'Is it 644 or 664, and what does u+x actually do? Toggle read, write and execute for owner, group and others, and see the octal, symbolic and command forms update together.',
    category: 'developer',
    icon: Lock,
    keywords: ['chmod', 'permissions', 'unix', 'linux', 'octal', '755', '644', 'file mode'],
    acceptsFiles: false,
  },
  {
    slug: 'text-encryptor',
    name: 'AES Text Encryptor',
    tagline: 'Encrypt a message or file with a password using AES-256-GCM, and decrypt it anywhere with this page.',
    problem:
      'Sending a password or a secret note over chat leaves it readable forever. Encrypt it here with a passphrase (PBKDF2 + AES-GCM in the browser), share the ciphertext, and decrypt on the other side.',
    category: 'developer',
    icon: ShieldCheck,
    keywords: ['encrypt', 'decrypt', 'aes', 'password', 'secret', 'cipher', 'gcm', 'secure'],
    acceptsFiles: true,
  },
  {
    slug: 'morse-binary',
    name: 'Morse & Binary Translator',
    tagline: 'Translate text to Morse code, binary, hex or ROT13 and back again.',
    problem:
      'Puzzle hunts, radio hobbies and classroom demos all need quick encoding into Morse or binary. Type text or code in either box and the other follows live, with a Morse audio player.',
    category: 'developer',
    icon: Radio,
    keywords: ['morse', 'binary', 'rot13', 'hex', 'translate', 'cipher', 'code'],
    acceptsFiles: false,
  },

  /* ---------------------------------------------------------------------- */
  /* Images & design                                                        */
  /* ---------------------------------------------------------------------- */
  {
    slug: 'image-compressor',
    name: 'Bulk Image Compressor',
    tagline: 'Compress and resize many images at once — entirely on your device.',
    problem:
      'Upload limits and slow pages are usually one oversized hero image. Drop a folder in, get WebP or JPEG at the size you need, and download everything as a ZIP. Nothing is uploaded anywhere.',
    category: 'design',
    icon: ImageDown,
    keywords: ['image', 'compress', 'resize', 'webp', 'jpeg', 'optimise', 'bulk', 'batch'],
    acceptsFiles: true,
  },
  {
    slug: 'svg-generator',
    name: 'SVG Wave & Blob Generator',
    tagline: 'Generate organic section dividers and background shapes, copy as SVG, CSS or JSX.',
    problem:
      'Every landing page needs a wave divider or a soft blob, and nobody wants to open a vector editor for it. Tune it with sliders, keep the seed you like, copy the markup.',
    category: 'design',
    icon: Waves,
    keywords: ['svg', 'wave', 'blob', 'divider', 'background', 'generator', 'shape', 'design'],
    acceptsFiles: false,
  },
  {
    slug: 'image-converter',
    name: 'Image Format Converter',
    tagline: 'Convert between PNG, JPEG, WebP, AVIF, BMP, GIF, SVG and ICO in bulk.',
    problem:
      'A designer sends WebP, the CMS wants JPEG, the icon needs to be ICO. Drop any images, choose the target format and quality, flatten transparency onto a colour if needed, and download.',
    category: 'design',
    icon: ImagePlus,
    keywords: ['image', 'convert', 'png', 'jpeg', 'webp', 'avif', 'ico', 'svg', 'format'],
    acceptsFiles: true,
  },
  {
    slug: 'image-resizer',
    name: 'Image Resizer & Cropper',
    tagline: 'Resize to exact dimensions, crop to an aspect ratio, rotate and flip — with a live preview.',
    problem:
      'A profile photo needs to be 400×400, a banner 1500×500, an Open Graph image 1200×630. Pick a preset or your own size, choose how to crop or pad, and download at full quality.',
    category: 'design',
    icon: Crop,
    keywords: ['resize', 'crop', 'rotate', 'flip', 'aspect ratio', 'image', 'dimensions', 'scale'],
    acceptsFiles: true,
  },
  {
    slug: 'favicon-generator',
    name: 'Favicon Generator',
    tagline: 'Turn one image into a complete favicon set: ICO, PNGs, Apple touch icon, manifest and HTML tags.',
    problem:
      'Every site needs a dozen icon sizes in three formats plus a manifest. Drop a square logo or SVG and download the whole package as a ZIP with the exact tags to paste into <head>.',
    category: 'design',
    icon: Sparkles,
    keywords: ['favicon', 'ico', 'apple touch icon', 'manifest', 'pwa', 'icon', 'generate'],
    acceptsFiles: true,
  },
  {
    slug: 'color-converter',
    name: 'Color Converter',
    tagline: 'Convert between HEX, RGB, HSL, HWB, OKLCH, OKLAB, LAB and CMYK, with named colours and tints.',
    problem:
      'Design tokens arrive as HSL, the API wants hex, the new CSS spec prefers OKLCH. Paste any colour syntax and get every format, the nearest named colour, a tonal scale and colour-blind previews.',
    category: 'design',
    icon: Pipette,
    keywords: ['color', 'colour', 'hex', 'rgb', 'hsl', 'oklch', 'lab', 'cmyk', 'convert', 'picker'],
    acceptsFiles: false,
  },
  {
    slug: 'contrast-checker',
    name: 'Contrast Checker',
    tagline: 'Check text and background colours against WCAG 2 and APCA, with live samples and fix suggestions.',
    problem:
      'Grey-on-grey text fails accessibility audits and nobody notices until launch. Enter two colours to see the ratio, pass/fail for AA and AAA at every size, the APCA score, and the nearest passing shades.',
    category: 'design',
    icon: Contrast,
    keywords: ['contrast', 'wcag', 'apca', 'accessibility', 'a11y', 'color', 'ratio', 'aa', 'aaa'],
    acceptsFiles: false,
  },
  {
    slug: 'palette-generator',
    name: 'Color Palette Generator',
    tagline: 'Build harmonies, tonal scales and full design-token palettes from a single seed colour.',
    problem:
      'Picking five colours that work together is hard; picking fifty shades for a design system is harder. Start from one colour and get complementary, triadic and analogous sets plus 50–950 scales, exported as CSS, Tailwind, SCSS or JSON.',
    category: 'design',
    icon: SwatchBook,
    keywords: ['palette', 'color scheme', 'harmony', 'tailwind', 'design tokens', 'shades', 'generate'],
    acceptsFiles: false,
  },
  {
    slug: 'palette-extractor',
    name: 'Image Palette Extractor',
    tagline: 'Pull the dominant colours out of any photo or logo, pick exact pixels, and export swatches.',
    problem:
      'Matching a brand colour from a logo by eye never quite works. Drop the image, get its dominant palette with percentages, click anywhere to sample a pixel, and export to CSS, Tailwind or Adobe .ase.',
    category: 'design',
    icon: Palette,
    keywords: ['palette', 'extract', 'dominant colors', 'image', 'eyedropper', 'swatch', 'ase'],
    acceptsFiles: true,
  },
  {
    slug: 'qr-generator',
    name: 'QR Code Generator',
    tagline: 'QR codes for URLs, Wi-Fi, vCards, email, SMS, locations and events — as SVG or PNG with custom colours.',
    problem:
      'Online QR generators expire your codes or track scans. These are generated locally, never expire, and can encode Wi-Fi credentials or a contact card that phones recognise instantly.',
    category: 'design',
    icon: QrCode,
    keywords: ['qr', 'qr code', 'wifi', 'vcard', 'url', 'svg', 'png', 'generate'],
    acceptsFiles: false,
  },
  {
    slug: 'exif-viewer',
    name: 'EXIF Viewer & Remover',
    tagline: 'See the camera, GPS location and edit history stored in a photo, then strip it before sharing.',
    problem:
      'Photos carry your exact location and device details. View everything a JPEG, PNG, WebP or HEIC reveals, open the GPS point on a map, and download a copy with the metadata removed — without recompressing.',
    category: 'design',
    icon: Camera,
    keywords: ['exif', 'metadata', 'gps', 'photo', 'privacy', 'strip', 'remove', 'camera'],
    acceptsFiles: true,
  },
  {
    slug: 'svg-optimizer',
    name: 'SVG Optimizer',
    tagline: 'Shrink SVG files by removing editor cruft, comments and metadata, and export as data URI or React component.',
    problem:
      'SVGs exported from design tools are full of editor namespaces, ids and eight-decimal coordinates. Paste or drop one, see the size drop, and copy it as markup, a CSS data URI or a JSX component.',
    category: 'design',
    icon: Wand2,
    keywords: ['svg', 'optimise', 'minify', 'clean', 'svgo', 'data uri', 'react', 'jsx'],
    acceptsFiles: true,
  },
  {
    slug: 'placeholder-generator',
    name: 'Placeholder Image Generator',
    tagline: 'Generate placeholder images of any size with custom colours and text, as PNG or SVG.',
    problem:
      'Layouts need images before the real ones exist, and external placeholder services go offline or get blocked. Set the size, colours and label, and download or copy a data URI that never breaks.',
    category: 'design',
    icon: FileImage,
    keywords: ['placeholder', 'dummy image', 'mockup', 'png', 'svg', 'generate'],
    acceptsFiles: false,
  },
  {
    slug: 'gradient-generator',
    name: 'CSS Gradient Generator',
    tagline: 'Design linear, radial and conic gradients with multiple stops and copy the CSS, SVG or PNG.',
    problem:
      'Gradient syntax is fiddly and the interesting ones need four or five stops. Drag stops, tweak angles and colour spaces, preview on a full panel, and copy production-ready CSS.',
    category: 'design',
    icon: Paintbrush,
    keywords: ['gradient', 'css', 'linear', 'radial', 'conic', 'background', 'generate'],
    acceptsFiles: false,
  },
  {
    slug: 'image-to-base64',
    name: 'Image to Base64',
    tagline: 'Convert images to Base64 data URIs for CSS, HTML and JSON, or decode a data URI back to a file.',
    problem:
      'Small icons and logos are faster inlined than fetched. Drop an image, get the data URI plus ready-to-paste img, CSS and Markdown snippets, and see how big it really is.',
    category: 'design',
    icon: Binary,
    keywords: ['base64', 'data uri', 'image', 'inline', 'css', 'html', 'encode'],
    acceptsFiles: true,
  },

  /* ---------------------------------------------------------------------- */
  /* Files & data                                                           */
  /* ---------------------------------------------------------------------- */
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
    slug: 'zip-extractor',
    name: 'ZIP Extractor',
    tagline: 'Open a ZIP in the browser, browse its folders, preview text and images, and extract what you need.',
    problem:
      'Peeking into an archive should not mean unpacking it all onto your disk. Drop a .zip and browse it like a folder, preview files, and download one file, a folder or everything.',
    category: 'data',
    icon: FolderArchive,
    keywords: ['zip', 'extract', 'unzip', 'archive', 'browse', 'preview', 'files'],
    acceptsFiles: true,
  },
  {
    slug: 'zip-creator',
    name: 'ZIP Creator',
    tagline: 'Bundle files and folders into a compressed ZIP archive, with optional folder structure.',
    problem:
      'Sending twelve attachments is worse than sending one archive, and not every device has a good compression tool. Drop files (or a whole folder), organise them, and download a standards-compliant ZIP.',
    category: 'data',
    icon: Archive,
    keywords: ['zip', 'compress', 'archive', 'bundle', 'folder', 'create', 'files'],
    acceptsFiles: true,
  },
  {
    slug: 'file-inspector',
    name: 'File Type Inspector',
    tagline: 'Identify what a file really is from its magic bytes, view a hex dump and byte statistics.',
    problem:
      'Extensions lie: a “.jpg” that is a PNG, a “.pdf” that is HTML, an attachment with no extension at all. This reads the signature bytes, detects text encodings, and shows a hex dump you can search.',
    category: 'data',
    icon: SearchCode,
    keywords: ['file type', 'magic bytes', 'hex dump', 'mime', 'identify', 'binary', 'inspect'],
    acceptsFiles: true,
  },
  {
    slug: 'file-checksum',
    name: 'File Checksum Verifier',
    tagline: 'Compute SHA-256, SHA-1, MD5 and CRC32 of any file and compare against a published hash.',
    problem:
      'Downloads publish a checksum for a reason, but hardly anyone verifies it. Drop the file, paste the expected value, and get a clear match or mismatch — even for multi-gigabyte files, streamed locally.',
    category: 'data',
    icon: FileCheck2,
    keywords: ['checksum', 'sha256', 'md5', 'verify', 'hash', 'file', 'integrity', 'download'],
    acceptsFiles: true,
  },
  {
    slug: 'mock-data',
    name: 'Mock Data Generator',
    tagline: 'Generate realistic fake people, addresses, emails and dates as CSV, JSON or SQL, with a fixed seed.',
    problem:
      'Demos and tests need believable data, and typing “John Doe” fifty times is not it. Choose the fields and the row count, set a seed so it is reproducible, and export in the format your tool expects.',
    category: 'data',
    icon: Users,
    keywords: ['mock', 'fake data', 'test data', 'faker', 'csv', 'json', 'sql', 'seed', 'generate'],
    acceptsFiles: false,
  },

  /* ---------------------------------------------------------------------- */
  /* Time & dates                                                           */
  /* ---------------------------------------------------------------------- */
  {
    slug: 'timezone-planner',
    name: 'Time Zone Meeting Planner',
    tagline: 'Find the hour that is least awful for everyone, across any number of zones.',
    problem:
      'Scheduling across zones means mental arithmetic plus a DST trap twice a year. This scores every slot in the day against each participant’s working hours and exports a calendar invite.',
    category: 'time',
    icon: Clock,
    keywords: ['timezone', 'meeting', 'schedule', 'utc', 'planner', 'world clock', 'dst'],
    acceptsFiles: false,
  },
  {
    slug: 'date-calculator',
    name: 'Date Calculator',
    tagline: 'Days between two dates, add or subtract durations, count business days and find week numbers.',
    problem:
      '“Ninety days from the contract date, excluding weekends” is exactly the kind of thing people get wrong. Calculate differences and offsets precisely, with business-day and holiday options.',
    category: 'time',
    icon: CalendarDays,
    keywords: ['date', 'difference', 'days between', 'add days', 'business days', 'week number', 'duration'],
    acceptsFiles: false,
  },
  {
    slug: 'age-calculator',
    name: 'Age & Birthday Calculator',
    tagline: 'Exact age in years, months and days, next birthday countdown, zodiac sign and fun milestones.',
    problem:
      'Forms ask for age, celebrations need countdowns, and someone always wonders how many days old they are. Enter a birth date and get all of it, precise to the day.',
    category: 'time',
    icon: Cake,
    keywords: ['age', 'birthday', 'born', 'years old', 'zodiac', 'countdown', 'milestone'],
    acceptsFiles: false,
  },
  {
    slug: 'countdown-timer',
    name: 'Countdown Timer',
    tagline: 'A big, clear countdown or stopwatch with laps, alarms and a shareable link.',
    problem:
      'A full-screen, distraction-free timer for cooking, workouts, presentations and Pomodoro sessions, with a chime at zero, laps for the stopwatch, and a URL you can bookmark for the same duration.',
    category: 'time',
    icon: Hourglass,
    keywords: ['timer', 'countdown', 'stopwatch', 'pomodoro', 'alarm', 'laps'],
    acceptsFiles: false,
  },

  /* ---------------------------------------------------------------------- */
  /* Everyday calculators                                                   */
  /* ---------------------------------------------------------------------- */
  {
    slug: 'password-generator',
    name: 'Password & Passphrase Generator',
    tagline: 'Cryptographically secure passwords and memorable passphrases, with honest entropy.',
    problem:
      'Most generators use Math.random and quote a strength score they invented. This uses the Web Crypto API with unbiased sampling and shows the real entropy in bits and the time to crack it.',
    category: 'everyday',
    icon: KeyRound,
    keywords: ['password', 'passphrase', 'generator', 'secure', 'random', 'entropy', 'diceware'],
    acceptsFiles: false,
  },
  {
    slug: 'unit-converter',
    name: 'Unit Converter',
    tagline: 'Length, mass, temperature, area, volume, speed, data, energy, pressure, time, cooking and more.',
    problem:
      'Recipes in cups, specs in inches, files in mebibytes. Type a value, pick the units, and see the conversion plus a table of every related unit — including cooking weights per ingredient.',
    category: 'everyday',
    icon: Ruler,
    keywords: ['unit', 'convert', 'metric', 'imperial', 'temperature', 'length', 'weight', 'cooking'],
    acceptsFiles: false,
  },
  {
    slug: 'loan-calculator',
    name: 'Loan Calculator',
    tagline: 'Monthly payment, total interest and a full amortisation schedule for any loan or mortgage.',
    problem:
      'Lenders show the monthly figure and hide the total. See what a loan really costs, how extra payments shorten it, and how much of each instalment is interest versus principal.',
    category: 'everyday',
    icon: Landmark,
    keywords: ['loan', 'mortgage', 'amortisation', 'interest', 'monthly payment', 'emi', 'repayment'],
    acceptsFiles: false,
  },
  {
    slug: 'compound-interest',
    name: 'Compound Interest Calculator',
    tagline: 'Project savings and investments with compounding, regular contributions and inflation.',
    problem:
      'Small contributions over decades are hard to picture. Set the starting amount, rate, frequency and monthly deposits, and see the year-by-year growth and what it is worth in today’s money.',
    category: 'everyday',
    icon: TrendingUp,
    keywords: ['compound interest', 'savings', 'investment', 'growth', 'interest', 'retirement', 'calculator'],
    acceptsFiles: false,
  },
  {
    slug: 'tip-calculator',
    name: 'Tip Splitter',
    tagline: 'Work out the tip and split a bill fairly between any number of people, with rounding options.',
    problem:
      'At the end of a meal nobody wants to do arithmetic. Enter the bill, pick a percentage, choose how many people, and see each share — rounded up so the server does not lose out.',
    category: 'everyday',
    icon: Receipt,
    keywords: ['tip', 'split bill', 'restaurant', 'gratuity', 'share', 'calculator'],
    acceptsFiles: false,
  },
  {
    slug: 'vat-calculator',
    name: 'VAT & Sales Tax Calculator',
    tagline: 'Add or remove VAT, GST or sales tax from any amount, with common rates built in.',
    problem:
      'Working backwards from a gross price to the net amount trips people up every time. Enter either figure and a rate, and see net, tax and gross together with the formula used.',
    category: 'everyday',
    icon: Percent,
    keywords: ['vat', 'sales tax', 'gst', 'tax', 'net', 'gross', 'calculator', 'reverse'],
    acceptsFiles: false,
  },
  {
    slug: 'percentage-calculator',
    name: 'Percentage Calculator',
    tagline: 'What is X% of Y, X is what percent of Y, percentage change, and increase or decrease by a percent.',
    problem:
      'Percentages are simple until you need one under pressure. Four phrased calculators cover every form of the question, with the working shown so you can trust the answer.',
    category: 'everyday',
    icon: Calculator,
    keywords: ['percent', 'percentage', 'increase', 'decrease', 'change', 'discount', 'calculator'],
    acceptsFiles: false,
  },
  {
    slug: 'random-picker',
    name: 'Random Picker & Dice',
    tagline: 'Pick a random name, roll dice, flip coins, shuffle a list or split people into teams.',
    problem:
      'Who goes first, who presents, which teams? Paste a list of names or set a range, and get a fair result from the browser’s cryptographic random source — no rigging possible.',
    category: 'everyday',
    icon: Dice5,
    keywords: ['random', 'picker', 'dice', 'coin flip', 'shuffle', 'teams', 'name picker', 'lottery'],
    acceptsFiles: false,
  },
  {
    slug: 'bmi-calculator',
    name: 'BMI Calculator',
    tagline: 'Body mass index in metric or imperial units, with the healthy weight range for your height.',
    problem:
      'A quick, private BMI check with no sign-up and no data stored. Enter height and weight in whichever units you think in and see your BMI, category and the weight range considered healthy.',
    category: 'everyday',
    icon: HeartPulse,
    keywords: ['bmi', 'body mass index', 'weight', 'height', 'health', 'calculator'],
    acceptsFiles: false,
  },
];

export const TOOLS_BY_SLUG: Record<string, Tool> = Object.fromEntries(TOOLS.map((tool) => [tool.slug, tool]));

export function toolsByCategory(category: ToolCategory): Tool[] {
  return TOOLS.filter((tool) => tool.category === category);
}

/** Tools from the same category, for the "related" rail on tool pages. */
export function relatedTools(slug: string, limit = 4): Tool[] {
  const tool = TOOLS_BY_SLUG[slug];
  if (!tool) return [];
  const same = TOOLS.filter((t) => t.category === tool.category && t.slug !== slug);
  const index = same.findIndex((t) => t.slug > slug);
  const start = index === -1 ? 0 : index;
  const rotated = [...same.slice(start), ...same.slice(0, start)];
  return rotated.slice(0, limit);
}

/** Simple relevance search over name, tagline and keywords. */
export function searchTools(query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  const terms = q.split(/\s+/);
  return TOOLS.map((tool) => {
    const haystack = `${tool.name} ${tool.tagline} ${tool.keywords.join(' ')} ${CATEGORIES[tool.category].label}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (tool.name.toLowerCase().includes(term)) score += 10;
      if (tool.slug.includes(term)) score += 8;
      if (tool.keywords.some((k) => k.startsWith(term))) score += 6;
      if (haystack.includes(term)) score += 2;
    }
    return { tool, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}

export const CATEGORY_ICONS: Record<ToolCategory, LucideIcon> = {
  documents: FileText,
  text: Type,
  developer: Terminal,
  design: Palette,
  data: Database,
  time: Clock,
  everyday: Coins,
};
