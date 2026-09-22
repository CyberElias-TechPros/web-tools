/**
 * Generate TypeScript interfaces / types / Zod schemas / JSON Schema from a
 * JSON sample. Merges array element shapes, marks optional keys, and gives
 * nested objects stable PascalCase names.
 */

export type CodegenTarget = 'typescript' | 'typescript-type' | 'zod' | 'json-schema' | 'python' | 'go' | 'kotlin' | 'swift';

export interface CodegenOptions {
  rootName: string;
  target: CodegenTarget;
  readonly: boolean;
  exportTypes: boolean;
  inferDates: boolean;
  optionalNulls: boolean;
}

export const defaultCodegenOptions: CodegenOptions = {
  rootName: 'Root',
  target: 'typescript',
  readonly: false,
  exportTypes: true,
  inferDates: true,
  optionalNulls: true,
};

type Shape =
  | { kind: 'string'; format?: 'date' | 'datetime' | 'uuid' | 'email' | 'url' }
  | { kind: 'number'; integer: boolean }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'unknown' }
  | { kind: 'array'; items: Shape }
  | { kind: 'object'; name: string; fields: Map<string, { shape: Shape; optional: boolean }> }
  | { kind: 'union'; options: Shape[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/;

function pascal(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean);
  let out = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (!out) out = 'Item';
  if (/^\d/.test(out)) out = `_${out}`;
  return out;
}

function singular(name: string): string {
  if (/ies$/i.test(name)) return name.replace(/ies$/i, 'y');
  if (/(ses|xes|ches|shes)$/i.test(name)) return name.replace(/es$/i, '');
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.slice(0, -1);
  return name;
}

function infer(value: unknown, name: string, opts: CodegenOptions, registry: Map<string, number>): Shape {
  if (value === null) return { kind: 'null' };
  if (Array.isArray(value)) {
    if (!value.length) return { kind: 'array', items: { kind: 'unknown' } };
    const shapes = value.map((v) => infer(v, singular(name), opts, registry));
    return { kind: 'array', items: mergeAll(shapes) };
  }
  switch (typeof value) {
    case 'string': {
      if (opts.inferDates) {
        if (ISO_DATETIME.test(value)) return { kind: 'string', format: 'datetime' };
        if (ISO_DATE.test(value)) return { kind: 'string', format: 'date' };
      }
      if (UUID.test(value)) return { kind: 'string', format: 'uuid' };
      if (EMAIL.test(value)) return { kind: 'string', format: 'email' };
      if (URL_RE.test(value)) return { kind: 'string', format: 'url' };
      return { kind: 'string' };
    }
    case 'number':
      return { kind: 'number', integer: Number.isInteger(value) };
    case 'boolean':
      return { kind: 'boolean' };
    case 'object': {
      const fields = new Map<string, { shape: Shape; optional: boolean }>();
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) fields.set(k, { shape: infer(v, k, opts, registry), optional: false });
      let base = pascal(name);
      const seen = registry.get(base) ?? 0;
      registry.set(base, seen + 1);
      if (seen > 0) base = `${base}${seen + 1}`;
      return { kind: 'object', name: base, fields };
    }
    default:
      return { kind: 'unknown' };
  }
}

function same(a: Shape, b: Shape): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'string' && b.kind === 'string') return a.format === b.format;
  if (a.kind === 'array' && b.kind === 'array') return same(a.items, b.items);
  if (a.kind === 'object' && b.kind === 'object') return a.name === b.name;
  return true;
}

function merge(a: Shape, b: Shape): Shape {
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  if (a.kind === 'object' && b.kind === 'object') {
    const fields = new Map(a.fields);
    for (const [k, f] of b.fields) {
      const existing = fields.get(k);
      if (existing) fields.set(k, { shape: merge(existing.shape, f.shape), optional: existing.optional || f.optional });
      else fields.set(k, { shape: f.shape, optional: true });
    }
    for (const k of fields.keys()) if (!b.fields.has(k)) fields.get(k)!.optional = true;
    return { kind: 'object', name: a.name, fields };
  }
  if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', items: merge(a.items, b.items) };
  if (a.kind === 'number' && b.kind === 'number') return { kind: 'number', integer: a.integer && b.integer };
  if (a.kind === 'string' && b.kind === 'string') return a.format === b.format ? a : { kind: 'string' };
  if (same(a, b)) return a;
  const options: Shape[] = [];
  const push = (s: Shape) => {
    const list = s.kind === 'union' ? s.options : [s];
    for (const item of list) if (!options.some((o) => same(o, item))) options.push(item);
  };
  push(a);
  push(b);
  return { kind: 'union', options };
}

function mergeAll(shapes: Shape[]): Shape {
  return shapes.reduce((acc, s) => merge(acc, s));
}

/* -------------------------------------------------------------------------- */
/* Emitters                                                                   */
/* -------------------------------------------------------------------------- */

function collectObjects(shape: Shape, out: Array<Extract<Shape, { kind: 'object' }>>): void {
  if (shape.kind === 'object') {
    for (const f of shape.fields.values()) collectObjects(f.shape, out);
    if (!out.includes(shape)) out.push(shape);
  } else if (shape.kind === 'array') collectObjects(shape.items, out);
  else if (shape.kind === 'union') shape.options.forEach((o) => collectObjects(o, out));
}

const safeKey = (k: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));

function tsType(shape: Shape, opts: CodegenOptions): string {
  switch (shape.kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'unknown':
      return 'unknown';
    case 'array': {
      const inner = tsType(shape.items, opts);
      const needsParens = shape.items.kind === 'union';
      return `${opts.readonly ? 'readonly ' : ''}${needsParens ? `(${inner})` : inner}[]`;
    }
    case 'object':
      return shape.name;
    case 'union':
      return shape.options.map((o) => tsType(o, opts)).join(' | ');
  }
}

function emitTypeScript(root: Shape, opts: CodegenOptions, asType: boolean): string {
  const objects: Array<Extract<Shape, { kind: 'object' }>> = [];
  collectObjects(root, objects);
  const exp = opts.exportTypes ? 'export ' : '';
  const blocks = objects.map((obj) => {
    const lines = Array.from(obj.fields.entries()).map(([k, f]) => {
      let type = tsType(f.shape, opts);
      let optional = f.optional;
      if (opts.optionalNulls && f.shape.kind === 'null') {
        type = 'null';
      }
      if (f.shape.kind === 'union' && f.shape.options.some((o) => o.kind === 'null') && opts.optionalNulls) {
        optional = true;
        type = f.shape.options.filter((o) => o.kind !== 'null').map((o) => tsType(o, opts)).join(' | ') || 'null';
        type += ' | null';
      }
      const comment = f.shape.kind === 'string' && f.shape.format ? ` // ${f.shape.format}` : '';
      return `  ${opts.readonly ? 'readonly ' : ''}${safeKey(k)}${optional ? '?' : ''}: ${type};${comment}`;
    });
    return asType ? `${exp}type ${obj.name} = {\n${lines.join('\n')}\n};` : `${exp}interface ${obj.name} {\n${lines.join('\n')}\n}`;
  });
  if (root.kind !== 'object') blocks.push(`${exp}type ${pascal(opts.rootName)} = ${tsType(root, opts)};`);
  return blocks.reverse().join('\n\n');
}

function zodType(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      if (shape.format === 'datetime') return 'z.string().datetime()';
      if (shape.format === 'date') return 'z.string().date()';
      if (shape.format === 'uuid') return 'z.string().uuid()';
      if (shape.format === 'email') return 'z.string().email()';
      if (shape.format === 'url') return 'z.string().url()';
      return 'z.string()';
    case 'number':
      return shape.integer ? 'z.number().int()' : 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'null':
      return 'z.null()';
    case 'unknown':
      return 'z.unknown()';
    case 'array':
      return `z.array(${zodType(shape.items)})`;
    case 'object':
      return `${lowerFirst(shape.name)}Schema`;
    case 'union': {
      const nonNull = shape.options.filter((o) => o.kind !== 'null');
      const hasNull = nonNull.length !== shape.options.length;
      const inner = nonNull.length === 1 ? zodType(nonNull[0]!) : `z.union([${nonNull.map(zodType).join(', ')}])`;
      return hasNull ? `${inner}.nullable()` : inner;
    }
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function emitZod(root: Shape, opts: CodegenOptions): string {
  const objects: Array<Extract<Shape, { kind: 'object' }>> = [];
  collectObjects(root, objects);
  const exp = opts.exportTypes ? 'export ' : '';
  const blocks = objects.map((obj) => {
    const lines = Array.from(obj.fields.entries()).map(([k, f]) => `  ${safeKey(k)}: ${zodType(f.shape)}${f.optional ? '.optional()' : ''},`);
    return `${exp}const ${lowerFirst(obj.name)}Schema = z.object({\n${lines.join('\n')}\n});\n${exp}type ${obj.name} = z.infer<typeof ${lowerFirst(obj.name)}Schema>;`;
  });
  if (root.kind !== 'object') blocks.push(`${exp}const ${lowerFirst(pascal(opts.rootName))}Schema = ${zodType(root)};`);
  return `import { z } from 'zod';\n\n${blocks.join('\n\n')}`;
}

function jsonSchema(shape: Shape): Record<string, unknown> {
  switch (shape.kind) {
    case 'string': {
      const s: Record<string, unknown> = { type: 'string' };
      if (shape.format === 'datetime') s.format = 'date-time';
      else if (shape.format === 'date') s.format = 'date';
      else if (shape.format === 'uuid') s.format = 'uuid';
      else if (shape.format === 'email') s.format = 'email';
      else if (shape.format === 'url') s.format = 'uri';
      return s;
    }
    case 'number':
      return { type: shape.integer ? 'integer' : 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'null':
      return { type: 'null' };
    case 'unknown':
      return {};
    case 'array':
      return { type: 'array', items: jsonSchema(shape.items) };
    case 'object': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, f] of shape.fields) {
        properties[k] = jsonSchema(f.shape);
        if (!f.optional) required.push(k);
      }
      const out: Record<string, unknown> = { type: 'object', title: shape.name, properties, additionalProperties: false };
      if (required.length) out.required = required;
      return out;
    }
    case 'union':
      return { anyOf: shape.options.map(jsonSchema) };
  }
}

function pyType(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      return shape.format === 'datetime' ? 'datetime' : shape.format === 'date' ? 'date' : 'str';
    case 'number':
      return shape.integer ? 'int' : 'float';
    case 'boolean':
      return 'bool';
    case 'null':
      return 'None';
    case 'unknown':
      return 'Any';
    case 'array':
      return `list[${pyType(shape.items)}]`;
    case 'object':
      return shape.name;
    case 'union':
      return shape.options.map(pyType).join(' | ');
  }
}

function emitPython(root: Shape, opts: CodegenOptions): string {
  const objects: Array<Extract<Shape, { kind: 'object' }>> = [];
  collectObjects(root, objects);
  const usesDates = JSON.stringify([...objects].map((o) => [...o.fields.values()].map((f) => f.shape))).includes('date');
  const header = ['from __future__ import annotations', 'from dataclasses import dataclass, field', 'from typing import Any, Optional', ...(usesDates ? ['from datetime import date, datetime'] : [])];
  const blocks = objects.map((obj) => {
    const required = Array.from(obj.fields.entries()).filter(([, f]) => !f.optional);
    const optional = Array.from(obj.fields.entries()).filter(([, f]) => f.optional);
    const lines = [
      ...required.map(([k, f]) => `    ${pyKey(k)}: ${pyType(f.shape)}`),
      ...optional.map(([k, f]) => `    ${pyKey(k)}: Optional[${pyType(f.shape)}] = None`),
    ];
    return `@dataclass\nclass ${obj.name}:\n${lines.length ? lines.join('\n') : '    pass'}`;
  });
  if (root.kind !== 'object') blocks.push(`${pascal(opts.rootName)} = ${pyType(root)}`);
  return `${header.join('\n')}\n\n\n${blocks.join('\n\n\n')}\n`;
}

const pyKey = (k: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : k.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1'));

function goType(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      return shape.format === 'datetime' ? 'time.Time' : 'string';
    case 'number':
      return shape.integer ? 'int64' : 'float64';
    case 'boolean':
      return 'bool';
    case 'null':
    case 'unknown':
      return 'interface{}';
    case 'array':
      return `[]${goType(shape.items)}`;
    case 'object':
      return shape.name;
    case 'union': {
      const nonNull = shape.options.filter((o) => o.kind !== 'null');
      return nonNull.length === 1 ? `*${goType(nonNull[0]!)}` : 'interface{}';
    }
  }
}

function emitGo(root: Shape, opts: CodegenOptions): string {
  const objects: Array<Extract<Shape, { kind: 'object' }>> = [];
  collectObjects(root, objects);
  const usesTime = objects.some((o) => [...o.fields.values()].some((f) => f.shape.kind === 'string' && f.shape.format === 'datetime'));
  const blocks = objects.map((obj) => {
    const lines = Array.from(obj.fields.entries()).map(([k, f]) => `\t${pascal(k)} ${goType(f.shape)} \`json:"${k}${f.optional ? ',omitempty' : ''}"\``);
    return `type ${obj.name} struct {\n${lines.join('\n')}\n}`;
  });
  if (root.kind !== 'object') blocks.push(`type ${pascal(opts.rootName)} ${goType(root)}`);
  return `package main\n${usesTime ? '\nimport "time"\n' : ''}\n${blocks.reverse().join('\n\n')}\n`;
}

function ktType(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      return 'String';
    case 'number':
      return shape.integer ? 'Long' : 'Double';
    case 'boolean':
      return 'Boolean';
    case 'null':
      return 'Nothing?';
    case 'unknown':
      return 'Any?';
    case 'array':
      return `List<${ktType(shape.items)}>`;
    case 'object':
      return shape.name;
    case 'union': {
      const nonNull = shape.options.filter((o) => o.kind !== 'null');
      return nonNull.length === 1 ? `${ktType(nonNull[0]!)}?` : 'Any?';
    }
  }
}

function emitKotlin(root: Shape, opts: CodegenOptions): string {
  const objects: Array<Extract<Shape, { kind: 'object' }>> = [];
  collectObjects(root, objects);
  const blocks = objects.map((obj) => {
    const lines = Array.from(obj.fields.entries()).map(([k, f]) => {
      const type = ktType(f.shape);
      const nullable = f.optional && !type.endsWith('?') ? `${type}? = null` : type;
      return `    val ${pyKey(k)}: ${nullable}`;
    });
    return `data class ${obj.name}(\n${lines.join(',\n')}\n)`;
  });
  if (root.kind !== 'object') blocks.push(`typealias ${pascal(opts.rootName)} = ${ktType(root)}`);
  return blocks.reverse().join('\n\n');
}

function swiftType(shape: Shape): string {
  switch (shape.kind) {
    case 'string':
      return shape.format === 'datetime' ? 'Date' : shape.format === 'url' ? 'URL' : 'String';
    case 'number':
      return shape.integer ? 'Int' : 'Double';
    case 'boolean':
      return 'Bool';
    case 'null':
    case 'unknown':
      return 'AnyCodable';
    case 'array':
      return `[${swiftType(shape.items)}]`;
    case 'object':
      return shape.name;
    case 'union': {
      const nonNull = shape.options.filter((o) => o.kind !== 'null');
      return nonNull.length === 1 ? `${swiftType(nonNull[0]!)}?` : 'AnyCodable';
    }
  }
}

function emitSwift(root: Shape, opts: CodegenOptions): string {
  const objects: Array<Extract<Shape, { kind: 'object' }>> = [];
  collectObjects(root, objects);
  const blocks = objects.map((obj) => {
    const lines = Array.from(obj.fields.entries()).map(([k, f]) => {
      const type = swiftType(f.shape);
      return `    let ${pyKey(k)}: ${f.optional && !type.endsWith('?') ? `${type}?` : type}`;
    });
    return `struct ${obj.name}: Codable {\n${lines.join('\n')}\n}`;
  });
  if (root.kind !== 'object') blocks.push(`typealias ${pascal(opts.rootName)} = ${swiftType(root)}`);
  return `import Foundation\n\n${blocks.reverse().join('\n\n')}`;
}

export function generateTypes(json: unknown, options: Partial<CodegenOptions> = {}): string {
  const opts = { ...defaultCodegenOptions, ...options };
  const registry = new Map<string, number>();
  const rootName = pascal(opts.rootName || 'Root');
  const root = infer(json, rootName, opts, registry);
  switch (opts.target) {
    case 'typescript':
      return emitTypeScript(root, opts, false);
    case 'typescript-type':
      return emitTypeScript(root, opts, true);
    case 'zod':
      return emitZod(root, opts);
    case 'json-schema':
      return JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...jsonSchema(root) }, null, 2);
    case 'python':
      return emitPython(root, opts);
    case 'go':
      return emitGo(root, opts);
    case 'kotlin':
      return emitKotlin(root, opts);
    case 'swift':
      return emitSwift(root, opts);
  }
}

export const CODEGEN_TARGETS: Array<{ id: CodegenTarget; label: string; language: string }> = [
  { id: 'typescript', label: 'TypeScript interfaces', language: 'typescript' },
  { id: 'typescript-type', label: 'TypeScript types', language: 'typescript' },
  { id: 'zod', label: 'Zod schema', language: 'typescript' },
  { id: 'json-schema', label: 'JSON Schema', language: 'json' },
  { id: 'python', label: 'Python dataclasses', language: 'python' },
  { id: 'go', label: 'Go structs', language: 'go' },
  { id: 'kotlin', label: 'Kotlin data classes', language: 'kotlin' },
  { id: 'swift', label: 'Swift Codable', language: 'swift' },
];
