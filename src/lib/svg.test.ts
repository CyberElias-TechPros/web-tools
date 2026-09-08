import { describe, expect, it } from 'vitest';
import {
  buildSvgDocument,
  createRandom,
  defaultBlobOptions,
  defaultFillOptions,
  defaultWaveOptions,
  escapeXml,
  generateBlobPath,
  generateWavePath,
  svgToCss,
  svgToJsx,
} from '@/lib/svg';

describe('createRandom', () => {
  it('is deterministic for a given seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs between seeds', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it('stays within [0, 1)', () => {
    const rand = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('generateWavePath', () => {
  it('produces a closed path starting with a move command', () => {
    const d = generateWavePath(defaultWaveOptions);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    expect(generateWavePath(defaultWaveOptions)).toBe(generateWavePath(defaultWaveOptions));
  });

  it('changes when the seed changes', () => {
    const other = generateWavePath({ ...defaultWaveOptions, seed: 999 });
    expect(other).not.toBe(generateWavePath(defaultWaveOptions));
  });

  it('uses cubic curves when smooth and lines when not', () => {
    expect(generateWavePath({ ...defaultWaveOptions, smooth: true })).toContain(' C ');
    expect(generateWavePath({ ...defaultWaveOptions, smooth: false })).toContain(' L ');
  });

  it('anchors to the correct edge', () => {
    const bottom = generateWavePath({ ...defaultWaveOptions, edge: 'bottom' });
    expect(bottom).toContain(`L ${defaultWaveOptions.width} ${defaultWaveOptions.height}`);
    const top = generateWavePath({ ...defaultWaveOptions, edge: 'top' });
    expect(top).toContain(`L ${defaultWaveOptions.width} 0`);
  });

  it('contains only finite numbers', () => {
    const d = generateWavePath({ ...defaultWaveOptions, complexity: 12, amplitude: 1, variance: 1 });
    for (const match of d.matchAll(/-?\d+(\.\d+)?/g)) {
      expect(Number.isFinite(Number(match[0]))).toBe(true);
    }
    expect(d).not.toContain('NaN');
  });

  it('survives extreme option values', () => {
    for (const complexity of [1, 12]) {
      for (const amplitude of [0.05, 1]) {
        const d = generateWavePath({ ...defaultWaveOptions, complexity, amplitude });
        expect(d).not.toContain('NaN');
        expect(d).not.toContain('undefined');
      }
    }
  });
});

describe('generateBlobPath', () => {
  it('produces a closed cubic path', () => {
    const d = generateBlobPath(defaultBlobOptions);
    expect(d.startsWith('M ')).toBe(true);
    expect(d).toContain(' C ');
    expect(d.endsWith('Z')).toBe(true);
  });

  it('is deterministic', () => {
    expect(generateBlobPath(defaultBlobOptions)).toBe(generateBlobPath(defaultBlobOptions));
  });

  it('clamps the point count to a sane range', () => {
    const few = generateBlobPath({ ...defaultBlobOptions, points: 1 });
    const many = generateBlobPath({ ...defaultBlobOptions, points: 100 });
    expect(few.match(/C/g)?.length).toBe(3);
    expect(many.match(/C/g)?.length).toBe(24);
  });

  it('contains no NaN at any distortion', () => {
    for (const randomness of [0, 0.5, 0.9]) {
      expect(generateBlobPath({ ...defaultBlobOptions, randomness })).not.toContain('NaN');
    }
  });
});

describe('escapeXml', () => {
  it('escapes every XML metacharacter', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  });
});

describe('buildSvgDocument', () => {
  const doc = buildSvgDocument({
    width: 100,
    height: 50,
    path: 'M 0 0 L 100 50 Z',
    fill: defaultFillOptions,
    title: 'Test shape',
  });

  it('includes the SVG namespace and viewBox', () => {
    expect(doc).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(doc).toContain('viewBox="0 0 100 50"');
  });

  it('includes accessibility attributes', () => {
    expect(doc).toContain('role="img"');
    expect(doc).toContain('aria-label="Test shape"');
    expect(doc).toContain('<title>Test shape</title>');
  });

  it('emits a gradient definition for gradient fills', () => {
    expect(doc).toContain('<linearGradient');
    expect(doc).toContain('url(#grad)');
  });

  it('uses a plain colour for solid fills', () => {
    const solid = buildSvgDocument({
      width: 10,
      height: 10,
      path: 'M 0 0 Z',
      fill: { ...defaultFillOptions, mode: 'solid', color1: '#ff0000' },
      title: 't',
    });
    expect(solid).not.toContain('<linearGradient');
    expect(solid).toContain('fill="#ff0000"');
  });

  it('escapes hostile input rather than injecting markup', () => {
    const hostile = buildSvgDocument({
      width: 10,
      height: 10,
      path: 'M 0 0 Z',
      fill: { ...defaultFillOptions, mode: 'solid', color1: '"><script>alert(1)</script>' },
      title: '</title><script>alert(2)</script>',
    });
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;script&gt;');
  });

  it('renders extra layers before the main path', () => {
    const layered = buildSvgDocument({
      width: 10,
      height: 10,
      path: 'M 1 1 Z',
      fill: defaultFillOptions,
      layers: [{ path: 'M 0 0 Z', opacity: 0.3 }],
      title: 't',
    });
    expect(layered.indexOf('M 0 0 Z')).toBeLessThan(layered.indexOf('M 1 1 Z'));
  });

  it('parses as valid XML', () => {
    const parsed = new DOMParser().parseFromString(doc, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.tagName).toBe('svg');
  });
});

describe('exports', () => {
  const doc = buildSvgDocument({
    width: 100,
    height: 50,
    path: 'M 0 0 L 100 50 Z',
    fill: defaultFillOptions,
    title: 'Test',
  });

  it('produces a usable CSS background rule', () => {
    const css = svgToCss(doc);
    expect(css).toContain('background-image: url("data:image/svg+xml,');
    expect(css).toContain('background-size: cover');
  });

  it('produces JSX with camelCase attributes', () => {
    const jsx = svgToJsx(doc);
    expect(jsx).toContain('viewBox');
    // aria-* and data-* attributes are valid JSX as-is and must NOT be camelCased.
    expect(jsx).toContain('aria-label="Test"');
    expect(jsx).not.toContain('stop-color');
    expect(jsx).toContain('stopColor');
  });
});
