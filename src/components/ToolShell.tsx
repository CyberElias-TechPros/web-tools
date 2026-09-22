import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Lock } from 'lucide-react';
import { CATEGORIES, TOOLS_BY_SLUG, relatedTools } from '@/tools/registry';
import { useToolMeta } from '@/components/meta';
import { Reveal, Spotlight, Stagger, StaggerItem, m } from '@/components/motion';

interface ToolShellProps {
  slug: string;
  children: ReactNode;
  /** Buttons rendered on the right of the tool header. */
  actions?: ReactNode;
  /** Optional wider content area for tools that need the room. */
  wide?: boolean;
}

/** CSS custom properties that tint a tool page with its category hue. */
export function categoryStyle(hue: number): CSSProperties {
  return {
    '--cat': `oklch(0.78 0.15 ${hue})`,
    '--cat-soft': `oklch(0.78 0.15 ${hue} / 0.16)`,
  } as CSSProperties;
}

export function ToolShell({ slug, children, actions, wide }: ToolShellProps): React.ReactElement {
  const tool = TOOLS_BY_SLUG[slug];
  useToolMeta(slug);
  const category = tool ? CATEGORIES[tool.category] : null;
  const related = relatedTools(slug, 4);

  return (
    <div
      className={`mx-auto w-full px-3 pt-5 pb-10 sm:px-5 ${wide ? '' : 'max-w-[1400px]'}`}
      style={category ? categoryStyle(category.hue) : undefined}
    >
      <nav aria-label="Breadcrumb" className="muted mb-4 flex flex-wrap items-center gap-1 text-xs">
        <Link to="/" className="hover:underline">
          Tools
        </Link>
        <ChevronRight size={12} aria-hidden />
        {category && (
          <>
            <Link to={`/#${tool?.category}`} className="hover:underline">
              {category.label}
            </Link>
            <ChevronRight size={12} aria-hidden />
          </>
        )}
        <span aria-current="page">{tool?.name ?? slug}</span>
      </nav>

      <header className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
        <div
          className="pointer-events-none absolute -top-16 -left-24 h-56 w-56 rounded-full opacity-60 blur-3xl"
          style={{ background: 'var(--cat-soft)' }}
          aria-hidden
        />
        <div className="relative min-w-0 max-w-3xl">
          <div className="flex items-center gap-3">
            {tool && (
              <m.span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, var(--cat-soft), transparent 80%)',
                  border: '1px solid color-mix(in oklab, var(--cat) 35%, transparent)',
                  color: 'var(--cat)',
                  boxShadow: '0 12px 30px -14px var(--cat)',
                }}
                initial={{ scale: 0.7, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
                aria-hidden
              >
                <tool.icon size={21} />
              </m.span>
            )}
            <div className="min-w-0">
              {category && <p className="eyebrow" style={{ color: 'var(--cat)' }}>{category.label}</p>}
              <h1 className="text-xl font-bold tracking-tight sm:text-[1.65rem]">{tool?.name ?? slug}</h1>
            </div>
          </div>
          {tool && <p className="muted mt-3 max-w-2xl text-sm leading-relaxed text-pretty">{tool.problem}</p>}
        </div>
        {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}>
        {children}
      </m.div>

      <p className="muted mt-8 flex items-center justify-center gap-1.5 text-xs">
        <Lock size={12} aria-hidden />
        Processed locally in your browser — nothing is uploaded.
      </p>

      {related.length > 0 && (
        <Reveal as="section" className="mt-12" aria-labelledby="related-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="related-heading" className="text-base font-semibold tracking-tight">
              More in <span className="font-display text-xl italic" style={{ color: 'var(--cat)' }}>{category?.title}</span>
            </h2>
            <Link to="/" className="muted flex items-center gap-1 text-xs hover:underline">
              All tools <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>
          <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((t) => (
              <StaggerItem key={t.slug} as="li">
                <Spotlight className="card h-full transition-transform duration-300 hover:-translate-y-0.5">
                  <Link to={`/tools/${t.slug}`} className="flex h-full flex-col gap-2 p-4">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <t.icon size={15} style={{ color: 'var(--cat)' }} aria-hidden />
                      {t.name}
                    </span>
                    <span className="muted line-clamp-2 text-xs leading-relaxed">{t.tagline}</span>
                  </Link>
                </Spotlight>
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      )}
    </div>
  );
}
