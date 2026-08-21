/**
 * What a share link should say when a message app unfurls it.
 *
 * Pure, and shared by the Worker and its tests. Nothing in `src/` imports it, so
 * it costs the client nothing: it is the half of `/s` that can be tested without
 * `HTMLRewriter`, which is the half worth testing.
 *
 * Crawlers do not run JavaScript, so per-spin meta has to be written
 * server-side. The *image* is deliberately the same baked `og.png` for every
 * share - runtime rasterising does not fit the Workers Free plan's 10 ms of CPU
 * per request, and build-time per-place PNGs would be ~3 MB in git for a still
 * that still could not show the minutes, the origin or the contours. Only the
 * headline and the description are per-spin, and that is a decision rather than
 * an oversight.
 */
import { PLACES, PRESET_ORIGINS } from "../src/data/places.ts";
import { SHARE_PATH, canonicalQuery, decodeShare, describeShare } from "../src/app/share.ts";

/** The four strings the Worker writes into the document head. */
export type ShareMeta = {
  title: string;
  description: string;
  /** Absolute. */
  url: string;
  /** Absolute. */
  image: string;
};

/**
 * Bumped when the meaning of a cached share document changes for a reason the
 * key cannot see - a copy change, a new rewritten tag.
 */
export const SHARE_CACHE_VERSION = "v1";

/**
 * Meta for a share query, or null when the link does not describe a walk this
 * build can name.
 *
 * Null is not a failure: the Worker then serves the document untouched and the
 * unfurl is the site's own generic card, which is the right answer for a link
 * naming a place that no longer exists.
 */
export function shareMeta(search: string, siteOrigin: string): ShareMeta | null {
  const link = decodeShare(search);

  const place = link.placeId === null ? undefined : PLACES.find((row) => row.id === link.placeId);
  if (place === undefined) return null;
  if (link.budgetMinutes === null) return null;

  // Bound to a local so the narrowing survives into the closure.
  const from = link.origin;
  const originName =
    from === null
      ? null
      : from.kind === "preset"
        ? (PRESET_ORIGINS.find((preset) => preset.id === from.id)?.name ?? null)
        : "a dropped pin";
  if (originName === null) return null;

  // No clamping here: `decodeShare` range-checked the budget at the boundary, so
  // by the time it reaches this function it is a number the dial could hold.
  const description = describeShare({
    placeName: place.name,
    originName,
    walkMinutes: link.budgetMinutes,
    roundTrip: link.roundTrip ?? true,
  });

  return {
    title: `${place.name} — inside ${link.budgetMinutes} min`,
    description,
    url: `${siteOrigin}${SHARE_PATH}?${canonicalQuery(link)}`,
    image: `${siteOrigin}/og.png`,
  };
}

/**
 * The canonical cache path for a share request, or null when it must not be
 * cached at all.
 *
 * It carries the **whole** canonical query rather than a digest of the fields
 * the sentence happens to use. `ShareMeta.url` is the full link, so two spins
 * that agree on place, origin, minutes and round trip but differ in climb,
 * vibes, kind, edge-only or floor are *different documents*: keying them
 * together would hand the second sender's crawler the first sender's `og:url`
 * and `link[rel=canonical]` - a share link resolving to somebody else's filters,
 * which is worse than a cache miss.
 *
 * **Null for a dropped pin.** Coordinates are the one field with an unbounded
 * value space, so a scraper could otherwise mint entries forever. A pin link is
 * by construction sent by one person, so there is nothing to amortise anyway.
 *
 * The `/__share/` prefix keeps these synthetic keys from colliding with a real
 * `/s` request; nothing ever fetches this path.
 */
export function shareCacheKey(search: string): string | null {
  const link = decodeShare(search);
  if (link.origin === null || link.origin.kind === "pin") return null;
  if (link.placeId === null) return null;
  return `/__share/${SHARE_CACHE_VERSION}?${canonicalQuery(link)}`;
}
