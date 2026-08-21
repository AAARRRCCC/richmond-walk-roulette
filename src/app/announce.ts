/**
 * The one line a screen reader gets for a result.
 *
 * Every v0.5 feature independently decided it needed to say something when a
 * spin lands, and every one of them independently refused to add a second live
 * region — which is right, because five things announcing at once is worse than
 * one long sentence. That leaves one function that has to take a clause from
 * each of them, and ten positional parameters is not a function.
 *
 * So it takes an array. App builds it in a fixed order and each feature appends
 * exactly one string it has already produced, tested, for the visible card. The
 * announcement therefore cannot drift from what is on screen: they are the same
 * strings.
 *
 * The order App builds them in, once every chunk has landed: tier, duration and
 * distance, the two walks, climb, light, hours, conditions, pool verdict,
 * shared-arrival prefix.
 *
 * Be honest about what this becomes: a reader landing a spin in August at dusk
 * with filters on will hear eight clauses, nine in a two-person session. That is
 * the price of refusing a second live region. It is still the right trade, and
 * somebody should listen to the worst case out loud before v0.5 ships.
 */
import { formatMiles, formatMinutes } from "../lib/format.ts";
import type { WalkingRoute } from "../lib/route.ts";

/** Empty clauses are dropped, so a feature that has nothing to say costs nothing. */
export function describeResult(clauses: readonly string[]): string {
  const said = clauses.filter((clause) => clause !== "");
  if (said.length === 0) return "";
  return `${said.join(", ")}.`;
}

/**
 * How long the walk is and how far, or why neither is known.
 *
 * Lives here rather than in `ResultCard` because it is the second and third
 * clauses of the sentence above, and a component composing copy is how the card
 * and the announcement drift apart. A failed route composes a clause rather than
 * withholding one: a skeleton means "still coming", and once the attempts are
 * spent that is a lie.
 */
export function walkClauses(
  route: WalkingRoute | null,
  routeFailed: boolean,
  roundTrip: boolean,
): string[] {
  if (route === null) return [routeFailed ? "walk time unavailable" : "no walking route"];
  const seconds = roundTrip ? route.durationSeconds * 2 : route.durationSeconds;
  const meters = roundTrip ? route.distanceMeters * 2 : route.distanceMeters;
  return [
    `${formatMinutes(seconds)} ${roundTrip ? "out and back" : "on foot"}`,
    formatMiles(meters),
  ];
}
