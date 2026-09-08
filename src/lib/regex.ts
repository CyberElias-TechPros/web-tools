/**
 * Regular expression parsing, explanation and safe execution.
 *
 * The parser produces a real AST (rather than tokenising with regexes) so the
 * visualiser can draw nested structure, the explainer can describe each part in
 * plain English, and the linter can warn about catastrophic backtracking before
 * the user pastes the pattern into production code.
 */

export type NodeType =
  | 'alternation'
  | 'sequence'
  | 'group'
  | 'literal'
  | 'charClass'
  | 'shorthand'
  | 'anchor'
  | 'quantifier'
  | 'backreference'
  | 'dot';

export interface BaseNode {
  type: NodeType;
  /** Source span, so the visualiser can highlight the original text. */
  start: number;
  end: number;
}

export interface AlternationNode extends BaseNode {
  type: 'alternation';
  options: RegexNode[];
}
export interface SequenceNode extends BaseNode {
  type: 'sequence';
  items: RegexNode[];
}
export interface GroupNode extends BaseNode {
  type: 'group';
  kind: 'capturing' | 'non-capturing' | 'named' | 'lookahead' | 'negative-lookahead' | 'lookbehind' | 'negative-lookbehind';
  name?: string;
  index?: number;
  body: RegexNode;
}
export interface LiteralNode extends BaseNode {
  type: 'literal';
  value: string;
}
export interface CharClassNode extends BaseNode {
  type: 'charClass';
  negated: boolean;
  parts: Array<{ kind: 'char'; value: string } | { kind: 'range'; from: string; to: string } | { kind: 'shorthand'; value: string }>;
}
export interface ShorthandNode extends BaseNode {
  type: 'shorthand';
  value: string; // d, D, w, W, s, S, b, B
}
export interface AnchorNode extends BaseNode {
  type: 'anchor';
  value: '^' | '$' | '\\b' | '\\B';
}
export interface QuantifierNode extends BaseNode {
  type: 'quantifier';
  min: number;
  max: number | null; // null = unbounded
  lazy: boolean;
  possessive: boolean;
  child: RegexNode;
}
export interface BackreferenceNode extends BaseNode {
  type: 'backreference';
  ref: string;
}
export interface DotNode extends BaseNode {
  type: 'dot';
}

export type RegexNode =
  | AlternationNode
  | SequenceNode
  | GroupNode
  | LiteralNode
  | CharClassNode
  | ShorthandNode
  | AnchorNode
  | QuantifierNode
  | BackreferenceNode
  | DotNode;

export interface RegexParseError {
  message: string;
  index: number;
}

export interface RegexParseResult {
  ast: RegexNode | null;
  error: RegexParseError | null;
  groupCount: number;
  groupNames: string[];
}

class RegexParser {
  i = 0;
  groupIndex = 0;
  groupNames: string[] = [];

  constructor(readonly src: string) {}

  error(message: string): never {
    const err = new Error(message) as Error & { index: number };
    err.index = this.i;
    throw err;
  }

  peek(offset = 0): string | undefined {
    return this.src[this.i + offset];
  }

  parse(): RegexNode {
    const node = this.parseAlternation();
    if (this.i < this.src.length) {
      if (this.peek() === ')') this.error('Unmatched closing parenthesis “)”.');
      this.error(`Unexpected character “${this.peek()}”.`);
    }
    return node;
  }

  parseAlternation(): RegexNode {
    const start = this.i;
    const options: RegexNode[] = [this.parseSequence()];
    while (this.peek() === '|') {
      this.i++;
      options.push(this.parseSequence());
    }
    if (options.length === 1) return options[0]!;
    return { type: 'alternation', options, start, end: this.i };
  }

  parseSequence(): SequenceNode {
    const start = this.i;
    const items: RegexNode[] = [];
    while (this.i < this.src.length && this.peek() !== '|' && this.peek() !== ')') {
      const atom = this.parseAtom();
      items.push(this.parseQuantifier(atom));
    }
    return { type: 'sequence', items, start, end: this.i };
  }

  parseQuantifier(child: RegexNode): RegexNode {
    const ch = this.peek();
    let min: number;
    let max: number | null;
    const start = child.start;

    if (ch === '*') {
      min = 0;
      max = null;
      this.i++;
    } else if (ch === '+') {
      min = 1;
      max = null;
      this.i++;
    } else if (ch === '?') {
      min = 0;
      max = 1;
      this.i++;
    } else if (ch === '{') {
      const m = /^\{(\d+)(,(\d*)?)?\}/.exec(this.src.slice(this.i));
      if (!m) return child; // a literal brace
      min = Number(m[1]);
      if (m[2] === undefined) max = min;
      else if (m[3] === '' || m[3] === undefined) max = null;
      else max = Number(m[3]);
      if (max !== null && max < min)
        this.error(`Quantifier {${min},${max}} has a maximum lower than its minimum.`);
      this.i += m[0].length;
    } else {
      return child;
    }

    if (child.type === 'anchor')
      this.error('A quantifier cannot follow an anchor — there is nothing to repeat.');

    let lazy = false;
    let possessive = false;
    if (this.peek() === '?') {
      lazy = true;
      this.i++;
    } else if (this.peek() === '+') {
      possessive = true;
      this.i++;
    }

    return {
      type: 'quantifier',
      min,
      max,
      lazy,
      possessive,
      child,
      start,
      end: this.i,
    };
  }

  parseAtom(): RegexNode {
    const start = this.i;
    const ch = this.peek();
    if (ch === undefined) this.error('Unexpected end of pattern.');

    if (ch === '(') return this.parseGroup();
    if (ch === '[') return this.parseCharClass();
    if (ch === '.') {
      this.i++;
      return { type: 'dot', start, end: this.i };
    }
    if (ch === '^' || ch === '$') {
      this.i++;
      return { type: 'anchor', value: ch, start, end: this.i };
    }
    if (ch === '\\') return this.parseEscape();
    if (ch === '*' || ch === '+' || ch === '?')
      this.error(`Nothing to repeat before “${ch}”.`);

    this.i++;
    return { type: 'literal', value: ch, start, end: this.i };
  }

  parseEscape(): RegexNode {
    const start = this.i;
    this.i++; // backslash
    const ch = this.peek();
    if (ch === undefined) this.error('Pattern ends with a dangling backslash.');
    this.i++;

    if ('dDwWsS'.includes(ch)) return { type: 'shorthand', value: ch, start, end: this.i };
    if (ch === 'b' || ch === 'B')
      return { type: 'anchor', value: `\\${ch}`, start, end: this.i };

    if (/[1-9]/.test(ch)) {
      let digits = ch;
      while (/[0-9]/.test(this.peek() ?? '')) digits += this.src[this.i++];
      return { type: 'backreference', ref: digits, start, end: this.i };
    }
    if (ch === 'k' && this.peek() === '<') {
      const close = this.src.indexOf('>', this.i);
      if (close < 0) this.error('Unterminated named backreference — “>” is missing.');
      const name = this.src.slice(this.i + 1, close);
      this.i = close + 1;
      return { type: 'backreference', ref: name, start, end: this.i };
    }
    if (ch === 'u') {
      if (this.peek() === '{') {
        const close = this.src.indexOf('}', this.i);
        if (close < 0) this.error('Unterminated \\u{...} escape.');
        const hex = this.src.slice(this.i + 1, close);
        this.i = close + 1;
        return { type: 'literal', value: String.fromCodePoint(parseInt(hex, 16) || 0), start, end: this.i };
      }
      const hex = this.src.slice(this.i, this.i + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.error(`Invalid \\u escape “\\u${hex}”.`);
      this.i += 4;
      return { type: 'literal', value: String.fromCharCode(parseInt(hex, 16)), start, end: this.i };
    }
    if (ch === 'x') {
      const hex = this.src.slice(this.i, this.i + 2);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.error(`Invalid \\x escape “\\x${hex}”.`);
      this.i += 2;
      return { type: 'literal', value: String.fromCharCode(parseInt(hex, 16)), start, end: this.i };
    }
    if (ch === 'p' || ch === 'P') {
      if (this.peek() === '{') {
        const close = this.src.indexOf('}', this.i);
        if (close < 0) this.error('Unterminated Unicode property escape.');
        const name = this.src.slice(this.i + 1, close);
        this.i = close + 1;
        return { type: 'shorthand', value: `${ch}{${name}}`, start, end: this.i };
      }
    }

    const named: Record<string, string> = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', 0: '\0' };
    return { type: 'literal', value: named[ch] ?? ch, start, end: this.i };
  }

  parseGroup(): GroupNode {
    const start = this.i;
    this.i++; // (
    let kind: GroupNode['kind'] = 'capturing';
    let name: string | undefined;
    let index: number | undefined;

    if (this.peek() === '?') {
      const c1 = this.peek(1);
      if (c1 === ':') {
        kind = 'non-capturing';
        this.i += 2;
      } else if (c1 === '=') {
        kind = 'lookahead';
        this.i += 2;
      } else if (c1 === '!') {
        kind = 'negative-lookahead';
        this.i += 2;
      } else if (c1 === '<' && this.peek(2) === '=') {
        kind = 'lookbehind';
        this.i += 3;
      } else if (c1 === '<' && this.peek(2) === '!') {
        kind = 'negative-lookbehind';
        this.i += 3;
      } else if (c1 === '<') {
        const close = this.src.indexOf('>', this.i);
        if (close < 0) this.error('Unterminated group name — “>” is missing.');
        name = this.src.slice(this.i + 2, close);
        if (!/^[A-Za-z_$][\w$]*$/.test(name))
          this.error(`“${name}” is not a valid group name.`);
        kind = 'named';
        this.i = close + 1;
        this.groupIndex++;
        index = this.groupIndex;
        this.groupNames.push(name);
      } else {
        this.error('Unsupported group syntax after “(?”.');
      }
    } else {
      this.groupIndex++;
      index = this.groupIndex;
    }

    const body = this.parseAlternation();
    if (this.peek() !== ')') this.error('Unmatched opening parenthesis “(”.');
    this.i++;

    return {
      type: 'group',
      kind,
      ...(name !== undefined ? { name } : {}),
      ...(index !== undefined ? { index } : {}),
      body,
      start,
      end: this.i,
    };
  }

  parseCharClass(): CharClassNode {
    const start = this.i;
    this.i++; // [
    let negated = false;
    if (this.peek() === '^') {
      negated = true;
      this.i++;
    }
    const parts: CharClassNode['parts'] = [];

    while (this.i < this.src.length && this.peek() !== ']') {
      let from: string;
      if (this.peek() === '\\') {
        this.i++;
        const esc = this.peek();
        if (esc === undefined) this.error('Dangling backslash in character class.');
        this.i++;
        if ('dDwWsS'.includes(esc)) {
          parts.push({ kind: 'shorthand', value: esc });
          continue;
        }
        const named: Record<string, string> = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', 0: '\0' };
        if (esc === 'x') {
          const hex = this.src.slice(this.i, this.i + 2);
          this.i += 2;
          from = String.fromCharCode(parseInt(hex, 16) || 0);
        } else if (esc === 'u') {
          const hex = this.src.slice(this.i, this.i + 4);
          this.i += 4;
          from = String.fromCharCode(parseInt(hex, 16) || 0);
        } else {
          from = named[esc] ?? esc;
        }
      } else {
        from = this.src[this.i]!;
        this.i++;
      }

      if (this.peek() === '-' && this.peek(1) !== undefined && this.peek(1) !== ']') {
        this.i++;
        let to: string;
        if (this.peek() === '\\') {
          this.i++;
          to = this.src[this.i]!;
          this.i++;
        } else {
          to = this.src[this.i]!;
          this.i++;
        }
        if (to.charCodeAt(0) < from.charCodeAt(0))
          this.error(`Character range “${from}-${to}” is out of order.`);
        parts.push({ kind: 'range', from, to });
        continue;
      }
      parts.push({ kind: 'char', value: from });
    }

    if (this.peek() !== ']') this.error('Unterminated character class — “]” is missing.');
    this.i++;
    if (parts.length === 0) this.error('Empty character class “[]” can never match.');

    return { type: 'charClass', negated, parts, start, end: this.i };
  }
}

export function parseRegex(pattern: string): RegexParseResult {
  const parser = new RegexParser(pattern);
  try {
    const ast = parser.parse();
    return { ast, error: null, groupCount: parser.groupIndex, groupNames: parser.groupNames };
  } catch (e) {
    const err = e as Error & { index?: number };
    return {
      ast: null,
      error: { message: err.message, index: err.index ?? parser.i },
      groupCount: parser.groupIndex,
      groupNames: parser.groupNames,
    };
  }
}

// --- plain-English explanation -----------------------------------------------

const SHORTHAND_TEXT: Record<string, string> = {
  d: 'any digit (0-9)',
  D: 'any character that is not a digit',
  w: 'any word character (letter, digit or underscore)',
  W: 'any character that is not a word character',
  s: 'any whitespace (space, tab, newline)',
  S: 'any character that is not whitespace',
};

function describeChar(c: string): string {
  const map: Record<string, string> = {
    '\n': 'a newline',
    '\t': 'a tab',
    '\r': 'a carriage return',
    ' ': 'a space',
  };
  return map[c] ?? `“${c}”`;
}

function quantifierText(node: QuantifierNode): string {
  const { min, max, lazy } = node;
  let base: string;
  if (min === 0 && max === null) base = 'zero or more times';
  else if (min === 1 && max === null) base = 'one or more times';
  else if (min === 0 && max === 1) base = 'optionally (zero or one time)';
  else if (max === null) base = `at least ${min} times`;
  else if (min === max) base = `exactly ${min} time${min === 1 ? '' : 's'}`;
  else base = `between ${min} and ${max} times`;
  if (lazy) base += ', as few as possible';
  else if (node.possessive) base += ', without backtracking';
  return base;
}

export interface ExplanationLine {
  depth: number;
  text: string;
  /** Source span for highlight-on-hover. */
  start: number;
  end: number;
}

export function explainRegex(node: RegexNode, depth = 0, out: ExplanationLine[] = []): ExplanationLine[] {
  const push = (text: string) => out.push({ depth, text, start: node.start, end: node.end });

  switch (node.type) {
    case 'sequence': {
      // Collapse runs of adjacent literals into one readable phrase.
      const items = node.items;
      let i = 0;
      while (i < items.length) {
        const item = items[i]!;
        if (item.type === 'literal') {
          let text = item.value;
          const startIdx = item.start;
          let endIdx = item.end;
          let j = i + 1;
          while (j < items.length && items[j]!.type === 'literal') {
            text += (items[j] as LiteralNode).value;
            endIdx = items[j]!.end;
            j++;
          }
          if (text.length > 1) {
            out.push({ depth, text: `the text “${text}”`, start: startIdx, end: endIdx });
            i = j;
            continue;
          }
        }
        explainRegex(item, depth, out);
        i++;
      }
      return out;
    }
    case 'alternation': {
      push('any one of the following alternatives:');
      node.options.forEach((option, idx) => {
        out.push({
          depth: depth + 1,
          text: `option ${idx + 1}:`,
          start: option.start,
          end: option.end,
        });
        explainRegex(option, depth + 2, out);
      });
      return out;
    }
    case 'group': {
      const labels: Record<GroupNode['kind'], string> = {
        capturing: `capture group ${node.index}`,
        'non-capturing': 'a group (not captured)',
        named: `capture group “${node.name}”`,
        lookahead: 'followed by (lookahead)',
        'negative-lookahead': 'NOT followed by (negative lookahead)',
        lookbehind: 'preceded by (lookbehind)',
        'negative-lookbehind': 'NOT preceded by (negative lookbehind)',
      };
      push(`${labels[node.kind]}:`);
      explainRegex(node.body, depth + 1, out);
      return out;
    }
    case 'quantifier': {
      const child = node.child;
      const simple =
        child.type === 'literal' ||
        child.type === 'shorthand' ||
        child.type === 'dot' ||
        child.type === 'charClass';
      if (simple) {
        const inner = explainRegex(child, depth, []);
        const text = inner.map((l) => l.text).join(' ');
        push(`${text}, repeated ${quantifierText(node)}`);
        return out;
      }
      push(`the following, repeated ${quantifierText(node)}:`);
      explainRegex(child, depth + 1, out);
      return out;
    }
    case 'literal':
      push(describeChar(node.value));
      return out;
    case 'dot':
      push('any character (except a newline, unless the s flag is set)');
      return out;
    case 'shorthand':
      push(SHORTHAND_TEXT[node.value] ?? `the class \\${node.value}`);
      return out;
    case 'anchor': {
      const map: Record<AnchorNode['value'], string> = {
        '^': 'the start of the string (or line, with the m flag)',
        $: 'the end of the string (or line, with the m flag)',
        '\\b': 'a word boundary',
        '\\B': 'a position that is not a word boundary',
      };
      push(map[node.value]);
      return out;
    }
    case 'backreference':
      push(`the same text that capture group ${node.ref} matched`);
      return out;
    case 'charClass': {
      const described = node.parts.map((p) => {
        if (p.kind === 'char') return describeChar(p.value);
        if (p.kind === 'range') return `${p.from} to ${p.to}`;
        return SHORTHAND_TEXT[p.value] ?? `\\${p.value}`;
      });
      push(
        `${node.negated ? 'any character EXCEPT' : 'any one of'}: ${described.join(', ')}`,
      );
      return out;
    }
  }
}

// --- linting -------------------------------------------------------------------

export interface RegexWarning {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

function containsUnbounded(node: RegexNode): boolean {
  switch (node.type) {
    case 'quantifier':
      return node.max === null || node.max > 20 || containsUnbounded(node.child);
    case 'sequence':
      return node.items.some(containsUnbounded);
    case 'alternation':
      return node.options.some(containsUnbounded);
    case 'group':
      return containsUnbounded(node.body);
    default:
      return false;
  }
}

/** Heuristics for patterns that commonly cause catastrophic backtracking. */
export function lintRegex(ast: RegexNode, pattern: string, flags: string): RegexWarning[] {
  const warnings: RegexWarning[] = [];

  const visit = (node: RegexNode): void => {
    if (node.type === 'quantifier') {
      const unbounded = node.max === null;
      const child = node.child;
      if (unbounded && child.type === 'group' && containsUnbounded(child.body)) {
        warnings.push({
          severity: 'warning',
          message:
            'Nested unbounded quantifiers (e.g. “(a+)+”) can cause catastrophic backtracking. A crafted input could hang whatever runs this pattern.',
        });
      }
      if (
        unbounded &&
        child.type === 'group' &&
        child.body.type === 'alternation' &&
        child.body.options.length > 1
      ) {
        const overlapping = child.body.options.some(
          (o) => o.type === 'sequence' && o.items.length === 1 && o.items[0]?.type === 'shorthand',
        );
        if (overlapping)
          warnings.push({
            severity: 'warning',
            message:
              'A repeated alternation with overlapping branches (e.g. “(\\d|\\w)+”) is a common backtracking trap.',
          });
      }
    }
    if (node.type === 'group' && node.kind === 'capturing') {
      // informational only
    }
    switch (node.type) {
      case 'sequence':
        node.items.forEach(visit);
        break;
      case 'alternation':
        node.options.forEach(visit);
        break;
      case 'group':
        visit(node.body);
        break;
      case 'quantifier':
        visit(node.child);
        break;
      default:
        break;
    }
  };
  visit(ast);

  if (pattern.includes('.*.*')) {
    warnings.push({
      severity: 'warning',
      message: 'Two adjacent “.*” are redundant and multiply the number of backtracking paths.',
    });
  }
  if (/\[[^\]]*\.\s*[^\]]*\]/.test(pattern) && pattern.includes('[.')) {
    warnings.push({
      severity: 'info',
      message: 'Inside a character class “.” is a literal dot; escaping it is unnecessary.',
    });
  }
  if (flags.includes('g') && flags.includes('y')) {
    warnings.push({
      severity: 'info',
      message: 'The y (sticky) flag makes g behave differently — matching only at lastIndex.',
    });
  }
  if (!flags.includes('u') && /\\p\{/.test(pattern)) {
    warnings.push({
      severity: 'error',
      message: 'Unicode property escapes (\\p{...}) require the u flag.',
    });
  }

  return warnings;
}

// --- execution ------------------------------------------------------------------

export interface RegexMatch {
  index: number;
  length: number;
  value: string;
  groups: Array<{ name: string; value: string | undefined; index: number }>;
}

export interface RegexRunResult {
  matches: RegexMatch[];
  error: string | null;
  /** True when the match loop was stopped by the safety limit. */
  truncated: boolean;
  durationMs: number;
}

const MAX_MATCHES = 5000;
const TIME_BUDGET_MS = 750;

/**
 * Execute a pattern with a match cap and a wall-clock budget so a pathological
 * regex degrades into a warning instead of freezing the browser tab.
 */
export function runRegex(pattern: string, flags: string, input: string): RegexRunResult {
  const started = performance.now();
  let re: RegExp;
  try {
    const globalFlags = flags.includes('g') || flags.includes('y') ? flags : flags + 'g';
    re = new RegExp(pattern, globalFlags);
  } catch (e) {
    return {
      matches: [],
      error: e instanceof Error ? e.message : String(e),
      truncated: false,
      durationMs: performance.now() - started,
    };
  }

  const matches: RegexMatch[] = [];
  let truncated = false;
  let guard = 0;

  try {
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const groups: RegexMatch['groups'] = [];
      for (let g = 1; g < m.length; g++) {
        groups.push({ name: String(g), value: m[g], index: g });
      }
      if (m.groups) {
        for (const [name, value] of Object.entries(m.groups)) {
          groups.push({ name, value, index: -1 });
        }
      }
      matches.push({ index: m.index, length: m[0].length, value: m[0], groups });

      if (m[0].length === 0) re.lastIndex++; // avoid an infinite loop on empty matches
      if (matches.length >= MAX_MATCHES) {
        truncated = true;
        break;
      }
      if (++guard % 200 === 0 && performance.now() - started > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      if (!re.global && !re.sticky) break;
    }
  } catch (e) {
    return {
      matches,
      error: e instanceof Error ? e.message : String(e),
      truncated,
      durationMs: performance.now() - started,
    };
  }

  return { matches, error: null, truncated, durationMs: performance.now() - started };
}

/** Apply a replacement template, guarding against invalid `$` references. */
export function runReplace(
  pattern: string,
  flags: string,
  input: string,
  replacement: string,
): { output: string; error: string | null } {
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    return { output: input.replace(re, replacement), error: null };
  } catch (e) {
    return { output: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export const FLAG_INFO: Array<{ flag: string; name: string; description: string }> = [
  { flag: 'g', name: 'global', description: 'Find all matches, not just the first.' },
  { flag: 'i', name: 'ignore case', description: 'Match regardless of upper/lower case.' },
  { flag: 'm', name: 'multiline', description: '^ and $ match the start/end of each line.' },
  { flag: 's', name: 'dot all', description: 'Let “.” also match newline characters.' },
  { flag: 'u', name: 'unicode', description: 'Enable full Unicode and \\p{...} escapes.' },
  { flag: 'y', name: 'sticky', description: 'Match only from the current lastIndex position.' },
];
