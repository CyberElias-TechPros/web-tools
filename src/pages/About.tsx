import { Link } from 'react-router-dom';
import { TOOLS } from '@/tools/registry';
import { useDocumentMeta } from '@/components/meta';

export default function AboutPage(): React.ReactElement {
  useDocumentMeta({
    title: 'About',
    description:
      'How Web Tools is built: a static, dependency-light, fully client-side React application with no backend.',
    path: '/about',
  });

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">About Web Tools</h1>
      <p className="muted mt-2 text-sm leading-relaxed">
        A collection of ten small utilities that each remove one specific, recurring annoyance. They
        are grouped in one place so you can bookmark a single URL instead of ten, and they share a
        consistent interface so learning one teaches you the rest.
      </p>

      <section className="mt-8 space-y-5 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-semibold">Why there is no backend</h2>
          <p className="muted mt-1">
            Each of these ten tools is a pure function: text in, text out; files in, files out. None
            of them needs to remember anything between sessions, none needs an account, and none
            needs data from anyone else. The browser already ships every capability required —{' '}
            <code className="chip font-mono">canvas</code> for image encoding,{' '}
            <code className="chip font-mono">CompressionStream</code> for ZIP deflate,{' '}
            <code className="chip font-mono">Intl</code> for time zones and DST,{' '}
            <code className="chip font-mono">crypto</code> for secure randomness.
          </p>
          <p className="muted mt-2">
            Adding a server would mean uploading your files to process them, which is slower, less
            private and more expensive to run, in exchange for nothing. So the app is deployed as
            static files on a CDN. That also makes it trivially cheap, effectively unable to go
            down, and impossible to breach — there is no database to breach.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">How it is built</h2>
          <ul className="muted mt-2 list-disc space-y-1 pl-5">
            <li>React 19 with TypeScript in strict mode, bundled by Vite.</li>
            <li>Tailwind CSS v4 for styling, with CSS custom properties driving the theme.</li>
            <li>
              Each tool is a lazily-loaded route chunk, so opening the JSON formatter does not
              download the image compressor.
            </li>
            <li>
              All the actual logic lives in plain, dependency-free TypeScript modules under{' '}
              <code className="chip font-mono">src/lib</code>, covered by unit tests.
            </li>
            <li>
              No runtime dependencies beyond React, the router and an icon set. The CSV parser,
              diff algorithm, regex parser, ZIP writer and image pipeline are all first-party code.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <ul className="muted mt-2 space-y-1">
            <li>
              <kbd className="chip font-mono">⌘K</kbd> / <kbd className="chip font-mono">Ctrl K</kbd>{' '}
              — open the tool search
            </li>
            <li>
              <kbd className="chip font-mono">/</kbd> — open the tool search from anywhere
            </li>
            <li>
              <kbd className="chip font-mono">Esc</kbd> — close any dialog
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold">The tools</h2>
          <ul className="mt-2 space-y-2">
            {TOOLS.map((tool) => (
              <li key={tool.slug}>
                <Link to={`/tools/${tool.slug}`} className="link font-medium">
                  {tool.name}
                </Link>
                <span className="muted"> — {tool.tagline}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  );
}
