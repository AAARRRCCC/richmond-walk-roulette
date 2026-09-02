/**
 * What a share link should say when a message app unfurls it.
 *
 * Pure, shared by the server and its tests. Crawlers do not run JavaScript,
 * so per-spin meta is written server-side; the image is the same baked
 * `og.png` for every share.
 */
import { PLACES, PRESET_ORIGINS } from "../src/data/places.ts";
import {
  ROOM_LINK_TITLE,
  SHARE_PATH,
  canonicalQuery,
  decodeShare,
  describeRoom,
  describeShare,
} from "../src/app/share.ts";

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
 * build can name. Null is not a failure: the document is served untouched and
 * the unfurl is the site's own generic card.
 */
export function shareMeta(search: string, siteOrigin: string): ShareMeta | null {
  const link = decodeShare(search);

  // A room link's whole content is a question, and it names nobody.
  if (link.room !== null) {
    return {
      title: `${ROOM_LINK_TITLE} | Walk Roulette`,
      description: describeRoom(),
      url: `${siteOrigin}${SHARE_PATH}?${canonicalQuery(link)}`,
      image: `${siteOrigin}/og.png`,
    };
  }

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
 * cached: a dropped pin (unbounded key space) and a room pointer (minted per
 * room, never repeated, and rendered from constants anyway).
 *
 * The whole canonical query is the key, so two spins that differ only in a
 * filter are two documents. `/__share/` keeps the keys off any real path.
 */
export function shareCacheKey(search: string): string | null {
  const link = decodeShare(search);
  if (link.room !== null) return null;
  if (link.origin === null || link.origin.kind === "pin") return null;
  if (link.placeId === null) return null;
  return `/__share/${SHARE_CACHE_VERSION}?${canonicalQuery(link)}`;
}
