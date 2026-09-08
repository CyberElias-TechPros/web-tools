import { describe, expect, it } from 'vitest';
import {
  csvTableToObjects,
  detectDelimiter,
  escapeCsvField,
  inferColumnTypes,
  inferValue,
  jsonToCsv,
  jsonToTable,
  parseCsv,
  tableToCsv,
} from '@/lib/csv';

describe('detectDelimiter', () => {
  it('detects commas', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });
  it('detects semicolons', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });
  it('detects tabs', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
  it('detects pipes', () => {
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|');
  });
  it('prefers the consistent delimiter when several appear', () => {
    expect(detectDelimiter('a;b;c\n"x,y";2;3\n"p,q";5;6')).toBe(';');
  });
  it('defaults to a comma for a single column', () => {
    expect(detectDelimiter('header\nvalue')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('parses a simple table', () => {
    const table = parseCsv('a,b\n1,2\n3,4');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles quoted fields containing the delimiter', () => {
    const table = parseCsv('a,b\n"x,y",2');
    expect(table.rows[0]).toEqual(['x,y', '2']);
  });

  it('handles doubled quotes inside a quoted field', () => {
    const table = parseCsv('a\n"say ""hi"""');
    expect(table.rows[0]?.[0]).toBe('say "hi"');
  });

  it('handles embedded newlines inside quotes', () => {
    const table = parseCsv('a,b\n"line1\nline2",2');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.[0]).toBe('line1\nline2');
  });

  it('handles CRLF line endings', () => {
    const table = parseCsv('a,b\r\n1,2\r\n');
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('strips a byte order mark from the first header', () => {
    const table = parseCsv('\uFEFFa,b\n1,2');
    expect(table.header[0]).toBe('a');
  });

  it('deduplicates repeated header names', () => {
    const table = parseCsv('a,a,a\n1,2,3');
    expect(table.header).toEqual(['a', 'a_2', 'a_3']);
  });

  it('names blank header cells', () => {
    const table = parseCsv('a,,c\n1,2,3');
    expect(table.header[1]).toBe('column_2');
  });

  it('generates a synthetic header when there is none', () => {
    const table = parseCsv('1,2\n3,4', { hasHeader: false });
    expect(table.header).toEqual(['column_1', 'column_2']);
    expect(table.rows).toHaveLength(2);
  });

  it('pads short rows and warns', () => {
    const table = parseCsv('a,b,c\n1,2');
    expect(table.rows[0]).toEqual(['1', '2', '']);
    expect(table.warnings).toHaveLength(1);
  });

  it('truncates long rows and warns', () => {
    const table = parseCsv('a,b\n1,2,3');
    expect(table.rows[0]).toEqual(['1', '2']);
    expect(table.warnings[0]?.message).toMatch(/3 fields/);
  });

  it('warns about an unterminated quote', () => {
    const table = parseCsv('a\n"unclosed');
    expect(table.warnings.some((w) => /closing quote/.test(w.message))).toBe(true);
  });

  it('preserves whitespace inside quoted fields', () => {
    const table = parseCsv('a\n"  padded  "');
    expect(table.rows[0]?.[0]).toBe('  padded  ');
  });

  it('trims unquoted fields when asked', () => {
    const table = parseCsv('a\n  padded  ', { trimFields: true });
    expect(table.rows[0]?.[0]).toBe('padded');
  });

  it('skips empty lines by default', () => {
    const table = parseCsv('a\n1\n\n2\n');
    expect(table.rows).toHaveLength(2);
  });

  it('handles an entirely empty input', () => {
    const table = parseCsv('');
    expect(table.rows).toHaveLength(0);
  });
});

describe('inferValue', () => {
  it('converts integers and floats', () => {
    expect(inferValue('42')).toBe(42);
    expect(inferValue('-1.5')).toBe(-1.5);
  });
  it('converts booleans', () => {
    expect(inferValue('true')).toBe(true);
    expect(inferValue('NO')).toBe(false);
  });
  it('converts null-ish values', () => {
    expect(inferValue('null')).toBe(null);
  });
  it('keeps leading-zero values as strings so identifiers survive', () => {
    expect(inferValue('007')).toBe('007');
    expect(inferValue('01234')).toBe('01234');
  });
  it('keeps phone numbers as strings', () => {
    expect(inferValue('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
  it('returns an empty string unchanged', () => {
    expect(inferValue('')).toBe('');
  });
});

describe('csvTableToObjects', () => {
  it('maps rows to objects with inferred types', () => {
    const table = parseCsv('id,name,active\n1,Ada,true');
    expect(csvTableToObjects(table)).toEqual([{ id: 1, name: 'Ada', active: true }]);
  });

  it('keeps raw strings when inference is off', () => {
    const table = parseCsv('id\n1');
    expect(csvTableToObjects(table, { inferTypes: false })).toEqual([{ id: '1' }]);
  });

  it('expands dotted header paths', () => {
    const table = parseCsv('contact.email,contact.phone\na@b.c,123');
    expect(csvTableToObjects(table, { expandDotPaths: true })).toEqual([
      { contact: { email: 'a@b.c', phone: 123 } },
    ]);
  });

  it('omits empty cells when asked', () => {
    const table = parseCsv('a,b\n1,');
    expect(csvTableToObjects(table, { omitEmpty: true })).toEqual([{ a: 1 }]);
  });
});

describe('escapeCsvField', () => {
  const opts = { escapeFormulas: true, quoteAll: false };

  it('leaves plain values alone', () => {
    expect(escapeCsvField('plain', ',', opts)).toBe('plain');
  });
  it('quotes values containing the delimiter', () => {
    expect(escapeCsvField('a,b', ',', opts)).toBe('"a,b"');
  });
  it('doubles embedded quotes', () => {
    expect(escapeCsvField('say "hi"', ',', opts)).toBe('"say ""hi"""');
  });
  it('quotes values with newlines', () => {
    expect(escapeCsvField('a\nb', ',', opts)).toBe('"a\nb"');
  });
  it('neutralises formula injection', () => {
    expect(escapeCsvField('=1+1', ',', opts)).toBe("'=1+1");
    expect(escapeCsvField('@SUM(A1)', ',', opts)).toBe("'@SUM(A1)");
    expect(escapeCsvField('-2+3', ',', opts)).toBe("'-2+3");
  });
  it('can be told not to neutralise formulas', () => {
    expect(escapeCsvField('=1+1', ',', { escapeFormulas: false, quoteAll: false })).toBe('=1+1');
  });
  it('quotes everything when asked', () => {
    expect(escapeCsvField('a', ',', { escapeFormulas: true, quoteAll: true })).toBe('"a"');
  });
});

describe('jsonToTable', () => {
  it('builds a header from the union of all keys', () => {
    const table = jsonToTable([{ a: 1 }, { b: 2 }]);
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows).toEqual([
      ['1', ''],
      ['', '2'],
    ]);
  });

  it('flattens nested objects into dotted columns', () => {
    const table = jsonToTable([{ c: { email: 'x' } }]);
    expect(table.header).toEqual(['c.email']);
  });

  it('joins scalar arrays into one cell', () => {
    const table = jsonToTable([{ tags: ['a', 'b'] }]);
    expect(table.rows[0]?.[0]).toBe('a; b');
  });

  it('wraps a bare object into a single row', () => {
    const table = jsonToTable({ a: 1 });
    expect(table.rows).toHaveLength(1);
  });

  it('stringifies nested objects when flattening is off', () => {
    const table = jsonToTable([{ c: { x: 1 } }], { flatten: false });
    expect(table.rows[0]?.[0]).toBe('{"x":1}');
  });
});

describe('round trip', () => {
  it('survives CSV -> JSON -> CSV with tricky values', () => {
    const original = 'name,note\nAda,"has, comma"\nGrace,"has ""quotes"""';
    const table = parseCsv(original);
    const objects = csvTableToObjects(table, { inferTypes: false });
    const back = jsonToCsv(objects, { delimiter: ',', escapeFormulas: false });
    expect(back).toBe(original);
  });

  it('preserves row and column counts', () => {
    const table = parseCsv('a,b,c\n1,2,3\n4,5,6');
    const objects = csvTableToObjects(table);
    const out = parseCsv(tableToCsv(table.header, table.rows));
    expect(objects).toHaveLength(2);
    expect(out.rows).toHaveLength(2);
    expect(out.header).toEqual(table.header);
  });
});

describe('inferColumnTypes', () => {
  it('classifies homogeneous and mixed columns', () => {
    const table = parseCsv('n,s,m,e\n1,a,1,\n2,b,x,');
    expect(inferColumnTypes(table)).toEqual(['number', 'string', 'mixed', 'empty']);
  });
});
