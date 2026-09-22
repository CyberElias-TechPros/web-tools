import type { ComponentType } from 'react';

type Loader = () => Promise<{ default: ComponentType }>;

/**
 * Every tool is a separate lazy chunk. The landing page and shell stay in the
 * initial bundle so the first paint is instant; a tool's code (and only that
 * tool's code) downloads when the user opens it.
 */
export const TOOL_LOADERS: Record<string, Loader> = {
  /* Documents & PDF */
  'word-to-pdf': () => import('@/tools/wordpdf/WordToPdfTool'),
  'pdf-merge': () => import('@/tools/pdfmerge/PdfMergeTool'),
  'pdf-split': () => import('@/tools/pdfsplit/PdfSplitTool'),
  'pdf-organizer': () => import('@/tools/pdforganize/PdfOrganizeTool'),
  'pdf-to-images': () => import('@/tools/pdfimages/PdfToImagesTool'),
  'images-to-pdf': () => import('@/tools/imagespdf/ImagesToPdfTool'),
  'pdf-text-extractor': () => import('@/tools/pdftext/PdfTextTool'),
  'pdf-metadata': () => import('@/tools/pdfmeta/PdfMetadataTool'),
  'pdf-watermark': () => import('@/tools/pdfwatermark/PdfWatermarkTool'),
  'markdown-to-pdf': () => import('@/tools/mdpdf/MarkdownToPdfTool'),
  'docx-converter': () => import('@/tools/docxconvert/DocxConvertTool'),
  'spreadsheet-converter': () => import('@/tools/xlsx/SpreadsheetTool'),
  'pptx-extractor': () => import('@/tools/pptx/PptxTool'),

  /* Text & writing */
  'markdown-to-text': () => import('@/tools/markdown/MarkdownTool'),
  'text-diff': () => import('@/tools/diff/DiffTool'),
  'case-converter': () => import('@/tools/textcase/CaseTool'),
  'slug-generator': () => import('@/tools/slug/SlugTool'),
  'lorem-ipsum': () => import('@/tools/lorem/LoremTool'),
  'line-tools': () => import('@/tools/lines/LinesTool'),
  'word-counter': () => import('@/tools/wordcount/WordCountTool'),
  'text-cleaner': () => import('@/tools/cleaner/CleanerTool'),
  'unicode-inspector': () => import('@/tools/unicode/UnicodeTool'),
  'string-escaper': () => import('@/tools/escaper/EscaperTool'),
  'fancy-text': () => import('@/tools/fancy/FancyTextTool'),

  /* Developer utilities */
  'regex-tester': () => import('@/tools/regex/RegexTool'),
  'json-formatter': () => import('@/tools/json/JsonTool'),
  base64: () => import('@/tools/base64/Base64Tool'),
  'url-encoder': () => import('@/tools/url/UrlTool'),
  'html-entities': () => import('@/tools/entities/EntitiesTool'),
  'jwt-decoder': () => import('@/tools/jwt/JwtTool'),
  'hash-generator': () => import('@/tools/hash/HashTool'),
  'uuid-generator': () => import('@/tools/uuid/UuidTool'),
  'timestamp-converter': () => import('@/tools/timestamp/TimestampTool'),
  'cron-parser': () => import('@/tools/cron/CronTool'),
  'json-to-types': () => import('@/tools/jsontypes/JsonTypesTool'),
  'xml-formatter': () => import('@/tools/xml/XmlTool'),
  'yaml-json': () => import('@/tools/yaml/YamlTool'),
  'sql-formatter': () => import('@/tools/sql/SqlTool'),
  'css-formatter': () => import('@/tools/css/CssTool'),
  'html-formatter': () => import('@/tools/html/HtmlTool'),
  'number-base': () => import('@/tools/numbase/NumberBaseTool'),
  'chmod-calculator': () => import('@/tools/chmod/ChmodTool'),
  'text-encryptor': () => import('@/tools/encrypt/EncryptTool'),
  'morse-binary': () => import('@/tools/morse/MorseTool'),

  /* Images & design */
  'image-compressor': () => import('@/tools/image/ImageTool'),
  'svg-generator': () => import('@/tools/svg/SvgTool'),
  'image-converter': () => import('@/tools/imgconvert/ImageConvertTool'),
  'image-resizer': () => import('@/tools/resize/ResizeTool'),
  'favicon-generator': () => import('@/tools/favicon/FaviconTool'),
  'color-converter': () => import('@/tools/color/ColorTool'),
  'contrast-checker': () => import('@/tools/contrast/ContrastTool'),
  'palette-generator': () => import('@/tools/palette/PaletteTool'),
  'palette-extractor': () => import('@/tools/extract/PaletteExtractTool'),
  'qr-generator': () => import('@/tools/qr/QrTool'),
  'exif-viewer': () => import('@/tools/exif/ExifTool'),
  'svg-optimizer': () => import('@/tools/svgopt/SvgOptimizeTool'),
  'placeholder-generator': () => import('@/tools/placeholder/PlaceholderTool'),
  'gradient-generator': () => import('@/tools/gradient/GradientTool'),
  'image-to-base64': () => import('@/tools/imgbase64/ImageBase64Tool'),

  /* Files & data */
  'csv-json': () => import('@/tools/csv/CsvTool'),
  'file-renamer': () => import('@/tools/rename/RenameTool'),
  'zip-extractor': () => import('@/tools/unzip/UnzipTool'),
  'zip-creator': () => import('@/tools/zipcreate/ZipCreateTool'),
  'file-inspector': () => import('@/tools/inspect/InspectTool'),
  'file-checksum': () => import('@/tools/checksum/ChecksumTool'),
  'mock-data': () => import('@/tools/mockdata/MockDataTool'),

  /* Time & dates */
  'timezone-planner': () => import('@/tools/timezone/TimezoneTool'),
  'date-calculator': () => import('@/tools/datecalc/DateCalcTool'),
  'age-calculator': () => import('@/tools/age/AgeTool'),
  'countdown-timer': () => import('@/tools/countdown/CountdownTool'),

  /* Everyday calculators */
  'password-generator': () => import('@/tools/password/PasswordTool'),
  'unit-converter': () => import('@/tools/units/UnitsTool'),
  'loan-calculator': () => import('@/tools/loan/LoanTool'),
  'compound-interest': () => import('@/tools/compound/CompoundTool'),
  'tip-calculator': () => import('@/tools/tip/TipTool'),
  'vat-calculator': () => import('@/tools/vat/VatTool'),
  'percentage-calculator': () => import('@/tools/percent/PercentTool'),
  'random-picker': () => import('@/tools/randompick/RandomTool'),
  'bmi-calculator': () => import('@/tools/bmi/BmiTool'),
};
