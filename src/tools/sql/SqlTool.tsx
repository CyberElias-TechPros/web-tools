import { useMemo, useState } from 'react';
import { format } from 'sql-formatter';
import type { FormatOptionsWithLanguage, KeywordCase, SqlLanguage } from 'sql-formatter';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Segmented, SelectField, Toggle } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { useDebounced, useLocalStorage } from '@/hooks';

const DIALECTS: Array<{ value: SqlLanguage; label: string }> = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'transactsql', label: 'T-SQL (SQL Server)' },
  { value: 'plsql', label: 'PL/SQL (Oracle)' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'redshift', label: 'Redshift' },
  { value: 'spark', label: 'Spark SQL' },
  { value: 'hive', label: 'Hive' },
  { value: 'trino', label: 'Trino / Presto' },
  { value: 'db2', label: 'Db2' },
  { value: 'n1ql', label: 'N1QL (Couchbase)' },
];

const SAMPLE = `select u.id, u.email, count(o.id) as orders, sum(o.total) as revenue from users u left join orders o on o.user_id = u.id and o.status <> 'cancelled' where u.created_at >= date '2024-01-01' and u.country in ('GB','DE','FR') group by u.id, u.email having count(o.id) > 0 order by revenue desc limit 50;`;

type Mode = 'format' | 'minify';

export default function SqlTool(): React.ReactElement {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('format');
  const [language, setLanguage] = useLocalStorage<SqlLanguage>('sql:lang', 'postgresql');
  const [keywordCase, setKeywordCase] = useLocalStorage<KeywordCase>('sql:case', 'upper');
  const [tabWidth, setTabWidth] = useLocalStorage<'2' | '4'>('sql:tab', '2');
  const [linesBetweenQueries, setLinesBetweenQueries] = useLocalStorage('sql:blank', true);
  const [denseOperators, setDenseOperators] = useLocalStorage('sql:dense', false);
  const debounced = useDebounced(input, 150);

  const result = useMemo(() => {
    if (!debounced.trim()) return { output: '', error: null as string | null };
    try {
      if (mode === 'minify') {
        return { output: minifySql(debounced), error: null };
      }
      const options: FormatOptionsWithLanguage = {
        language,
        keywordCase,
        dataTypeCase: keywordCase,
        functionCase: keywordCase,
        tabWidth: Number(tabWidth),
        linesBetweenQueries: linesBetweenQueries ? 2 : 1,
        denseOperators,
        logicalOperatorNewline: 'before',
        expressionWidth: 60,
      };
      return { output: format(debounced, options), error: null };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : String(e) };
    }
  }, [debounced, mode, language, keywordCase, tabWidth, linesBetweenQueries, denseOperators]);

  return (
    <ToolShell slug="sql-formatter">
      <OptionsBar>
        <Segmented label="Operation" value={mode} onChange={setMode} options={[{ value: 'format', label: 'Format' }, { value: 'minify', label: 'Minify' }]} />
        <SelectField label="Dialect" value={language} onChange={setLanguage} options={DIALECTS} className="w-52" />
        <Segmented size="sm" label="Keyword case" value={keywordCase} onChange={setKeywordCase} options={[{ value: 'upper', label: 'UPPER' }, { value: 'lower', label: 'lower' }, { value: 'preserve', label: 'as-is' }]} />
        <Segmented size="sm" label="Indent" value={tabWidth} onChange={setTabWidth} options={[{ value: '2', label: '2' }, { value: '4', label: '4' }]} />
        <Toggle checked={linesBetweenQueries} onChange={setLinesBetweenQueries} label="Blank line between statements" />
        <Toggle checked={denseOperators} onChange={setDenseOperators} label="Dense operators" hint="a=b instead of a = b" />
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label="SQL" sample={SAMPLE} accept=".sql,text/*" rows={20} invalid={Boolean(result.error)} fill autoFocus />
        <div className="flex flex-col gap-3">
          {result.error && (
            <Callout tone="error" title="Could not parse">
              {result.error}
            </Callout>
          )}
          <TextOutput value={result.output} label={mode === 'format' ? 'Formatted SQL' : 'Minified SQL'} filename={mode === 'format' ? 'formatted.sql' : 'minified.sql'} mime="application/sql" rows={20} fill />
        </div>
      </Workspace>
    </ToolShell>
  );
}

/** Collapse whitespace outside string literals and strip comments. */
function minifySql(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === quote) {
          if (src[j + 1] === quote) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (/\s/.test(ch)) {
      if (out && !out.endsWith(' ')) out += ' ';
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out
    .replace(/\s*([,;()=<>])\s*/g, '$1')
    .replace(/\)\s*(?=[A-Za-z])/g, ') ')
    .trim();
}
