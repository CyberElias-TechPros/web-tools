import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, ShieldCheck, WifiOff, Zap } from 'lucide-react';
import { CATEGORIES, TOOLS, searchTools } from '@/tools/registry';
import type { ToolCategory } from '@/tools/registry';
import { useDocumentMeta } from '@/components/meta';
import { EmptyState } from '@/components/ui';

const CATEGORY_ORDER: ToolCategory[] = ['content', 'data', 'productivity'];

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Nothing is uploaded',
    body: 'Every tool runs in your browser. Your files, keys and text never touch a server, because there is no server.',
  },
  {
    icon: Zap,
    title: 'Instant, no sign-up',
    body: 'No accounts, no paywalls, no cookie banner. Open a tool and it works; the whole app is a few dozen kilobytes.',
  },
  {
    icon: WifiOff,
    title: 'Works offline',
    body: 'Once loaded, the tools keep working with no connection. Useful on a plane, and proof that nothing is phoning home.',
  },
];

export function HomePage(): React.ReactElement {
  const [query, setQuery] = useState('');
  useDocumentMeta({ path: '/' });

  const filtered = useMemo(() => searchTools(query), [query]);
  const isSearching = query.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <section className="mb-10 text-center sm:mb-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">
          Ten tools that fix ten
          <span style={{ color: 'var(--accent)' }}> everyday annoyances</span>
        </h1>
        <p className="muted mx-auto mt-4 max-w-2xl text-base leading-relaxed text-pretty sm:text-lg">
          Clean up Markdown, decode a regex, repair broken JSON, shrink a folder of images, convert
          a spreadsheet, rename a hundred files, schedule across time zones, generate a background
          shape, diff two blocks of text, and make a password worth trusting. All of it locally, in
          this tab.
        </p>

        <div className="mx-auto mt-7 max-w-md">
          <label htmlFor="tool-search" className="sr-only">
            Search tools
          </label>
          <div className="relative">
            <Search
              size={17}
              className="muted pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
              aria-hidden
            />
            <input
              id="tool-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or task — “json”, “compress”, “timezone”…"
              className="field !min-h-11 !pl-10 !text-base"
              autoComplete="off"
            />
          </div>
        </div>
      </section>

      {isSearching ? (
        <section aria-label="Search results">
          <p className="muted mb-3 text-sm">
            {filtered.length} {filtered.length === 1 ? 'tool matches' : 'tools match'} “{query}”
          </p>
          {filtered.length === 0 ? (
            <EmptyState
              title="No tool matches that search"
              description="Try a broader term like “text”, “image”, “data” or “convert”."
              action={
                <button type="button" className="btn" onClick={() => setQuery('')}>
                  Clear search
                </button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((tool) => (
                <ToolCard key={tool.slug} slug={tool.slug} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {CATEGORY_ORDER.map((category) => (
            <section key={category} className="mb-10" aria-labelledby={`cat-${category}`}>
              <div className="mb-3">
                <h2 id={`cat-${category}`} className="text-lg font-bold tracking-tight">
                  {CATEGORIES[category].label}
                </h2>
                <p className="muted text-sm">{CATEGORIES[category].description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TOOLS.filter((t) => t.category === category).map((tool) => (
                  <ToolCard key={tool.slug} slug={tool.slug} />
                ))}
              </div>
            </section>
          ))}

          <section className="mt-14 grid gap-4 sm:grid-cols-3" aria-label="Why these tools">
            {PROMISES.map((promise) => (
              <div key={promise.title} className="card p-5">
                <promise.icon size={20} style={{ color: 'var(--accent)' }} aria-hidden />
                <h3 className="mt-2.5 text-sm font-semibold">{promise.title}</h3>
                <p className="muted mt-1 text-xs leading-relaxed">{promise.body}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function ToolCard({ slug }: { slug: string }): React.ReactElement | null {
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) return null;
  const Icon = tool.icon;
  return (
    <Link
      to={`/tools/${tool.slug}`}
      className="card group flex flex-col gap-2 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ transitionDuration: '150ms' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors"
          style={{
            background: 'color-mix(in oklab, var(--accent) 16%, transparent)',
            color: 'var(--accent)',
          }}
          aria-hidden
        >
          <Icon size={18} />
        </span>
        <ArrowRight
          size={16}
          className="muted mt-1 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <h3 className="text-sm leading-tight font-semibold">{tool.name}</h3>
      <p className="muted text-xs leading-relaxed">{tool.tagline}</p>
    </Link>
  );
}
