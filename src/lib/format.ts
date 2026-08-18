const MILES_PER_METER = 1 / 1609.344;

export function formatMiles(meters: number): string {
  const miles = meters * MILES_PER_METER;
  return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * Reachable area in square miles. Square kilometres would be the tidier unit,
 * but every other number on this screen is imperial and mixing them is worse
 * than being slightly gauche.
 */
export function formatArea(sqMeters: number): string {
  const sqMiles = sqMeters / 2_589_988;
  if (sqMiles < 0.1) return `${sqMiles.toFixed(2)} sq mi`;
  return `${sqMiles.toFixed(1)} sq mi`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
