import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, FileUp, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  Disclosure,
  FieldGroup,
  Panel,
  Segmented,
  Stat,
  Toasts,
  Toggle,
  useToasts,
} from '@/components/ui';
import { defaultMarkdownOptions, markdownToText, textStats } from '@/lib/markdown';
import type { MarkdownCleanOptions } from '@/lib/markdown';
import { downloadText, readFileAsText, safeFilename } from '@/lib/files';
import { useDebounced, useDropZone, useLocalStorage } from '@/hooks';

const SAMPLE = `---
title: Release notes
---

# Release notes — **v2.4**

We shipped a *lot* this month. Read the [changelog](https://example.com/changelog "Full log") for details.

## Highlights

- **Faster exports** — up to \`3x\` quicker on large files
- Fixed a bug where \\* escaped characters \\* leaked into output
- [x] Dark mode
- [ ] Offline sync

> Migration note: run \`npm run migrate\` before deploying.
> This is required.

| Feature   | Status | Owner |
| --------- | ------ | ----- |
| Exports   | Done   | Ada   |
| Sync      | WIP    | Grace |

\`\`\`bash
npm install
npm run build
\`\`\`

1. Pull the latest
2. Install dependencies
3. Ship it

<div class="callout">Some raw HTML with an <strong>inline tag</strong>.</div>

![Screenshot of the dashboard](/img/dashboard.png)

---

That’s it — “smart quotes”, em—dashes and ellipses… all handled.
`;

const STORAGE_KEY = 'wt:markdown:options';

export default function MarkdownTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [options, setOptions] = useLocalStorage<MarkdownCleanOptions>(
    STORAGE_KEY,
    defaultMarkdownOptions,
  );
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const debouncedInput = useDebounced(input, 120);

  const output = useMemo(() => {
    try {
      return markdownToText(debouncedInput, options);
    } catch (e) {
      return `Conversion failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [debouncedInput, options]);

  const inputStats = useMemo(() => textStats(input), [input]);
  const outputStats = useMemo(() => textStats(output), [output]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      try {
        const text = await readFileAsText(file, 10 * 1024 * 1024);
        setInput(text);
        push(`Loaded “${file.name}”.`, 'success');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [push],
  );

  const { dragging, handlers } = useDropZone(handleFiles);

  const set = <K extends keyof MarkdownCleanOptions>(
    key: K,
    value: MarkdownCleanOptions[K],
  ): void => setOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <ToolShell
      slug="markdown-to-text"
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={() => setInput(SAMPLE)}>
            <Wand2 size={14} aria-hidden />
            Load sample
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setOptions(defaultMarkdownOptions)}
            title="Reset all options to their defaults"
          >
            <RotateCcw size={14} aria-hidden />
            Reset options
          </button>
        </>
      }
    >
      {error && (
        <Callout tone="error" className="mb-3" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Panel
            title="Markdown in"
            actions={
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain"
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    void handleFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => fileInput.current?.click()}
                >
                  <FileUp size={14} aria-hidden />
                  Open file
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setInput('')}
                  disabled={!input}
                  aria-label="Clear input"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </>
            }
            className={dragging ? 'ring-2' : ''}
            bodyClassName="flex flex-col"
          >
            <div className="relative flex-1" {...handlers}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste Markdown here, or drop a .md file anywhere on this panel…"
                spellCheck={false}
                aria-label="Markdown input"
                className="code-area h-[52vh] min-h-64 w-full resize-y bg-transparent p-3 outline-none"
              />
              {dragging && (
                <div
                  className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border-2 border-dashed text-sm font-medium"
                  style={{
                    borderColor: 'var(--accent)',
                    background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                  }}
                >
                  Drop to load the file
                </div>
              )}
            </div>
            <div className="muted flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs">
              <span>{inputStats.characters.toLocaleString()} chars</span>
              <span>{inputStats.words.toLocaleString()} words</span>
              <span>{inputStats.lines.toLocaleString()} lines</span>
            </div>
          </Panel>

          <Panel
            title="Clean text out"
            actions={
              <>
                <CopyButton value={output} small />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!output.trim()}
                  onClick={() =>
                    downloadText(output, `${safeFilename('clean-text')}.txt`, 'text/plain')
                  }
                >
                  <Download size={14} aria-hidden />
                  <span className="hidden sm:inline">Download</span>
                </button>
              </>
            }
            bodyClassName="flex flex-col"
          >
            <textarea
              value={output}
              readOnly
              aria-label="Clean text output"
              placeholder="The cleaned text appears here as you type."
              spellCheck={false}
              className="code-area h-[52vh] min-h-64 w-full flex-1 resize-y bg-transparent p-3 outline-none"
            />
            <div className="muted flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs">
              <span>{outputStats.characters.toLocaleString()} chars</span>
              <span>{outputStats.words.toLocaleString()} words</span>
              <span>{outputStats.paragraphs.toLocaleString()} paragraphs</span>
              {inputStats.characters > 0 && (
                <span>
                  {Math.max(
                    0,
                    Math.round(
                      ((inputStats.characters - outputStats.characters) / inputStats.characters) *
                        100,
                    ),
                  )}
                  % smaller
                </span>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Options" bodyClassName="space-y-4 p-4">
          <FieldGroup label="Lists">
            <div className="space-y-2.5">
              <Toggle
                checked={options.keepListMarkers}
                onChange={(v) => set('keepListMarkers', v)}
                label="Keep list markers"
                hint="Renders bullets and numbering as literal text."
              />
              {options.keepListMarkers && (
                <div className="pl-6">
                  <Segmented
                    size="sm"
                    label="Bullet character"
                    value={options.bulletChar}
                    onChange={(v) => set('bulletChar', v)}
                    options={[
                      { value: '•', label: '•' },
                      { value: '-', label: '-' },
                      { value: '*', label: '*' },
                      { value: '·', label: '·' },
                    ]}
                  />
                </div>
              )}
            </div>
          </FieldGroup>

          <FieldGroup label="Content">
            <div className="space-y-2.5">
              <Toggle
                checked={options.keepLinkUrls}
                onChange={(v) => set('keepLinkUrls', v)}
                label="Keep link URLs"
                hint="Outputs “label (https://…)” instead of just the label."
              />
              <Toggle
                checked={options.keepCodeBlocks}
                onChange={(v) => set('keepCodeBlocks', v)}
                label="Keep code blocks"
              />
              <Toggle
                checked={options.keepTables}
                onChange={(v) => set('keepTables', v)}
                label="Align tables as columns"
                hint="Off: cells are joined with spaces."
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Whitespace">
            <div className="space-y-2.5">
              <Toggle
                checked={options.collapseBlankLines}
                onChange={(v) => set('collapseBlankLines', v)}
                label="Collapse blank lines"
              />
              <Toggle
                checked={options.trimTrailingSpaces}
                onChange={(v) => set('trimTrailingSpaces', v)}
                label="Trim trailing spaces"
              />
              <Toggle
                checked={options.unwrapParagraphs}
                onChange={(v) => set('unwrapParagraphs', v)}
                label="Unwrap paragraphs"
                hint="Joins hard-wrapped lines into one long line each."
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Characters">
            <div className="space-y-2.5">
              <Toggle
                checked={options.normalizeUnicode}
                onChange={(v) => set('normalizeUnicode', v)}
                label="Normalise smart punctuation"
                hint="Curly quotes → straight, em dash → hyphen, … → three dots."
              />
              <Toggle
                checked={options.stripInvisibles}
                onChange={(v) => set('stripInvisibles', v)}
                label="Strip invisible characters"
                hint="Removes zero-width spaces and soft hyphens that break search."
              />
            </div>
          </FieldGroup>

          <Disclosure summary="What gets removed">
            <ul className="muted list-disc space-y-1 pl-4 text-xs leading-relaxed">
              <li>Heading hashes, setext underlines and horizontal rules</li>
              <li>Bold, italic, strikethrough and highlight markers</li>
              <li>Inline and fenced code fences (contents kept by default)</li>
              <li>Link and image syntax, reference definitions and footnote markers</li>
              <li>Blockquote arrows, YAML front matter and HTML comments</li>
              <li>Raw HTML tags, with entities decoded and &lt;br&gt; turned into line breaks</li>
            </ul>
          </Disclosure>
        </Panel>
      </div>

      <div className="card mt-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="Reading time" value={`${outputStats.readingTimeMinutes} min`} />
        <Stat label="Words" value={outputStats.words.toLocaleString()} />
        <Stat label="Characters" value={outputStats.charactersNoSpaces.toLocaleString()} title="Excluding whitespace" />
        <Stat label="Lines" value={outputStats.lines.toLocaleString()} />
      </div>

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}
