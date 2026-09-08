import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Code2,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { CATEGORIES, TOOLS, searchTools } from '@/tools/registry';
import type { ToolCategory } from '@/tools/registry';
import { useTheme } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useHotkey, useMediaQuery } from '@/hooks';

const CATEGORY_ORDER: ToolCategory[] = ['content', 'data', 'productivity'];

function ThemeToggle(): React.ReactElement {
  const { resolved, cycle } = useTheme();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={cycle}
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
    >
      {resolved === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}

/**
 * Mounted only while open, so its query/selection state resets naturally
 * instead of being cleared by an effect.
 */
function CommandPalette({ onClose }: { onClose: () => void }): React.ReactElement {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchTools(query).slice(0, 8), [query]);
  const navigate = useNavigate();

  // Focus the input once the dialog has painted.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      style={{ background: 'color-mix(in oklab, black 55%, transparent)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        className="card w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search size={16} className="muted shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const tool = results[active];
                if (tool) {
                  // Client-side navigation: a full page load would throw away
                  // the SPA state and re-download the bundle.
                  void navigate(`/tools/${tool.slug}`);
                  onClose();
                }
              }
            }}
            placeholder="Search tools…"
            aria-label="Search tools"
            aria-controls="palette-results"
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
          <kbd className="chip shrink-0 font-mono text-[0.65rem]">Esc</kbd>
        </div>
        <ul id="palette-results" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="muted px-3 py-6 text-center text-sm">
              No tool matches “{query}”.
            </li>
          )}
          {results.map((tool, index) => (
            <li key={tool.slug}>
              <Link
                to={`/tools/${tool.slug}`}
                onClick={onClose}
                onMouseEnter={() => setActive(index)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  index === active ? 'surface-3' : ''
                }`}
              >
                <tool.icon size={16} className="muted shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{tool.name}</span>
                  <span className="muted block truncate text-xs">{tool.tagline}</span>
                </span>
                <ArrowRight size={14} className="muted shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }): React.ReactElement {
  return (
    <nav aria-label="All tools" className="flex flex-col gap-5 p-4">
      {CATEGORY_ORDER.map((category) => (
        <div key={category}>
          <h2 className="muted mb-1.5 px-2 text-[0.65rem] font-bold tracking-wider uppercase">
            {CATEGORIES[category].label}
          </h2>
          <ul className="space-y-0.5">
            {TOOLS.filter((t) => t.category === category).map((tool) => (
              <li key={tool.slug}>
                <NavLink
                  to={`/tools/${tool.slug}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                      isActive ? 'font-semibold' : 'muted hover:surface-3'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background: 'color-mix(in oklab, var(--accent) 16%, transparent)',
                          color: 'var(--accent)',
                        }
                      : undefined
                  }
                >
                  <tool.icon size={15} className="shrink-0" aria-hidden />
                  <span className="truncate">{tool.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Layout(): React.ReactElement {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isHome = location.pathname === '/';

  const openPalette = useCallback((): void => {
    setMobileNavOpen(false);
    setPaletteOpen(true);
  }, []);

  useHotkey({ key: 'k', meta: true }, () => {
    setMobileNavOpen(false);
    setPaletteOpen((v) => !v);
  }, { allowInInputs: true });
  useHotkey({ key: '/', meta: false }, openPalette);

  // Scrolling the window is an external side effect, not derived state: every
  // route change should land the reader at the top of the new page.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="btn btn-primary sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ background: 'color-mix(in oklab, var(--surface) 88%, transparent)' }}
      >
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            className="btn btn-ghost btn-sm lg:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2 font-bold">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg"
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              aria-hidden
            >
              <Zap size={15} />
            </span>
            <span className="hidden text-[0.95rem] tracking-tight sm:inline">Web Tools</span>
          </Link>

          <div className="flex-1" />

          <button
            type="button"
            onClick={openPalette}
            className="btn btn-sm muted hidden min-w-52 justify-start sm:inline-flex"
          >
            <Search size={14} aria-hidden />
            <span className="flex-1 text-left font-normal">Search tools…</span>
            <kbd className="font-mono text-[0.65rem] opacity-70">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={openPalette}
            className="btn btn-ghost btn-sm sm:hidden"
            aria-label="Search tools"
          >
            <Search size={16} aria-hidden />
          </button>

          <Link to="/privacy" className="btn btn-ghost btn-sm hidden md:inline-flex" title="Privacy">
            <ShieldCheck size={16} aria-hidden />
            <span className="hidden lg:inline">Privacy</span>
          </Link>

          <ThemeToggle />

          <a
            href="https://github.com/CyberElias-TechPros/web-tools"
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-ghost btn-sm"
            aria-label="Source code on GitHub"
          >
            <Code2 size={16} aria-hidden />
          </a>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {!isHome && isDesktop && (
          <aside
            className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r lg:block"
            aria-label="Sidebar"
          >
            <Sidebar />
          </aside>
        )}

        {mobileNavOpen && !isDesktop && (
          <div
            className="fixed inset-0 top-14 z-40 lg:hidden"
            style={{ background: 'color-mix(in oklab, black 45%, transparent)' }}
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          >
            <div
              className="h-full w-72 max-w-[85vw] overflow-y-auto border-r"
              style={{ background: 'var(--surface)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="muted">
            Every tool runs entirely in your browser. No uploads, no accounts, no analytics.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link to="/" className="muted hover:underline">
              All tools
            </Link>
            <Link to="/privacy" className="muted hover:underline">
              Privacy
            </Link>
            <Link to="/about" className="muted hover:underline">
              About
            </Link>
            <a
              href="https://github.com/CyberElias-TechPros/web-tools"
              target="_blank"
              rel="noreferrer noopener"
              className="muted hover:underline"
            >
              Source
            </a>
          </nav>
        </div>
      </footer>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
