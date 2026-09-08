import { describe, expect, it } from 'vitest';
import {
  flattenJson,
  formatJson,
  jsonStats,
  parseJson,
  queryJson,
  repairJson,
} from '@/lib/json';

describe('parseJson', () => {
  it('parses valid documents', () => {
    const result = parseJson('{"a":1,"b":[true,null,"x"]}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1, b: [true, null, 'x'] });
  });

  it('parses all scalar types at the top level', () => {
    expect(parseJson('42')).toMatchObject({ ok: true, value: 42 });
    expect(parseJson('"s"')).toMatchObject({ ok: true, value: 's' });
    expect(parseJson('true')).toMatchObject({ ok: true, value: true });
    expect(parseJson('null')).toMatchObject({ ok: true, value: null });
  });

  it('handles negative numbers and exponents', () => {
    expect(parseJson('-1.5e-3')).toMatchObject({ ok: true, value: -0.0015 });
  });

  it('handles escapes inside strings', () => {
    const result = parseJson('"a\\nb\\u0041\\\\"');
    expect(result).toMatchObject({ ok: true, value: 'a\nbA\\' });
  });

  it('tolerates a byte order mark', () => {
    expect(parseJson('\uFEFF{"a":1}')).toMatchObject({ ok: true });
  });

  it('rejects an empty document with a clear message', () => {
    const result = parseJson('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/empty/i);
  });

  it('reports the line and column of a trailing comma', () => {
    const result = parseJson('{\n  "a": 1,\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.line).toBe(3);
      expect(result.error.message).toMatch(/trailing comma/i);
    }
  });

  it('reports unquoted keys with a repair hint', () => {
    const result = parseJson('{a: 1}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/unquoted key/i);
      expect(result.error.hint).toMatch(/repair/i);
    }
  });

  it('reports single-quoted strings', () => {
    const result = parseJson("{'a': 1}");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/single-quoted/i);
  });

  it('rejects leading zeros', () => {
    const result = parseJson('{"a": 007}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/leading zero/i);
  });

  it('rejects Python literals with a helpful message', () => {
    const result = parseJson('{"a": True}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.hint).toMatch(/lowercase/i);
  });

  it('rejects an unterminated string', () => {
    const result = parseJson('{"a": "oops}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/unterminated string/i);
  });

  it('rejects a raw newline inside a string', () => {
    const result = parseJson('{"a": "line\nbreak"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/newline/i);
  });

  it('rejects trailing content after the value', () => {
    const result = parseJson('{"a":1} {"b":2}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.hint).toMatch(/multiple top-level/i);
  });

  it('computes the error offset correctly across lines', () => {
    const src = '{\n"a": 1,\n"b": }';
    const result = parseJson(src);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(src[result.error.offset]).toBe('}');
      expect(result.error.line).toBe(3);
    }
  });

  it('does not throw on deeply nested input', () => {
    const deep = '['.repeat(600) + ']'.repeat(600);
    const result = parseJson(deep);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/deeply/i);
  });

  it('agrees with JSON.parse on valid input', () => {
    const samples = ['{}', '[]', '{"a":[1,2,{"b":null}]}', '[[[]]]', '{"k":"v"}', '0', '-0.5'];
    for (const sample of samples) {
      const result = parseJson(sample);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(JSON.parse(sample));
    }
  });
});

describe('repairJson', () => {
  const roundTrip = (input: string): unknown => {
    const repaired = repairJson(input);
    const result = parseJson(repaired);
    expect(result.ok).toBe(true);
    return result.ok ? result.value : null;
  };

  it('removes trailing commas', () => {
    expect(roundTrip('{"a":1,}')).toEqual({ a: 1 });
    expect(roundTrip('[1,2,3,]')).toEqual([1, 2, 3]);
  });

  it('quotes unquoted keys', () => {
    expect(roundTrip('{a: 1, b: 2}')).toEqual({ a: 1, b: 2 });
  });

  it('converts single quotes to double quotes', () => {
    expect(roundTrip("{'a': 'x'}")).toEqual({ a: 'x' });
  });

  it('escapes double quotes inside converted strings', () => {
    expect(roundTrip(`{'a': 'say "hi"'}`)).toEqual({ a: 'say "hi"' });
  });

  it('strips line and block comments', () => {
    expect(roundTrip('{\n// c\n"a": 1 /* inline */\n}')).toEqual({ a: 1 });
  });

  it('maps Python literals', () => {
    expect(roundTrip('{"a": True, "b": False, "c": None}')).toEqual({
      a: true,
      b: false,
      c: null,
    });
  });

  it('unwraps a module export', () => {
    expect(roundTrip('export default { "a": 1 }')).toEqual({ a: 1 });
    expect(roundTrip('module.exports = {"a": 1};')).toEqual({ a: 1 });
  });

  it('does not corrupt already-valid JSON', () => {
    const valid = '{"a":1,"b":"has // slashes","c":[1,2]}';
    expect(roundTrip(valid)).toEqual(JSON.parse(valid));
  });

  it('leaves comment-like content inside strings alone', () => {
    expect(roundTrip('{"url": "https://example.com/a"}')).toEqual({
      url: 'https://example.com/a',
    });
  });
});

describe('formatJson', () => {
  const value = { b: 2, a: { d: 4, c: 3 } };

  it('indents with spaces', () => {
    expect(formatJson(value, { indent: 2, sortKeys: 'none' })).toContain('\n  "b"');
  });

  it('indents with tabs', () => {
    expect(formatJson(value, { indent: 'tab', sortKeys: 'none' })).toContain('\n\t"b"');
  });

  it('minifies with indent 0', () => {
    expect(formatJson(value, { indent: 0, sortKeys: 'none' })).toBe(JSON.stringify(value));
  });

  it('sorts keys recursively ascending', () => {
    const out = formatJson(value, { indent: 0, sortKeys: 'asc' });
    expect(out).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it('sorts keys descending', () => {
    const out = formatJson(value, { indent: 0, sortKeys: 'desc' });
    expect(out).toBe('{"b":2,"a":{"d":4,"c":3}}');
  });

  it('preserves array order when sorting keys', () => {
    const out = formatJson({ z: [3, 1, 2] }, { indent: 0, sortKeys: 'asc' });
    expect(out).toBe('{"z":[3,1,2]}');
  });
});

describe('jsonStats', () => {
  it('counts every node type', () => {
    const source = '{"a":1,"b":"x","c":true,"d":null,"e":[1,2],"f":{"g":1}}';
    const value = JSON.parse(source);
    const stats = jsonStats(value, source);
    expect(stats.objects).toBe(2);
    expect(stats.arrays).toBe(1);
    expect(stats.strings).toBe(1);
    expect(stats.booleans).toBe(1);
    expect(stats.nulls).toBe(1);
    expect(stats.keys).toBe(7);
    expect(stats.maxDepth).toBe(3);
  });
});

describe('flattenJson', () => {
  it('produces dot and bracket paths', () => {
    const rows = flattenJson({ a: { b: [1, 2] } });
    expect(rows).toEqual([
      ['a.b[0]', 1],
      ['a.b[1]', 2],
    ]);
  });

  it('quotes keys that are not identifiers', () => {
    const rows = flattenJson({ 'a-b': 1 });
    expect(rows[0]?.[0]).toBe('a-b');
  });

  it('records empty containers', () => {
    expect(flattenJson({ a: [], b: {} })).toEqual([
      ['a', []],
      ['b', {}],
    ]);
  });
});

describe('queryJson', () => {
  const doc = {
    items: [
      { name: 'a', tags: ['x'] },
      { name: 'b', tags: ['y', 'z'] },
    ],
    meta: { count: 2 },
  };

  it('returns the whole document for an empty path', () => {
    expect(queryJson(doc, '')).toEqual([doc]);
    expect(queryJson(doc, '$')).toEqual([doc]);
  });

  it('resolves nested keys', () => {
    expect(queryJson(doc, 'meta.count')).toEqual([2]);
  });

  it('resolves array indexes', () => {
    expect(queryJson(doc, 'items[0].name')).toEqual(['a']);
  });

  it('iterates with a wildcard', () => {
    expect(queryJson(doc, 'items[*].name')).toEqual(['a', 'b']);
  });

  it('returns nothing for a missing path', () => {
    expect(queryJson(doc, 'nope.nothing')).toEqual([]);
  });

  it('does not evaluate arbitrary expressions', () => {
    expect(queryJson(doc, 'constructor')).toEqual([]);
  });
});
