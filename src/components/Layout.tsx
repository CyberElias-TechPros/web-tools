import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Command,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_ORDER, TOOLS, TOOLS_BY_SLUG, searchTools } from '@/tools/registry';
import { useTheme } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Background } from '@/components/Background';
import { AnimatePresence, EASE_OUT_EXPO, PageTransition, m } from '@/components/motion';
import { useHotkey, useMediaQuery } from '@/hooks';

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

export function Logo({ compact }: { compact?: boolean }): React.ReactElement {
  return (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5 font-bold" aria-label="Web Tools home">
      <span className="relative grid h-8 w-8 place-items-center" aria-hidden>
        <span
          className="absolute inset-0 rounded-xl opacity-80 blur-md transition-opacity group-hover:opacity-100"
          style={{ background: 'conic-gradient(from 200deg, var(--accent), var(--accent-3), var(--accent-2), var(--accent))' }}
        />
        <span
          className="relative grid h-8 w-8 place-items-center rounded-xl"
          style={{
            background: 'conic-gradient(from 200deg, var(--accent), var(--accent-3), var(--accent-2), var(--accent))',
            boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.4)',
          }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--bg)' }} />
        </span>
      </span>
      {!compact && (
        <span className="hidden items-baseline gap-1 sm:flex">
          <span className="text-[0.95rem] tracking-tight">Web</span>
          <span className="font-display text-[1.25rem] italic leading-none" style={{ color: 'var(--accent)' }}>
            Tools
          </span>
        </span>
      )}
    </Link>
  );
}

function ThemeToggle(): React.ReactElement {
  const { resolved, cycle } = useTheme();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm relative overflow-hidden"
      onClick={cycle}
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={resolved}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
          className="grid place-items-center"
        >
          {resolved === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </m.span>
      </AnimatePresence>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                            */
/* -------------------------------------------------------------------------- */

function CommandPalette({ onClose }: { onClose: () => void }): React.ReactElement {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchTools(query).slice(0, 9), [query]);
  const navigate = useNavigate();

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
    <m.div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
      style={{ background: 'color-mix(in oklab, var(--bg) 70%, transparent)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        className="card glass w-full max-w-xl overflow-hidden shadow-2xl"
        style={{ boxShadow: '0 30px 80px -20px hsl(var(--shadow-color) / 0.6), 0 0 0 1px var(--line)' }}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
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
                  void navigate(`/tools/${tool.slug}`);
                  onClose();
                }
              }
            }}
            placeholder={`Search ${TOOLS.length} tools…`}
            aria-label="Search tools"
            aria-controls="palette-results"
            className="w-full bg-transparent py-3.5 text-sm outline-none"
          />
          <kbd className="kbd shrink-0">Esc</kbd>
        </div>
        <ul id="palette-results" className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="muted px-3 py-8 text-center text-sm">No tool matches “{query}”.</li>}
          {results.map((tool, index) => {
            const category = CATEGORIES[tool.category];
            return (
              <li key={tool.slug}>
                <Link
                  to={`/tools/${tool.slug}`}
                  onClick={onClose}
                  onMouseEnter={() => setActive(index)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${index === active ? 'surface-3' : ''}`}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={{ background: `oklch(0.78 0.15 ${category.hue} / 0.16)`, color: `oklch(0.78 0.15 ${category.hue})` }}
                    aria-hidden
                  >
                    <tool.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{tool.name}</span>
                    <span className="muted block truncate text-xs">{tool.tagline}</span>
                  </span>
                  <span className="muted hidden text-[0.65rem] tracking-wide uppercase sm:inline">{category.title}</span>
                  <ArrowRight size={14} className="muted shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="muted flex items-center justify-between gap-3 border-t px-3 py-2 text-[0.65rem]">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> to navigate · <kbd className="kbd">↵</kbd> to open
          </span>
          <span>{TOOLS.length} tools, all offline</span>
        </div>
      </m.div>
    </m.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                    */
/* -------------------------------------------------------------------------- */

function Sidebar({ onNavigate, activeSlug }: { onNavigate?: () => void; activeSlug?: string }): React.ReactElement {
  const activeCategory = activeSlug ? TOOLS_BY_SLUG[activeSlug]?.category : undefined;
  // Only explicit user toggles are stored; untouched groups follow the active tool.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const filtered = filter.trim() ? searchTools(filter) : null;

  return (
    <nav aria-label="All tools" className="flex flex-col gap-2 p-3">
      <label className="sr-only" htmlFor="sidebar-filter">
        Filter tools
      </label>
      <div className="relative mb-1">
        <Search size={13} className="muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" aria-hidden />
        <input
          id="sidebar-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="field !min-h-8 !rounded-lg !py-1 !pl-8 !text-xs"
          autoComplete="off"
        />
      </div>
      {filtered ? (
        <ul className="space-y-0.5">
          {filtered.length === 0 && <li className="muted px-2 py-3 text-xs">Nothing matches.</li>}
          {filtered.map((tool) => (
            <li key={tool.slug}>
              <SidebarLink slug={tool.slug} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : (
        CATEGORY_ORDER.map((category) => {
          const info = CATEGORIES[category];
          const Icon = CATEGORY_ICONS[category];
          const tools = TOOLS.filter((t) => t.category === category);
          const expanded = open[category] ?? category === activeCategory;
          return (
            <div key={category}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold tracking-wide uppercase transition-colors hover:surface-3"
                style={{ color: expanded ? `oklch(0.78 0.15 ${info.hue})` : 'var(--text-muted)' }}
                aria-expanded={expanded}
                aria-controls={`side-${category}`}
                onClick={() => setOpen((prev) => ({ ...prev, [category]: !expanded }))}
              >
                <Icon size={13} aria-hidden />
                <span className="flex-1">{info.title}</span>
                <span className="muted font-mono text-[0.6rem] normal-case">{tools.length}</span>
                <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <m.ul
                    id={`side-${category}`}
                    className="space-y-0.5 overflow-hidden pl-1"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  >
                    {tools.map((tool) => (
                      <li key={tool.slug}>
                        <SidebarLink slug={tool.slug} onNavigate={onNavigate} />
                      </li>
                    ))}
                  </m.ul>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}
    </nav>
  );
}

function SidebarLink({ slug, onNavigate }: { slug: string; onNavigate?: () => void }): React.ReactElement | null {
  const tool = TOOLS_BY_SLUG[slug];
  if (!tool) return null;
  return (
    <NavLink
      to={`/tools/${tool.slug}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.8rem] transition-colors ${isActive ? 'font-semibold' : 'muted hover:surface-3'}`
      }
      style={({ isActive }) =>
        isActive ? { background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)' } : undefined
      }
    >
      <tool.icon size={14} className="shrink-0" aria-hidden />
      <span className="truncate">{tool.name}</span>
    </NavLink>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function Layout(): React.ReactElement {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const outlet = useOutlet();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isHome = location.pathname === '/';
  const activeSlug = location.pathname.startsWith('/tools/') ? location.pathname.slice('/tools/'.length) : undefined;

  const openPalette = useCallback((): void => {
    setMobileNavOpen(false);
    setPaletteOpen(true);
  }, []);

  useHotkey({ key: 'k', meta: true }, () => {
    setMobileNavOpen(false);
    setPaletteOpen((v) => !v);
  }, { allowInInputs: true });
  useHotkey({ key: '/', meta: false }, openPalette);

  useEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, location.hash]);

  // Close the drawer whenever the route changes (state adjusted during render).
  const [navPath, setNavPath] = useState(location.pathname);
  if (navPath !== location.pathname) {
    setNavPath(location.pathname);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Background />
      <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50">
        Skip to content
      </a>

      <header
        className="sticky top-0 z-30"
        style={{
          background: 'color-mix(in oklab, var(--bg) 72%, transparent)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-2 px-3 sm:px-5">
          <button
            type="button"
            className="btn btn-ghost btn-sm lg:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>

          <Logo />

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `btn btn-ghost btn-sm ${isActive ? '' : 'muted'}`}
            >
              Tools
              <span className="kbd ml-1 !h-4 !min-w-4 !text-[0.55rem]">{TOOLS.length}</span>
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => `btn btn-ghost btn-sm ${isActive ? '' : 'muted'}`}>
              About
            </NavLink>
          </nav>

          <div className="flex-1" />

          <button type="button" onClick={openPalette} className="btn btn-sm muted hidden min-w-56 justify-start sm:inline-flex">
            <Search size={14} aria-hidden />
            <span className="flex-1 text-left font-normal">Search tools…</span>
            <span className="flex items-center gap-0.5">
              <kbd className="kbd !h-5">
                <Command size={9} aria-hidden />
              </kbd>
              <kbd className="kbd !h-5">K</kbd>
            </span>
          </button>
          <button type="button" onClick={openPalette} className="btn btn-ghost btn-sm sm:hidden" aria-label="Search tools">
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
            className="btn btn-ghost btn-sm hidden sm:inline-flex"
            aria-label="Source on GitHub"
            title="Source on GitHub"
          >
            <ArrowUpRight size={16} aria-hidden />
          </a>
        </div>
        <div className="rule-glow" aria-hidden />
      </header>

      <div className="mx-auto flex w-full max-w-[1680px] flex-1">
        {!isHome && isDesktop && (
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r lg:block" aria-label="Tool navigation">
            <Sidebar activeSlug={activeSlug} />
          </aside>
        )}

        <AnimatePresence>
          {mobileNavOpen && (
            <m.div
              className="fixed inset-0 top-14 z-40 lg:hidden"
              style={{ background: 'color-mix(in oklab, var(--bg) 60%, transparent)', backdropFilter: 'blur(6px)' }}
              onClick={() => setMobileNavOpen(false)}
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <m.div
                className="h-full w-80 max-w-[88vw] overflow-y-auto border-r"
                style={{ background: 'var(--surface)' }}
                onClick={(e) => e.stopPropagation()}
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              >
                <Sidebar onNavigate={() => setMobileNavOpen(false)} activeSlug={activeSlug} />
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        <main id="main" className="min-w-0 flex-1">
          <ErrorBoundary resetKey={location.pathname}>
            <PageTransition pageKey={location.pathname}>{outlet}</PageTransition>
          </ErrorBoundary>
        </main>
      </div>

      <footer className="relative mt-10 overflow-hidden border-t">
        <div className="mx-auto max-w-[1680px] px-4 pt-10 pb-8 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="font-display text-3xl italic leading-none sm:text-4xl">
                Web <span style={{ color: 'var(--accent)' }}>Tools</span>
              </p>
              <p className="muted mt-3 max-w-sm text-sm leading-relaxed">
                {TOOLS.length} utilities that run entirely in your browser. No uploads, no accounts, no analytics — the
                app is a folder of static files.
              </p>
            </div>
            <nav aria-label="Categories" className="text-sm">
              <p className="eyebrow mb-3">Categories</p>
              <ul className="space-y-1.5">
                {CATEGORY_ORDER.map((c) => (
                  <li key={c}>
                    <Link to={`/#${c}`} className="muted hover:underline">
                      {CATEGORIES[c].label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Footer" className="text-sm">
              <p className="eyebrow mb-3">Project</p>
              <ul className="space-y-1.5">
                <li>
                  <Link to="/" className="muted hover:underline">
                    All tools
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="muted hover:underline">
                    About
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="muted hover:underline">
                    Privacy
                  </Link>
                </li>
                <li>
                  <a href="https://github.com/CyberElias-TechPros/web-tools" target="_blank" rel="noreferrer noopener" className="muted hover:underline">
                    Source on GitHub
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <div className="muted mt-10 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs">
            <span>Processed locally. Works offline once loaded.</span>
            <span className="font-mono">MIT · v2</span>
          </div>
        </div>
        <div
          className="pointer-events-none absolute -right-20 -bottom-32 h-72 w-72 rounded-full blur-3xl"
          style={{ background: 'color-mix(in oklab, var(--accent) 22%, transparent)' }}
          aria-hidden
        />
      </footer>

      <AnimatePresence>{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}</AnimatePresence>
    </div>
  );
}
