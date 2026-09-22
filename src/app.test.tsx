import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TOOLS } from '@/tools/registry';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('routing', () => {
  it('renders the home page with every tool listed', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    await waitFor(() => {
      const hrefs = new Set(Array.from(document.querySelectorAll('a[href^="/tools/"]')).map((a) => a.getAttribute('href')));
      const missing = TOOLS.filter((tool) => !hrefs.has(`/tools/${tool.slug}`)).map((t) => t.slug);
      expect(missing).toEqual([]);
    });
    // Every card carries the tool's name as (part of) its accessible name.
    const sample = TOOLS[0]!;
    const links = await screen.findAllByRole('link', { name: new RegExp(sample.name, 'i') });
    expect(links.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('renders a 404 page for an unknown route', async () => {
    renderAt('/definitely-not-a-page');
    expect(await screen.findByRole('heading', { name: /does not exist/i, level: 1 })).toBeTruthy();
  });

  it('renders a 404 page for an unknown tool slug', async () => {
    renderAt('/tools/nope');
    expect(await screen.findByRole('heading', { name: /does not exist/i, level: 1 })).toBeTruthy();
  });

  it('renders the privacy page', async () => {
    renderAt('/privacy');
    expect(await screen.findByRole('heading', { name: /privacy/i })).toBeTruthy();
  });

  it('renders the about page', async () => {
    renderAt('/about');
    expect(await screen.findByRole('heading', { name: /about/i, level: 1 })).toBeTruthy();
  });

  it('exposes a skip link and a main landmark', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /skip to content/i })).toBeTruthy();
    expect(document.getElementById('main')).toBeTruthy();
  });

  it.each(TOOLS.map((t) => [t.slug, t.name] as const))(
    'lazily loads /tools/%s without crashing',
    async (slug, name) => {
      renderAt(`/tools/${slug}`);
      expect(await screen.findByRole('heading', { name: new RegExp(name, 'i'), level: 1 })).toBeTruthy();
    },
  );

  it('sets the document title per route', async () => {
    renderAt('/tools/json-formatter');
    await waitFor(() => expect(document.title).toMatch(/JSON/i));
  });
});

describe('command palette', () => {
  it('opens with ⌘K and filters tools', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { name: /every small job/i, level: 1 });

    await user.keyboard('{Meta>}k{/Meta}');
    const dialog = await screen.findByRole('dialog', { name: /search tools/i });

    await user.type(within(dialog).getByRole('textbox'), 'passw');
    await waitFor(() => {
      const links = within(dialog).getAllByRole('link');
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0]?.getAttribute('href')).toBe('/tools/password-generator');
      expect(links.length).toBeLessThan(TOOLS.length / 2);
    });
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { name: /every small job/i, level: 1 });
    await user.keyboard('{Meta>}k{/Meta}');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reports when nothing matches', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { name: /every small job/i, level: 1 });
    await user.keyboard('{Meta>}k{/Meta}');
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'zzzzzz');
    expect(await within(dialog).findByText(/no tool matches/i)).toBeTruthy();
  });
});
