import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';
import { TOOLS_BY_SLUG } from '@/tools/registry';
import { useToolMeta } from '@/components/meta';

interface ToolShellProps {
  slug: string;
  children: ReactNode;
  /** Buttons rendered on the right of the tool header. */
  actions?: ReactNode;
  /** Optional wider content area for tools that need the room. */
  wide?: boolean;
}

export function ToolShell({ slug, children, actions, wide }: ToolShellProps): React.ReactElement {
  const tool = TOOLS_BY_SLUG[slug];
  useToolMeta(slug);

  return (
    <div className={`mx-auto w-full px-3 py-5 sm:px-5 ${wide ? '' : 'max-w-[1400px]'}`}>
      <nav aria-label="Breadcrumb" className="muted mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:underline">
          Tools
        </Link>
        <ChevronRight size={12} aria-hidden />
        <span aria-current="page">{tool?.name ?? slug}</span>
      </nav>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight sm:text-2xl">
            {tool && (
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{
                  background: 'color-mix(in oklab, var(--accent) 18%, transparent)',
                  color: 'var(--accent)',
                }}
                aria-hidden
              >
                <tool.icon size={17} />
              </span>
            )}
            {tool?.name ?? slug}
          </h1>
          {tool && <p className="muted mt-1.5 text-sm leading-relaxed">{tool.problem}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {children}

      <p className="muted mt-6 flex items-center justify-center gap-1.5 text-xs">
        <Lock size={12} aria-hidden />
        Processed locally in your browser — nothing is uploaded.
      </p>
    </div>
  );
}
