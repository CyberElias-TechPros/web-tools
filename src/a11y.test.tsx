import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TOOLS } from '@/tools/registry';

/**
 * Structural accessibility checks that hold for every page. These are not a
 * substitute for manual screen-reader testing, but they catch the regressions
 * that are easy to introduce and hard to notice: an unlabelled icon button, a
 * second `<h1>`, an input with no accessible name, a heading level skipped.
 */

const ROUTES = ['/', '/about', '/privacy', ...TOOLS.map((t) => `/tools/${t.slug}`)];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function accessibleName(el: Element): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const target = document.getElementById(labelledBy);
    if (target?.textContent?.trim()) return target.textContent.trim();
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();
  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim();
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const wrappingLabel = el.closest('label');
  if (wrappingLabel?.textContent?.trim()) return wrappingLabel.textContent.trim();
  if (el.textContent?.trim()) return el.textContent.trim();
  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim();
  return '';
}

beforeEach(() => {
  localStorage.clear();
});

describe('page structure', () => {
  it.each(ROUTES)('%s has exactly one level-1 heading', async (route) => {
    renderAt(route);
    // Wait for the lazy chunk.
    await screen.findAllByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it.each(ROUTES)('%s labels every button', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    const unlabelled = Array.from(document.querySelectorAll('button')).filter(
      (b) => !accessibleName(b),
    );
    expect(unlabelled.map((b) => b.outerHTML.slice(0, 120))).toEqual([]);
  });

  it.each(ROUTES)('%s labels every form control', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('input, textarea, select'),
    ).filter(
      (el) =>
        el.getAttribute('type') !== 'hidden' &&
        // Programmatic file pickers are driven by a visible, labelled button and
        // are removed from the accessibility tree, so they need no name.
        el.closest('[aria-hidden="true"]') === null,
    );
    const unlabelled = controls.filter((el) => !accessibleName(el));
    expect(unlabelled.map((el) => el.outerHTML.slice(0, 160))).toEqual([]);
  });

  it.each(ROUTES)('%s gives every link an accessible name', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    const unlabelled = Array.from(document.querySelectorAll('a')).filter(
      (a) => !accessibleName(a),
    );
    expect(unlabelled.map((a) => a.outerHTML.slice(0, 120))).toEqual([]);
  });

  it.each(ROUTES)('%s never skips a heading level', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    const levels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName[1]),
    );
    let previous = 0;
    for (const level of levels) {
      if (previous !== 0) expect(level).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
  });

  it.each(ROUTES)('%s gives every image alternative text', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    for (const img of Array.from(document.querySelectorAll('img'))) {
      expect(img.hasAttribute('alt')).toBe(true);
    }
  });

  it.each(ROUTES)('%s hides decorative SVG from assistive tech', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    const exposed = Array.from(document.querySelectorAll('svg')).filter(
      (svg) =>
        svg.getAttribute('aria-hidden') !== 'true' &&
        !svg.getAttribute('aria-label') &&
        !svg.querySelector('title'),
    );
    expect(exposed.map((s) => s.outerHTML.slice(0, 100))).toEqual([]);
  });

  it.each(ROUTES)('%s sets a document title and meta description', async (route) => {
    renderAt(route);
    await screen.findAllByRole('heading', { level: 1 });
    expect(document.title.length).toBeGreaterThan(5);
    const description = document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content');
    expect(description?.length ?? 0).toBeGreaterThan(20);
  });
});
