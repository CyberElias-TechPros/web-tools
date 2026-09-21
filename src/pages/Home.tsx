import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Command, FileText, Search, ShieldCheck, WifiOff, Zap } from 'lucide-react';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_ORDER, TOOLS, searchTools } from '@/tools/registry';
import type { Tool, ToolCategory } from '@/tools/registry';
import { useDocumentMeta } from '@/components/meta';
import { EmptyState } from '@/components/ui';
import { Counter, Magnetic, Marquee, Reveal, Spotlight, Stagger, StaggerItem, Tilt, Words, m } from '@/components/motion';

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Nothing is uploaded',
    body: 'Every tool runs in your browser. Your files, keys and text never touch a server, because there is no server.',
  },
  {
    icon: Zap,
    title: 'Instant, no sign-up',
    body: 'No accounts, no paywalls, no cookie banner. Open a tool and it works; each one loads only the code it needs.',
  },
  {
    icon: WifiOff,
    title: 'Works offline',
    body: 'Once loaded, the tools keep working with no connection. Useful on a plane, and proof that nothing is phoning home.',
  },
];

const FEATURED: string[] = ['word-to-pdf', 'pdf-merge', 'json-formatter', 'image-compressor', 'qr-generator', 'jwt-decoder'];

export function HomePage(): React.ReactElement {
  const [query, setQuery] = useState('');
  const location = useLocation();
  useDocumentMeta({ path: '/' });

  const filtered = useMemo(() => searchTools(query), [query]);
  const isSearching = query.trim().length > 0;

  // Deep links such as /#developer scroll to the chapter once it exists.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  return (
    <div className="w-full">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-10 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-24">
        <div className="relative z-10">
          <m.p
            className="chip mb-5 !gap-2 !py-1 !pr-3 !pl-1.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full" style={{ background: 'var(--ok)', animation: 'pulse-ring 1.8s ease-out infinite' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--ok)' }} />
            </span>
            <span className="text-[0.7rem] tracking-wide">
              {TOOLS.length} tools · 0 uploads · runs entirely in this tab
            </span>
          </m.p>

          <h1 className="text-[2.6rem] leading-[1.02] font-bold tracking-[-0.03em] text-balance sm:text-6xl lg:text-[4.4rem]">
            <Words text="Every small job," />
            <br />
            <span className="font-display text-gradient text-[1.18em] italic tracking-normal">
              <Words text="finished in the browser." delay={0.25} />
            </span>
          </h1>

          <m.p
            className="muted mt-6 max-w-xl text-base leading-relaxed text-pretty sm:text-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
          >
            Combine Word files into a PDF, split and stamp documents, convert images, decode tokens, build
            palettes, count words, plan across time zones. {TOOLS.length} carefully made utilities in one place — private
            by construction, because nothing ever leaves your device.
          </m.p>

          <m.div
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <div className="relative w-full max-w-md">
              <label htmlFor="tool-search" className="sr-only">
                Search tools
              </label>
              <Search size={17} className="muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2" aria-hidden />
              <input
                id="tool-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — “pdf”, “json”, “palette”, “timezone”…"
                className="field !min-h-12 !rounded-full !pl-11 !text-base"
                autoComplete="off"
              />
            </div>
            <Magnetic>
              <Link to="/tools/word-to-pdf" className="btn btn-primary btn-lg">
                <FileText size={17} aria-hidden />
                Word → PDF
                <ArrowRight size={16} aria-hidden />
              </Link>
            </Magnetic>
          </m.div>

          <m.div
            className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
          >
            {[
              { value: TOOLS.length, label: 'tools' },
              { value: CATEGORY_ORDER.length, label: 'categories' },
              { value: 0, label: 'bytes uploaded' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-4xl italic leading-none sm:text-5xl">
                  <Counter value={stat.value} />
                </p>
                <p className="eyebrow mt-2">{stat.label}</p>
              </div>
            ))}
          </m.div>
        </div>

        <HeroStage />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Marquee                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Tool names" className="relative mt-4 space-y-3 py-6">
        <div className="rule-glow" aria-hidden />
        <Marquee duration={70}>
          {TOOLS.slice(0, Math.ceil(TOOLS.length / 2)).map((tool) => (
            <MarqueeItem key={tool.slug} tool={tool} />
          ))}
        </Marquee>
        <Marquee duration={80} reverse>
          {TOOLS.slice(Math.ceil(TOOLS.length / 2)).map((tool) => (
            <MarqueeItem key={tool.slug} tool={tool} />
          ))}
        </Marquee>
        <div className="rule-glow" aria-hidden />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Index                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        {isSearching ? (
          <section aria-label="Search results">
            <p className="muted mb-4 text-sm">
              {filtered.length} {filtered.length === 1 ? 'tool matches' : 'tools match'} “{query}”
            </p>
            {filtered.length === 0 ? (
              <EmptyState
                title="No tool matches that search"
                description="Try a broader term like “text”, “image”, “pdf” or “convert”."
                action={
                  <button type="button" className="btn" onClick={() => setQuery('')}>
                    Clear search
                  </button>
                }
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((tool) => (
                  <li key={tool.slug}>
                    <ToolCard tool={tool} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <Reveal className="mb-12 max-w-2xl">
              <p className="eyebrow">The index</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Seven chapters,{' '}
                <span className="font-display italic" style={{ color: 'var(--accent)' }}>
                  {TOOLS.length} tools.
                </span>
              </h2>
              <p className="muted mt-3 text-base leading-relaxed">
                Each tool does one job properly, shares the same interface as the rest, and loads only its own code. Press{' '}
                <kbd className="kbd">
                  <Command size={10} aria-hidden />
                </kbd>{' '}
                <kbd className="kbd">K</kbd> anywhere to jump straight to one.
              </p>
            </Reveal>

            <div className="space-y-20">
              {CATEGORY_ORDER.map((category, index) => (
                <Chapter key={category} category={category} index={index} />
              ))}
            </div>

            <Reveal as="section" className="mt-28" aria-label="Why these tools">
              <div className="rule-glow mb-12" aria-hidden />
              <div className="grid gap-4 md:grid-cols-3">
                {PROMISES.map((promise, i) => (
                  <Tilt key={promise.title} max={5}>
                    <Spotlight className="card h-full p-6" style={{ transform: 'translateZ(0)' }}>
                      <span
                        className="grid h-10 w-10 place-items-center rounded-xl"
                        style={{ background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
                        aria-hidden
                      >
                        <promise.icon size={19} />
                      </span>
                      <p className="font-display mt-5 text-2xl italic leading-none">0{i + 1}</p>
                      <h3 className="mt-2 text-base font-semibold">{promise.title}</h3>
                      <p className="muted mt-1.5 text-sm leading-relaxed">{promise.body}</p>
                    </Spotlight>
                  </Tilt>
                ))}
              </div>
            </Reveal>

            <Reveal className="mt-24">
              <div
                className="card relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16"
                style={{
                  background:
                    'radial-gradient(80% 120% at 50% 120%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 60%), color-mix(in oklab, var(--surface-2) 92%, transparent)',
                }}
              >
                <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
                <p className="eyebrow relative">Open source</p>
                <h2 className="font-display relative mt-3 text-3xl italic sm:text-5xl">
                  Read the code. Run it offline. Fork it.
                </h2>
                <p className="muted relative mx-auto mt-4 max-w-xl text-sm leading-relaxed sm:text-base">
                  A static React app with hand-written parsers for ZIP, DOCX, XLSX, PPTX and Markdown, a PDF layout
                  engine, and no backend to trust.
                </p>
                <div className="relative mt-7 flex flex-wrap justify-center gap-3">
                  <Magnetic>
                    <a
                      href="https://github.com/CyberElias-TechPros/web-tools"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn btn-primary btn-lg"
                    >
                      View source <ArrowUpRight size={16} aria-hidden />
                    </a>
                  </Magnetic>
                  <Link to="/about" className="btn btn-lg">
                    How it is built
                  </Link>
                </div>
              </div>
            </Reveal>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function MarqueeItem({ tool }: { tool: Tool }): React.ReactElement {
  const hue = CATEGORIES[tool.category].hue;
  return (
    <span className="muted flex items-center gap-2 text-sm whitespace-nowrap" aria-hidden>
      <tool.icon size={14} style={{ color: `oklch(0.78 0.15 ${hue})` }} />
      {tool.name}
      <span className="mx-2 h-1 w-1 rounded-full" style={{ background: 'var(--line-strong)' }} />
    </span>
  );
}

function Chapter({ category, index }: { category: ToolCategory; index: number }): React.ReactElement {
  const info = CATEGORIES[category];
  const tools = TOOLS.filter((t) => t.category === category);
  const Icon = CATEGORY_ICONS[category];
  const tint = `oklch(0.78 0.15 ${info.hue})`;

  return (
    <section id={category} className="scroll-mt-24" aria-labelledby={`cat-${category}`}>
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="font-display text-5xl italic leading-none sm:text-6xl" style={{ color: tint }} aria-hidden>
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <h2 id={`cat-${category}`} className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <Icon size={22} style={{ color: tint }} aria-hidden />
              {info.label}
            </h2>
            <p className="muted mt-1 max-w-xl text-sm sm:text-base">{info.description}</p>
          </div>
        </div>
        <span className="chip font-mono">{tools.length} tools</span>
      </Reveal>
      <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" amount={0.05}>
        {tools.map((tool) => (
          <StaggerItem key={tool.slug} as="li">
            <ToolCard tool={tool} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

function ToolCard({ tool }: { tool: Tool }): React.ReactElement {
  const Icon = tool.icon;
  const hue = CATEGORIES[tool.category].hue;
  const featured = FEATURED.includes(tool.slug);
  return (
    <Spotlight className="card group h-full transition-transform duration-300 will-change-transform hover:-translate-y-1">
      <Link to={`/tools/${tool.slug}`} className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
            style={{
              background: `oklch(0.78 0.15 ${hue} / 0.14)`,
              color: `oklch(0.78 0.15 ${hue})`,
              boxShadow: `inset 0 1px 0 oklch(1 0 0 / 0.08), 0 8px 20px -12px oklch(0.78 0.15 ${hue})`,
            }}
            aria-hidden
          >
            <Icon size={19} />
          </span>
          <span className="flex items-center gap-2">
            {featured && (
              <span className="chip !py-0 !text-[0.6rem] tracking-wide uppercase" style={{ color: 'var(--accent)' }}>
                Popular
              </span>
            )}
            <ArrowUpRight size={16} className="muted mt-0.5 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </span>
        </div>
        <h3 className="text-[0.95rem] leading-tight font-semibold">{tool.name}</h3>
        <p className="muted text-xs leading-relaxed">{tool.tagline}</p>
      </Link>
    </Spotlight>
  );
}

/** Decorative floating composition on the hero. */
function HeroStage(): React.ReactElement {
  return (
    <div className="relative hidden h-[30rem] lg:block" aria-hidden>
      <div
        className="absolute inset-0 rounded-[2rem] opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(60% 60% at 60% 40%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)' }}
      />
      <Tilt max={6} className="absolute inset-0">
        <m.div
          className="card glass absolute top-8 left-6 w-72 p-4"
          initial={{ opacity: 0, y: 40, rotate: -4 }}
          animate={{ opacity: 1, y: 0, rotate: -3 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow">Word → PDF</p>
          <div className="mt-3 space-y-2">
            {['Q3-report.docx', 'appendix.docx', 'cover-letter.docx'].map((name, i) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="grid h-6 w-6 place-items-center rounded-md surface-3 font-mono text-[0.55rem]">DOC</span>
                <span className="flex-1 truncate">{name}</span>
                <m.span
                  className="h-1.5 rounded-full"
                  style={{ background: 'var(--ok)' }}
                  initial={{ width: 0 }}
                  animate={{ width: 28 }}
                  transition={{ duration: 1.2, delay: 1 + i * 0.3, ease: 'easeOut' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
            <span className="muted">14 pages · 1 file</span>
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>
              combined.pdf
            </span>
          </div>
        </m.div>

        <m.div
          className="card glass animate-float absolute top-2 right-4 w-56 p-4"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow">Palette</p>
          <div className="mt-3 flex gap-1.5">
            {[60, 30, 200, 250, 300].map((h) => (
              <span key={h} className="h-10 flex-1 rounded-md" style={{ background: `oklch(0.72 0.16 ${h})` }} />
            ))}
          </div>
          <p className="muted mt-2 font-mono text-[0.65rem]">oklch(0.72 0.16 200)</p>
        </m.div>

        <m.div
          className="card glass absolute right-10 bottom-16 w-64 p-4"
          initial={{ opacity: 0, y: 40, rotate: 3 }}
          animate={{ opacity: 1, y: 0, rotate: 2 }}
          transition={{ duration: 1, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow">SHA-256</p>
          <p className="mt-2 font-mono text-[0.65rem] leading-relaxed break-all" style={{ color: 'var(--accent-2)' }}>
            9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--ok)' }}>
            <ShieldCheck size={13} /> matches published checksum
          </div>
        </m.div>

        <m.div
          className="card glass absolute bottom-4 left-16 grid h-28 w-28 grid-cols-7 gap-[2px] p-2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 1.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {QR_BITS.map((bit, i) => (
            <span key={i} className="rounded-[1px]" style={{ background: bit ? 'var(--text)' : 'transparent' }} />
          ))}
        </m.div>
      </Tilt>
    </div>
  );
}

const QR_BITS = [
  1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1,
  1, 1, 1, 0, 1, 1, 1,
];
