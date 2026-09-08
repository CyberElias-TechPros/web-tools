# Web Tools

Ten fast, private, in-browser utilities — no uploads, no accounts, no tracking, no backend.

Every tool is a pure client-side computation. Your text, JSON, spreadsheets, images and
filenames never leave the tab they were pasted into.

| # | Tool | Route | What it does |
|---|------|-------|--------------|
| 1 | Markdown → Clean Text | `/tools/markdown-to-text` | Strips Markdown to readable prose with per-feature control (links, tables, code, footnotes, smart punctuation) plus live text statistics. |
| 2 | Regex Visualizer & Tester | `/tools/regex-tester` | Parses a pattern into an AST, explains it in English, lints it for catastrophic backtracking, highlights matches, and previews replacements. |
| 3 | JSON Validator & Formatter | `/tools/json-formatter` | Hand-written parser with line/column errors and repair hints, a one-click repairer for trailing commas / single quotes / comments / Python literals, pretty-printing, key sorting, flattening and a mini-JSONPath query box. |
| 4 | Bulk Image Compressor & Resizer | `/tools/image-compressor` | Canvas-based batch compression to JPEG/WebP/PNG with five resize modes, an optional target file size (binary search on quality), before/after comparison and ZIP download. |
| 5 | CSV ↔ JSON Converter | `/tools/csv-json` | RFC 4180 parser with delimiter detection, quoted fields, type inference, nested-object flattening, and CSV formula-injection protection on the way out. |
| 6 | File Extension Renamer | `/tools/file-renamer` | Batch rename preview with find/replace, regex, case conversion, slugify, prefix/suffix, sequence numbering, extension presets, collision detection, and three apply paths (ZIP, TSV mapping, `mv -n` script). |
| 7 | Time Zone Meeting Planner | `/tools/timezone-planner` | Scores every slot in a day across any number of IANA zones against working hours, handles DST and half/quarter-hour offsets, and exports `.ics` or shareable text. |
| 8 | SVG Wave & Blob Generator | `/tools/svg-generator` | Seeded, reproducible wave and blob paths with gradients and layering; exports SVG, CSS `background-image`, JSX or a data URI. |
| 9 | Smart Text Diff | `/tools/text-diff` | Myers diff at line, word or character granularity, with whitespace/case/punctuation normalisation, side-by-side or inline view, and unified-diff export. |
| 10 | Password & Passphrase Generator | `/tools/password-generator` | CSPRNG-only passwords, passphrases (2,515-word list) and PINs, with a real entropy model, pattern-aware strength assessment and crack-time estimates. |

---

## Architecture

**This project is a single static frontend. There is deliberately no backend.**

Every one of the ten tools is a pure function of its input:

* nothing is persisted anywhere but the user's own `localStorage`,
* there is no user identity, so there is nothing to authenticate,
* there is no shared or multi-user state, so there is nothing to store,
* there is no third-party API to proxy, so there is nothing to keep a secret for.

Adding a database, an auth provider or an edge worker would add attack surface, latency,
cost and operational burden while removing the product's single most valuable property —
that your data physically cannot leave your device. The correct architecture for this
product is a static bundle on a CDN, and that is what it is.

```
index.html            pre-paint theme script, SEO/OG/JSON-LD metadata
  └── src/main.tsx    StrictMode → BrowserRouter → ThemeProvider → App
        └── App.tsx   routes; every tool is React.lazy + Suspense
              ├── components/   Layout (header, sidebar, ⌘K palette, footer),
              │                 ToolShell, ErrorBoundary, ThemeProvider, ui.tsx primitives
              ├── pages/        Home, About, Privacy, NotFound
              ├── tools/        registry.ts + one folder per tool
              ├── hooks/        useLocalStorage, useDebounced, useCopy,
              │                 useDropZone, useHotkey, useMediaQuery
              └── lib/          13 dependency-free modules — all the actual logic
```

The `src/lib/` layer contains no React and no DOM-framework code, which is why it can be
tested exhaustively in isolation. It is also, deliberately, dependency-free:

| Module | Instead of a dependency |
|--------|-------------------------|
| `zip.ts` | A ~200-line ZIP writer using the platform `CompressionStream('deflate-raw')`, with a STORE fallback — not JSZip. |
| `diff.ts` | Myers O(ND) diff with an edit-distance ceiling — not `diff` or `jsdiff`. |
| `regex.ts` | A recursive-descent regex parser producing a span-annotated AST — not `regexpp` + `regexp-tree`. |
| `csv.ts` | A streaming-style RFC 4180 parser — not PapaParse. |
| `timezone.ts` | `Intl.DateTimeFormat` offset probing — not moment-timezone or date-fns-tz. |
| `image.ts` | `createImageBitmap` + canvas + `toBlob` — not browser-image-compression. |
| `password.ts` | `crypto.getRandomValues` with rejection sampling — never `Math.random`. |

Runtime dependencies: `react`, `react-dom`, `react-router-dom`, `lucide-react`. That is all.

---

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173
```

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server with HMR. |
| `npm run build` | Type-check the whole project, then produce `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the full Vitest suite once. |
| `npm run test:watch` | Watch mode. |
| `npm run test:coverage` | Suite + V8 coverage of `src/lib/**`. |
| `npm run typecheck` | `tsc -b --noEmit`. |
| `npm run lint` | ESLint with type-aware rules. |

Requires Node 20.19+ (Vite 8).

---

## Testing

The suite is 552 tests across 14 files:

* **Unit tests** for all thirteen `src/lib/` modules — parser edge cases, hostile input,
  RFC conformance (CRC-32 vectors, ZIP local headers, iCalendar line folding), DST and
  half-hour time zones, formula-injection escaping, path traversal, and CSPRNG behaviour.
* **Integration tests** (`src/app.test.tsx`) that mount the real router and assert every
  route renders, every lazy chunk loads, the 404 path works, and the ⌘K palette filters,
  navigates and closes.
* **Structural accessibility tests** (`src/a11y.test.tsx`) that render all thirteen routes
  and assert each has exactly one `<h1>`, never skips a heading level, gives every button,
  link and form control an accessible name, hides decorative SVG from assistive technology,
  and sets a document title and meta description.
* **Interaction tests** (`src/tools/tools.test.tsx`) that drive five tools through
  `@testing-library/user-event` — typing Markdown and reading the converted output,
  triggering and repairing a JSON syntax error, diffing two texts, regenerating a password,
  and converting CSV to JSON.

Coverage of `src/lib/` is 87.6% of statements. The gap is concentrated in `image.ts`
(33%), whose core is `createImageBitmap` + `<canvas>.toBlob` — neither is implemented in
jsdom, so its pixel pipeline is verified in a real browser rather than faked with mocks.
Its pure helpers (`computeTargetSize`, `resolveOutputType`, `formatBytes`, `savingsPercent`)
are fully covered.

---

## Deploying to Vercel

The repository is Vercel-ready; `vercel.json` sets the framework, the SPA rewrite and all
response headers.

**Via the dashboard**

1. Import the Git repository at <https://vercel.com/new>.
2. Framework preset: **Vite** (detected automatically).
3. Build command `npm run build`, output directory `dist`, install command `npm ci` — all
   already declared in `vercel.json`.
4. No environment variables are required. There are none.
5. Deploy.

**Via the CLI**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

**After the first deploy**, replace the placeholder origin `https://web-tools.vercel.app`
with your real domain in three places, so canonical URLs and social previews are correct:

* `index.html` — `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, JSON-LD `url`
* `public/robots.txt` — the `Sitemap:` line
* `public/sitemap.xml` — every `<loc>`

`vercel.json` handles the two things a static SPA always gets wrong:

* **Deep links.** Every path that is not a real file rewrites to `/index.html`, so
  `/tools/json-formatter` returns 200 on a cold load instead of 404. The rewrite pattern
  explicitly excludes `assets/`, the icons, `og.png`, `manifest.webmanifest`, `robots.txt`
  and `sitemap.xml` so those keep their own content types and cache headers.
* **Caching.** Content-hashed files under `/assets/` get `immutable, max-age=31536000`;
  `index.html` gets `must-revalidate`, so a new deploy is picked up on the next navigation.

### Cloudflare

None of Cloudflare's compute or storage products (Workers, D1, R2, KV, Durable Objects,
Queues, Cron Triggers) are used, because none of them have anything to do here — see
*Architecture* above. If the domain is proxied through Cloudflare DNS in front of Vercel,
nothing in this repository needs to change.

---

## Security

* **No network egress.** No `fetch`, no `XMLHttpRequest`, no WebSocket, no analytics, no
  fonts or scripts from a CDN. The Content-Security-Policy pins `connect-src` to `'self'`,
  so any accidental future call to a third party fails loudly in the browser.
* **CSP**: `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `upgrade-insecure-requests`. `'unsafe-inline'` is required for
  styles (Tailwind emits inline style attributes) and for the pre-paint theme script.
* **No `dangerouslySetInnerHTML` anywhere.** The SVG generator and the diff viewer both
  build DOM, never HTML strings. Generated SVG is escaped with `escapeXml` before it is
  serialised, so a hostile colour or title cannot inject `<script>`.
* **No `eval`, no `new Function`.** The JSON path query is a hand-written token walker that
  only reads *own* properties, so `constructor` and `__proto__` resolve to nothing.
* **CSV formula injection** is neutralised on export: any field starting with `=`, `+`,
  `-`, `@`, tab or CR is prefixed with `'` so Excel and Sheets treat it as text.
* **Path traversal** is impossible in both file-producing tools. `sanitizeZipPath` strips
  leading slashes, backslashes and `..` segments before a ZIP entry is written;
  `safeFilename` does the same for downloads and additionally rejects Windows device names.
* **Passwords** come only from `crypto.getRandomValues` with rejection sampling to avoid
  modulo bias; the code has no `Math.random` fallback and throws instead of degrading.
* **Denial-of-service ceilings** are explicit rather than implicit: 5,000 regex matches and
  a 750 ms execution budget, an edit-distance ceiling of 4,000 in the diff engine, 100 MB
  per image and 50 megapixels, 25 MB for text file reads, 65,535 ZIP entries.
* **Zero dependency vulnerabilities** at the time of writing (`npm audit`), and only four
  runtime dependencies to keep it that way.

## Accessibility

Semantic landmarks, a skip link, visible focus rings on every interactive element, real
`<label>` associations, `aria-live` regions for copy feedback, toasts and generated secrets, `aria-modal`
dialogs with Escape handling and focus management, keyboard-operable custom controls,
`prefers-reduced-motion` support, and both a light and a dark theme that follow the system
setting until the user overrides them.

## Performance

* Every tool is a separate lazy chunk; the home page loads none of them.
* Initial payload is roughly 100 KB gzipped (React + router + shell + CSS); the largest
  tool chunk is 15 KB gzipped.
* Expensive computations are debounced and memoised; image compression runs **sequentially
  by design** — parallel canvas encodes exhaust memory on mobile Safari and silently
  produce blank output.
* Object URLs are revoked, `ImageBitmap`s are closed, and canvases are released after every
  operation.

## Privacy

There is no analytics, no telemetry, no error reporting service, no cookies and no
fingerprinting. The only thing stored is your own tool preferences, in `localStorage`,
under keys prefixed `wt:`. Clearing site data removes all of it. See `/privacy`.

## Licence

MIT.
