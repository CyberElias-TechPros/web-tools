import { useEffect } from 'react';
import { TOOLS_BY_SLUG } from '@/tools/registry';

const SITE_NAME = 'Web Tools';
const DEFAULT_TITLE = 'Web Tools — 10 fast, private, in-browser utilities';
const DEFAULT_DESCRIPTION =
  'Ten free developer and productivity tools that run entirely in your browser: markdown cleaner, regex tester, JSON formatter, image compressor, CSV/JSON converter, file renamer, timezone planner, SVG generator, text diff and password generator. No uploads, no accounts, no tracking.';

function setMeta(selector: string, attribute: string, value: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    const [, key, val] = /\[(\w+)="([^"]+)"\]/.exec(selector) ?? [];
    if (key && val) element.setAttribute(key, val);
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Per-route document metadata.
 *
 * This is a client-rendered SPA, so these tags are written after hydration.
 * Search engines that execute JavaScript pick them up; the static tags in
 * index.html cover crawlers that do not, and prerendering is documented in the
 * README as the upgrade path if organic search becomes a priority.
 */
export function useDocumentMeta(options: {
  title?: string;
  description?: string;
  path?: string;
}): void {
  const { title, description, path } = options;

  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;
    const desc = description ?? DEFAULT_DESCRIPTION;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', desc);

    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    setMeta('meta[property="og:url"]', 'content', url);
    setCanonical(url);
  }, [title, description, path]);
}

/** Convenience wrapper for tool routes. */
export function useToolMeta(slug: string): void {
  const tool = TOOLS_BY_SLUG[slug];
  useDocumentMeta({
    ...(tool ? { title: tool.name, description: tool.tagline } : {}),
    path: `/tools/${slug}`,
  });
}
