/**
 * The Node replacement for HTMLRewriter on `/s`: string substitution against
 * the built `index.html`, read once at startup.
 *
 * Seven anchors — the title element, the description meta, four `og:` tags
 * and the canonical link — are verified at boot, so a drifted `index.html`
 * fails the deploy loudly instead of silently un-unfurling every share.
 * (Research ticket #11 weighed the Node HTMLRewriter port, last shipped Feb
 * 2022, and cheerio, more dependency than a repo-owned head needs.)
 *
 * Substitution is tag-level rather than regex-across-the-document: the built
 * head keeps Vite's multi-line formatting, so each anchor is located as a
 * whole `<meta …/>` / `<link …/>` / `<title>…</title>` tag and replaced with
 * a freshly built single-line one. Values are HTML-escaped — the canonical
 * URL embeds `&`.
 */
import type { ShareMeta } from "./share-meta.ts";

/** The anchors `/s` rewrites. Names appear in the boot failure message. */
const ANCHORS = [
  "title",
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'link[rel="canonical"]',
] as const;

type Anchor = (typeof ANCHORS)[number];

/**
 * Finds the whole tag carrying `attr="value"`, across the newlines Vite
 * leaves inside a long tag. `[^>]*` cannot cross into the next tag because
 * `>` ends every one, so an anchor that matches is exactly one element.
 *
 * `og:image` needs the closing quote in the pattern or it would also match
 * `og:image:width`; putting the full quoted value in every pattern buys the
 * same precision everywhere.
 */
function tagPattern(anchor: Anchor): RegExp {
  if (anchor === "title") return /<title>[^<]*<\/title>/;
  const [element, rest] = anchor.split("[", 2);
  const attribute = (rest ?? "").replace(/\]$/, "").replace(/"/g, "");
  const [name, value] = attribute.split("=", 2);
  return new RegExp(`<${element}[^>]*\\s${name}\\s*=\\s*"${value}"[^>]*>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The anchors the document is missing, by name. Empty means the document can
 * carry a share head; anything else is a boot failure, and the caller throws
 * with the list so the fix names itself.
 */
export function missingAnchors(html: string): string[] {
  return ANCHORS.filter((anchor) => !tagPattern(anchor).test(html));
}

/**
 * The document with this spin's head written in.
 *
 * Callers verify the anchors at boot, so a non-matching document here is a
 * programming error rather than a runtime state; the substitution still
 * degrades to the untouched tag rather than throwing mid-request.
 */
export function injectMeta(html: string, meta: ShareMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = escapeHtml(meta.url);
  const image = escapeHtml(meta.image);

  const replacements: [Anchor, string][] = [
    ["title", `<title>${title}</title>`],
    ['meta[name="description"]', `<meta name="description" content="${description}" />`],
    ['meta[property="og:title"]', `<meta property="og:title" content="${title}" />`],
    [
      'meta[property="og:description"]',
      `<meta property="og:description" content="${description}" />`,
    ],
    ['meta[property="og:url"]', `<meta property="og:url" content="${url}" />`],
    ['meta[property="og:image"]', `<meta property="og:image" content="${image}" />`],
    ['link[rel="canonical"]', `<link rel="canonical" href="${url}" />`],
  ];

  let out = html;
  for (const [anchor, tag] of replacements) {
    out = out.replace(tagPattern(anchor), tag);
  }
  return out;
}
