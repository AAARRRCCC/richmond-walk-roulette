import type { LngLat } from "./geo";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export type WalkingRoute = {
  /** [lng, lat] pairs along the walking path. */
  coords: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

// Bounded LRU cache for fetched walking routes. Map iteration order is
// insertion order, so on overflow we delete the first key (the oldest).
// 50 is plenty for a single session: ~34 POIs × a handful of distinct
// starts per visit, hits the steady state quickly.
const CACHE_LIMIT = 50;
const cache = new Map<string, WalkingRoute>();

function cacheKey(origin: LngLat, destination: LngLat): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
}

function cachePut(key: string, value: WalkingRoute): void {
  // LRU: bump the entry to most-recent by re-inserting at the end.
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function cacheGet(key: string): WalkingRoute | undefined {
  const hit = cache.get(key);
  if (hit) {
    // Touch on read so a frequently-used route doesn't get evicted.
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function getApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}

/**
 * Fetch a walking route from Google Routes API. Returns null if not configured
 * or on any failure — caller should fall back to a stylized line.
 */
export async function fetchWalkingRoute(
  origin: LngLat,
  destination: LngLat,
): Promise<WalkingRoute | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const key = cacheKey(origin, destination);
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const res = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: origin.lat, longitude: origin.lng },
          },
        },
        destination: {
          location: {
            latLng: { latitude: destination.lat, longitude: destination.lng },
          },
        },
        travelMode: "WALK",
        polylineQuality: "HIGH_QUALITY",
        polylineEncoding: "ENCODED_POLYLINE",
      }),
    });

    if (!res.ok) {
      console.warn(
        "[walk-roulette] Routes API request failed:",
        res.status,
        await res.text().catch(() => "<no body>"),
      );
      return null;
    }

    const data = (await res.json()) as RoutesApiResponse;
    const route = data.routes?.[0];
    const encoded = route?.polyline?.encodedPolyline;
    if (!route || !encoded) return null;

    const coords = decodePolyline(encoded);
    const result: WalkingRoute = {
      coords: coords.map(({ lng, lat }) => [lng, lat] as [number, number]),
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: parseDurationSeconds(route.duration),
    };
    cachePut(key, result);
    return result;
  } catch (err) {
    console.warn("[walk-roulette] Routes API request errored:", err);
    return null;
  }
}

type RoutesApiResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
  }>;
};

function parseDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0;
  const trimmed = duration.endsWith("s") ? duration.slice(0, -1) : duration;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : 0;
}

// Google Encoded Polyline Algorithm Format
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
function decodePolyline(encoded: string): LngLat[] {
  const coords: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coords;
}
