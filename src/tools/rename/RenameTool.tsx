import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardPaste,
  FileType2,
  Package,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { ToolShell } from '@/components/ToolShell';
import {
  Callout,
  CopyButton,
  Disclosure,
  EmptyState,
  FieldGroup,
  Panel,
  Segmented,
  Stat,
  Toasts,
  Toggle,
  useToasts,
} from '@/components/ui';
import {
  EXTENSION_PRESETS,
  buildRenamePreview,
  defaultRenameRules,
  deduplicateNames,
} from '@/lib/rename';
import type { RenameRules } from '@/lib/rename';
import { createZip } from '@/lib/zip';
import { downloadBlob, safeFilename, timestampSuffix } from '@/lib/files';
import { formatBytes } from '@/lib/image';
import { useDropZone, useLocalStorage } from '@/hooks';

interface Entry {
  id: string;
  name: string;
  size?: number;
  file?: File;
}

let idCounter = 0;
const nextId = (): string => `f-${++idCounter}`;

const SAMPLE_NAMES = [
  'IMG_20240312_093301.JPEG',
  'IMG_20240312_093455.JPEG',
  'Final Report (v2) — DRAFT.docx',
  'Résumé — Ada Lovelace.PDF',
  'screenshot 2024-03-12 at 09.34.11.png',
  'invoice#0042.pdf',
  'CON.txt',
  'notes.txt',
];

export default function RenameTool(): React.ReactElement {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rules, setRules] = useLocalStorage<RenameRules>('wt:rename:rules', defaultRenameRules);
  const [autoDedupe, setAutoDedupe] = useState(true);
  const [manualNames, setManualNames] = useState('');
  const [showManual, setShowManual] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const added = files.map((file) => ({
        id: nextId(),
        name: file.name,
        size: file.size,
        file,
      }));
      setEntries((prev) => [...prev, ...added].slice(0, 2000));
      push(`Added ${added.length} file${added.length === 1 ? '' : 's'}.`, 'success');
    },
    [push],
  );

  const { dragging, handlers } = useDropZone(addFiles);

  const addManualNames = (): void => {
    const names = manualNames
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setEntries((prev) => [...prev, ...names.map((name) => ({ id: nextId(), name }))].slice(0, 2000));
    setManualNames('');
    push(`Added ${names.length} name${names.length === 1 ? '' : 's'}.`, 'success');
  };

  const preview = useMemo(() => {
    const base = buildRenamePreview(entries, rules);
    return autoDedupe ? deduplicateNames(base) : base;
  }, [entries, rules, autoDedupe]);

  const stats = useMemo(() => {
    const changed = preview.filter((item) => item.changed).length;
    const errors = preview.filter((item) => item.errors.length > 0).length;
    const warnings = preview.filter((item) => item.warnings.length > 0).length;
    const downloadable = entries.filter((entry) => entry.file).length;
    return { total: preview.length, changed, errors, warnings, downloadable };
  }, [preview, entries]);

  const set = <K extends keyof RenameRules>(key: K, value: RenameRules[K]): void =>
    setRules((prev) => ({ ...prev, [key]: value }));

  const downloadZip = async (): Promise<void> => {
    const withFiles = preview.filter((item) => {
      const entry = entries.find((e) => e.id === item.id);
      return entry?.file && item.errors.length === 0;
    });
    if (withFiles.length === 0) {
      push('No renamed files are available to download.', 'warning');
      return;
    }
    try {
      push('Building the archive…', 'info');
      const zipEntries = await Promise.all(
        withFiles.map(async (item) => {
          const entry = entries.find((e) => e.id === item.id)!;
          return {
            name: item.result,
            data: new Uint8Array(await entry.file!.arrayBuffer()),
            date: new Date(entry.file!.lastModified),
          };
        }),
      );
      const zip = await createZip(zipEntries);
      downloadBlob(zip, `${safeFilename('renamed-files')}-${timestampSuffix()}.zip`);
      push(`Downloaded ${zipEntries.length} renamed file${zipEntries.length === 1 ? '' : 's'}.`, 'success');
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const mappingText = preview.map((item) => `${item.original}\t${item.result}`).join('\n');

  const shellScript = useMemo(() => {
    const lines = ['#!/usr/bin/env bash', 'set -euo pipefail', ''];
    for (const item of preview) {
      if (!item.changed || item.errors.length > 0) continue;
      const escape = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
      lines.push(`mv -n -- ${escape(item.original)} ${escape(item.result)}`);
    }
    return lines.join('\n') + '\n';
  }, [preview]);

  return (
    <ToolShell
      slug="file-renamer"
      wide
      actions={
        <>
          {entries.length > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEntries([])}>
              <Trash2 size={14} aria-hidden />
              Clear
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setRules(defaultRenameRules)}>
            <RotateCcw size={14} aria-hidden />
            Reset rules
          </button>
          {stats.downloadable > 0 && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void downloadZip()}>
              <Package size={14} aria-hidden />
              Download renamed ZIP
            </button>
          )}
        </>
      }
    >
      <Callout tone="info" className="mb-4">
        Browsers cannot rename files on your disk — that would be a serious security hole. This tool
        gives you a validated preview plus three ways to apply it: download the renamed copies as a
        ZIP, copy a two-column mapping, or copy a shell script to run in the folder yourself.
      </Callout>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Panel title="Quick presets" bodyClassName="p-3">
            <div className="flex flex-wrap gap-1.5">
              {EXTENSION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    setRules((prev) => ({
                      ...prev,
                      extensionMode: 'replace',
                      newExtension: preset.to,
                    }))
                  }
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setRules((prev) => ({ ...prev, slugify: true, caseMode: 'kebab', tidySeparators: true }))
                }
              >
                Web-safe slugs
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setRules((prev) => ({
                    ...prev,
                    numbering: true,
                    numberPosition: 'prefix',
                    numberPadding: 3,
                    numberSeparator: '-',
                  }))
                }
              >
                Number 001-
              </button>
            </div>
          </Panel>

          <Panel title="Find & replace" bodyClassName="space-y-3 p-4">
            <FieldGroup label="Find" htmlFor="find">
              <input
                id="find"
                type="text"
                className="field code-area"
                value={rules.find}
                onChange={(e) => set('find', e.target.value)}
                placeholder={rules.useRegex ? '^IMG_(\\d+)' : 'text to find'}
                spellCheck={false}
              />
            </FieldGroup>
            <FieldGroup
              label="Replace with"
              htmlFor="replace"
              hint={rules.useRegex ? 'Use $1, $2 to reference capture groups.' : undefined}
            >
              <input
                id="replace"
                type="text"
                className="field code-area"
                value={rules.replace}
                onChange={(e) => set('replace', e.target.value)}
                placeholder="replacement"
                spellCheck={false}
              />
            </FieldGroup>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Toggle checked={rules.useRegex} onChange={(v) => set('useRegex', v)} label="Regex" />
              <Toggle
                checked={rules.caseSensitive}
                onChange={(v) => set('caseSensitive', v)}
                label="Case sensitive"
              />
            </div>
          </Panel>

          <Panel title="Transform" bodyClassName="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Prefix" htmlFor="prefix">
                <input
                  id="prefix"
                  type="text"
                  className="field code-area"
                  value={rules.prefix}
                  onChange={(e) => set('prefix', e.target.value)}
                />
              </FieldGroup>
              <FieldGroup label="Suffix" htmlFor="suffix">
                <input
                  id="suffix"
                  type="text"
                  className="field code-area"
                  value={rules.suffix}
                  onChange={(e) => set('suffix', e.target.value)}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Letter case">
              <Segmented
                size="sm"
                value={rules.caseMode}
                onChange={(v) => set('caseMode', v)}
                options={[
                  { value: 'none', label: 'As is' },
                  { value: 'lower', label: 'lower' },
                  { value: 'upper', label: 'UPPER' },
                  { value: 'title', label: 'Title' },
                  { value: 'camel', label: 'camel' },
                  { value: 'pascal', label: 'Pascal' },
                  { value: 'snake', label: 'snake' },
                  { value: 'kebab', label: 'kebab' },
                ]}
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Trim from start" htmlFor="trim-start">
                <input
                  id="trim-start"
                  type="number"
                  className="field"
                  min={0}
                  max={100}
                  value={rules.trimStart}
                  onChange={(e) => set('trimStart', Math.max(0, Number(e.target.value) || 0))}
                />
              </FieldGroup>
              <FieldGroup label="Trim from end" htmlFor="trim-end">
                <input
                  id="trim-end"
                  type="number"
                  className="field"
                  min={0}
                  max={100}
                  value={rules.trimEnd}
                  onChange={(e) => set('trimEnd', Math.max(0, Number(e.target.value) || 0))}
                />
              </FieldGroup>
            </div>

            <div className="space-y-2.5">
              <Toggle
                checked={rules.slugify}
                onChange={(v) => set('slugify', v)}
                label="Slugify"
                hint="ASCII letters, digits and hyphens only — safe in URLs and shell commands."
              />
              <Toggle
                checked={rules.removeAccents}
                onChange={(v) => set('removeAccents', v)}
                label="Strip accents"
                hint="é → e, ü → u"
              />
              <Toggle
                checked={rules.tidySeparators}
                onChange={(v) => set('tidySeparators', v)}
                label="Tidy separators"
                hint="Collapses repeated dots, dashes and spaces."
              />
              <Toggle
                checked={rules.includeDate}
                onChange={(v) => set('includeDate', v)}
                label="Add today’s date"
              />
            </div>
          </Panel>

          <Panel title="Numbering" bodyClassName="space-y-3 p-4">
            <Toggle
              checked={rules.numbering}
              onChange={(v) => set('numbering', v)}
              label="Add a sequential number"
            />
            {rules.numbering && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Start at" htmlFor="num-start">
                    <input
                      id="num-start"
                      type="number"
                      className="field"
                      min={0}
                      value={rules.numberStart}
                      onChange={(e) => set('numberStart', Number(e.target.value) || 0)}
                    />
                  </FieldGroup>
                  <FieldGroup label="Digits" htmlFor="num-pad">
                    <input
                      id="num-pad"
                      type="number"
                      className="field"
                      min={1}
                      max={8}
                      value={rules.numberPadding}
                      onChange={(e) => set('numberPadding', Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                    />
                  </FieldGroup>
                </div>
                <FieldGroup label="Position">
                  <Segmented
                    size="sm"
                    value={rules.numberPosition}
                    onChange={(v) => set('numberPosition', v)}
                    options={[
                      { value: 'prefix', label: 'Before' },
                      { value: 'suffix', label: 'After' },
                    ]}
                  />
                </FieldGroup>
                <FieldGroup label="Separator" htmlFor="num-sep">
                  <input
                    id="num-sep"
                    type="text"
                    className="field code-area"
                    maxLength={4}
                    value={rules.numberSeparator}
                    onChange={(e) => set('numberSeparator', e.target.value)}
                  />
                </FieldGroup>
              </>
            )}
          </Panel>

          <Panel title="Extension" bodyClassName="space-y-3 p-4">
            <Segmented
              size="sm"
              label="Extension handling"
              value={rules.extensionMode}
              onChange={(v) => set('extensionMode', v)}
              options={[
                { value: 'keep', label: 'Keep' },
                { value: 'lower', label: 'lower' },
                { value: 'upper', label: 'UPPER' },
                { value: 'replace', label: 'Replace' },
                { value: 'remove', label: 'Remove' },
              ]}
            />
            {rules.extensionMode === 'replace' && (
              <FieldGroup label="New extension" htmlFor="new-ext">
                <input
                  id="new-ext"
                  type="text"
                  className="field code-area"
                  value={rules.newExtension}
                  onChange={(e) => set('newExtension', e.target.value)}
                  placeholder="jpg"
                  spellCheck={false}
                />
              </FieldGroup>
            )}
            {rules.extensionMode === 'replace' && (
              <Callout tone="warning">
                Changing an extension does not convert the file. Renaming a PNG to .jpg produces a
                PNG that lies about its type; most software will still open it, some will refuse.
              </Callout>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <div
            {...handlers}
            className="card grid place-items-center border-2 border-dashed p-6 text-center transition-colors"
            style={
              dragging
                ? {
                    borderColor: 'var(--accent)',
                    background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
                  }
                : undefined
            }
          >
            <Upload size={26} className="muted mb-2 opacity-50" aria-hidden />
            <p className="text-sm font-medium">Drop files or a folder here</p>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                Choose files
              </button>
              <button type="button" className="btn" onClick={() => setShowManual((v) => !v)}>
                <ClipboardPaste size={14} aria-hidden />
                Paste names instead
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setEntries(SAMPLE_NAMES.map((name) => ({ id: nextId(), name })))
                }
              >
                Load sample names
              </button>
            </div>
            <p className="muted mt-2 text-xs">
              Files stay on your device. Only the names are needed unless you want the renamed ZIP.
            </p>
          </div>

          {showManual && (
            <Panel title="Paste filenames" description="One per line" bodyClassName="p-3 space-y-2">
              <textarea
                value={manualNames}
                onChange={(e) => setManualNames(e.target.value)}
                className="code-area field h-32 resize-y"
                placeholder={'report final.docx\nIMG_0001.JPEG\nnotes.txt'}
                spellCheck={false}
                aria-label="Filenames, one per line"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={addManualNames}>
                Add {manualNames.split('\n').filter((l) => l.trim()).length || ''} names
              </button>
            </Panel>
          )}

          {entries.length > 0 && (
            <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Stat label="Files" value={stats.total} />
              <Stat label="Will change" value={stats.changed} tone={stats.changed ? 'good' : 'default'} />
              <Stat label="Warnings" value={stats.warnings} />
              <Stat label="Errors" value={stats.errors} tone={stats.errors ? 'bad' : 'default'} />
            </div>
          )}

          {stats.errors > 0 && (
            <Callout tone="error" title={`${stats.errors} file${stats.errors === 1 ? '' : 's'} cannot be renamed`}>
              Rows highlighted below have a problem that would break on a real filesystem. Fix the
              rules, or enable automatic de-duplication for name collisions.
            </Callout>
          )}

          <Panel
            title="Preview"
            actions={
              <>
                <Toggle checked={autoDedupe} onChange={setAutoDedupe} label="Auto de-duplicate" />
                <CopyButton value={mappingText} label="Copy mapping" small />
              </>
            }
            bodyClassName="p-0 overflow-auto"
          >
            {preview.length === 0 ? (
              <EmptyState
                icon={<FileType2 size={30} />}
                title="No files yet"
                description="Add files or paste a list of names to see exactly what each one would become."
              />
            ) : (
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Original and resulting filenames</caption>
                <thead className="surface-3 sticky top-0">
                  <tr>
                    <th className="muted w-8 px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5 font-semibold">Original</th>
                    <th className="w-6" />
                    <th className="px-2 py-1.5 font-semibold">New name</th>
                    <th className="px-2 py-1.5 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {preview.slice(0, 500).map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-t"
                      style={
                        item.errors.length
                          ? { background: 'color-mix(in oklab, var(--danger) 10%, transparent)' }
                          : item.changed
                            ? { background: 'color-mix(in oklab, var(--ok) 7%, transparent)' }
                            : undefined
                      }
                    >
                      <td className="muted px-2 py-1 tabular-nums">{index + 1}</td>
                      <td className="max-w-[26ch] truncate px-2 py-1" title={item.original}>
                        {item.original}
                        {item.size !== undefined && (
                          <span className="muted ml-2">{formatBytes(item.size)}</span>
                        )}
                      </td>
                      <td className="muted px-1 py-1">
                        <ArrowRight size={12} aria-hidden />
                      </td>
                      <td
                        className="max-w-[26ch] truncate px-2 py-1"
                        title={item.result}
                        style={{ color: item.changed ? 'var(--ok)' : undefined }}
                      >
                        {item.result}
                      </td>
                      <td className="px-2 py-1 font-sans">
                        {item.errors.map((error) => (
                          <span
                            key={error}
                            className="flex items-start gap-1"
                            style={{ color: 'var(--danger)' }}
                          >
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
                            {error}
                          </span>
                        ))}
                        {item.warnings.map((warning) => (
                          <span key={warning} className="muted block">
                            {warning}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.length > 500 && (
              <p className="muted p-3 text-xs">
                Showing the first 500 of {preview.length.toLocaleString()} files. All of them are
                included in the ZIP and the mapping.
              </p>
            )}
          </Panel>

          {preview.length > 0 && (
            <Disclosure summary="Apply these renames yourself (shell script)">
              <div className="space-y-2">
                <p className="muted text-xs">
                  Save this next to your files and run it. It uses{' '}
                  <code className="font-mono">mv -n</code>, which refuses to overwrite an existing
                  file, so a mistake cannot silently destroy data. Review it before running.
                </p>
                <div className="flex justify-end">
                  <CopyButton value={shellScript} label="Copy script" small />
                </div>
                <pre className="surface-3 code-area max-h-56 overflow-auto rounded-lg border p-3">
                  {shellScript}
                </pre>
              </div>
            </Disclosure>
          )}

          {entries.length > 0 && stats.downloadable === 0 && (
            <Callout tone="info">
              These entries were typed or pasted, so there is no file content to package. Drop the
              actual files in if you want a renamed ZIP.
            </Callout>
          )}
        </div>
      </div>

      <Toasts messages={toasts} onDismiss={dismiss} />
    </ToolShell>
  );
}
