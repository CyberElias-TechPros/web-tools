import { ShieldCheck } from 'lucide-react';
import { useDocumentMeta } from '@/components/meta';

export default function PrivacyPage(): React.ReactElement {
  useDocumentMeta({
    title: 'Privacy',
    description:
      'Web Tools has no backend, no accounts and no analytics. Every tool processes your data locally in your browser and nothing is ever transmitted.',
    path: '/privacy',
  });

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <div
        className="mb-6 flex items-center gap-3 rounded-xl border p-4"
        style={{
          borderColor: 'color-mix(in oklab, var(--ok) 40%, transparent)',
          background: 'color-mix(in oklab, var(--ok) 10%, transparent)',
        }}
      >
        <ShieldCheck size={22} style={{ color: 'var(--ok)' }} aria-hidden />
        <p className="text-sm font-medium">
          No data you enter into these tools is ever transmitted, stored or seen by anyone but you.
        </p>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p className="muted mt-2 text-sm">
        This page describes exactly how the application behaves. It is short because the
        architecture makes most privacy questions unanswerable in the first place.
      </p>

      <section className="mt-8 space-y-5 text-sm leading-relaxed">
        <div>
          <h2 className="text-base font-semibold">There is no backend</h2>
          <p className="muted mt-1">
            Web Tools is a static site. It consists of HTML, CSS and JavaScript files served from a
            CDN. There is no application server, no database and no API. Every conversion,
            compression, diff and generation runs inside your browser tab using standard web
            platform APIs.
          </p>
          <p className="muted mt-2">
            This is not a policy promise — it is a structural fact. There is nowhere for your data
            to be sent, because no endpoint exists to receive it.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">Your files are never uploaded</h2>
          <p className="muted mt-1">
            When you drop images into the compressor or files into the renamer, they are read with
            the browser&rsquo;s <code className="chip font-mono">File</code> API and processed in
            memory. Images are decoded and re-encoded with{' '}
            <code className="chip font-mono">canvas</code>. ZIP archives are built in JavaScript and
            handed to the browser as a download. No network request carries your content.
          </p>
          <p className="muted mt-2">
            You can verify this: open your browser&rsquo;s developer tools, switch to the Network
            tab, and use any tool. You will see no outbound requests beyond the initial page load.
            Or disconnect from the internet entirely — everything still works.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">No analytics, no cookies, no tracking</h2>
          <p className="muted mt-1">
            There are no analytics scripts, no tag managers, no advertising pixels, no session
            recording and no A/B testing. The application sets no cookies, so there is no cookie
            banner to dismiss.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">What is stored on your device</h2>
          <p className="muted mt-1">
            A small amount of state is saved in your browser&rsquo;s{' '}
            <code className="chip font-mono">localStorage</code> so the app remembers your
            preferences between visits:
          </p>
          <ul className="muted mt-2 list-disc space-y-1 pl-5">
            <li>Your light/dark theme choice.</li>
            <li>Per-tool option settings, such as your preferred image format or CSV delimiter.</li>
            <li>
              The list of time zones you added to the meeting planner, so you do not have to rebuild
              it each time.
            </li>
          </ul>
          <p className="muted mt-2">
            This data stays on your device and is readable only by this site. Generated passwords,
            file contents and text you paste are <strong>never</strong> persisted. Clearing your
            browser&rsquo;s site data removes everything.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">Generated passwords</h2>
          <p className="muted mt-1">
            Passwords and passphrases are generated with the{' '}
            <code className="chip font-mono">crypto.getRandomValues</code> CSPRNG built into your
            browser. They exist only in the memory of the current tab, are never written to storage,
            and are discarded when you close or reload the page. If the browser cannot provide a
            secure random source, generation fails with an error rather than quietly falling back to{' '}
            <code className="chip font-mono">Math.random</code>.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">Third parties</h2>
          <p className="muted mt-1">
            The site loads no third-party scripts, fonts or resources at runtime. Fonts are the ones
            already on your system. The only external party involved is the static host that serves
            the files, which will see standard web server request logs (IP address, user agent,
            requested path) for the page load itself — the same as any website.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold">Source code</h2>
          <p className="muted mt-1">
            The complete source is public. Every claim on this page can be checked by reading it, or
            by building and hosting the app yourself.
          </p>
        </div>
      </section>
    </article>
  );
}
