# Hours and seasonality, without hand-maintenance

**Status:** implemented in chunk 9. See *Corrections after implementation* at the end.
**Slug:** opening-hours

## Depends on

- **`daylight-budget`** — for `src/lib/solar.ts` (`SolarEvents`, `solarEvents`, `sunTimes`) and for
  the one clock: `useConditions`, `arrivalMs`, `clockOffsetMs`. Both land in the foundations chunk,
  so the `sun = null` degradation path described below is a fallback that never fires in the v0.5
  build order. `useConditions(origin, frozen)` takes a `frozen` parameter, which replaces this
  spec's private `frozenArrivalRef` latch in App.tsx (`docs/plans/README.md` §2.1).
- **`pool-reasoning`** — `selectCandidates` is deleted. The closed filter is a `PoolRule` with
  `reason: "closed"` and `signature` = the half-hour slot key plus the switch state, not a seventh
  positional argument. `hours-unknown` is **struck from `ExclusionReason`** (§2.3c): this spec
  states plainly that `unknown` is always kept, so the strict mode that would use it is not built
  and a union member no rule ever activates is a dead branch.
- **`places-expansion`** — for `Place.osm` on every generated row and for the shared harvester.
  Running it first means only the 62 hand-curated rows need the manual identity backfill, which is
  the expensive afternoon this spec is honest about.

This is **chunk 9**, the second-to-last. Amendments from `docs/plans/README.md`: the field is
`osm`, not `osmId` (§2.6); `scripts/build-hours.mjs` **stops calling Overpass** and reads
`data/osm/hours.json` written by `scripts/harvest-osm.mjs`, which deletes the keep-the-previous-
table-on-failure machinery outright (§2.6); `check:hours` is **not** added to `npm run lint` and
runs in the scheduled CI job only, because a lint that goes red on a calendar date with no code
change teaches developers to ignore the chain (§2.6); `hideClosed` is **not** reset by
`clearFilters` (§3 — it is a safety default, undone by its own rule's `clear` through
`EmptyPoolNotice`, and this spec's acceptance criterion 12 changes accordingly); and the hours
sentence is a `ResultLine` with `key: "hours"` rather than a `.result-hours` class of its own
(§2.5).

## What and why

The README already confesses this one: "A spin can send you to a closed lot." Both markets are
weekly, the Pump House and the Railroad Museum are seasonal, and nothing on screen says so. The
walk is the point, so being sent forty minutes to a padlocked gate is the single worst thing this
app can do to somebody.

What the user gets: the result card says whether the place is likely to be open **when they get
there** — not now, at the arrival time the route already knows — and closed places are kept out of
the spin pool by default. The line is honest about where it came from: hours off OpenStreetMap read
as hours, a park assumed to close at dusk reads as an assumption, and a place with no schedule at
all says nothing rather than pretending. There is no hours editor, no per-place maintenance, and no
opening-hours library in the browser. A build script pulls `opening_hours` tags from OSM, evaluates
them once with the real parser, and bakes a 336-bit weekly mask per place into a generated module.
The runtime does one array index and one bit test.

What it does not do. Coverage is thin. A research sample put it near 15 of 62 destinations, and
every specific tag value quoted in this document (the Railroad Museum's `Su 01:00-16:00`, VMHC's
five segments, Maymont's "weather permitting") is a **research observation, not a verified fact** —
OSM moved on since, and none of it was re-read against the API for this spec. Nothing depends on
those numbers: the baker prints the real coverage table, and the README sentence is filled in from
that print rather than from this document. What is structural is that most of the list has no
schedule in OSM and will say nothing forever, which is why `unknown` is a first-class state and
never renders as "open". Category fallbacks cover exactly one honest case (a public park closes at
dusk) and refuse the dishonest ones (an untagged museum is not open because most museums are). The
masks are baked for a calendar window and go stale: outside it every answer degrades to `unknown`
rather than quietly reading last year's Thanksgiving. And OSM is sometimes simply wrong, so the
baker gates on the parser's own warnings and drops what it cannot trust.

**Scope, plainly.** The runtime is small. The setup is not: `osmId` has to be filled in by hand for
all 62 existing places, each one a human confirming that this OSM element *is* that destination —
names differ, and there are hours-carrying POIs within 120 m of several entries that a proximity
match would happily steal. Budget that as a real afternoon, not a footnote. Open Question 1 also
blocks the park copy: somebody must read Richmond city code before the assumed-dusk sentence ships.

## The decision

**Bake at build time, ship a static table, never run the evaluator in the browser.**
`opening_hours@3.14.0` is **108 KB minified and gzipped** (110,460 bytes; Bundlephobia,
<https://bundlephobia.com/package/opening_hours@3.14.0>, read 2026-08-21) — 1.7x this app's entire
64 KB app-JS budget for one feature — and is LGPL-3.0-only,
which is a live obligation for a bundled client library and a non-question for a devDependency that
emits data. It goes in `devDependencies` and that boundary is stated in the script's header comment
so nobody crosses it casually later.

**A generated TypeScript module, not `public/hours.json`.** Estimated payload: a covered place is
one 56-character base64 mask plus its id and provenance, so on the order of 700 bytes gzipped at
today's coverage and under 3 KB if all 62 were covered. That is an estimate from the wire format,
not a measurement — nothing has been baked yet. The method for checking it once there is a file:
`gzip -9c src/data/hours.ts | wc -c` for the standalone number, and the build's reported chunk delta
for the number that actually matters, which will be smaller because the app chunk shares a
dictionary. Acceptance criterion 7 tests the chunk delta, not this estimate. A
runtime fetch would buy a third async module cache with its own bump counter in App.tsx, its own
attempt counter in `Session`, and its own loading-vs-failed-vs-absent modelling — all the machinery
of `isochrone.ts` and `route.ts` — to save a kilobyte. Refused. `src/data/hours.ts` is generated,
committed, reviewed in diffs like any other data change, and imported statically.

**Half-hour slots, weekly mask, dated segments.** 7 days x 48 half-hours = 336 bits = 42 bytes = 56
base64 characters. A schedule is a list of `[startDate, mask]` segments, each valid until the next
one begins. Fixed schedules collapse to a single segment for the whole window; the ones with public
holidays and nth-weekday rules cost a handful, and a seasonal place costs one segment per season
boundary (the research sample put the museums at five to eight and Maymont at three — indicative,
not verified). Half an hour is the resolution the source data actually has; minute resolution would be
8x the bytes for precision OSM does not carry.

**Sunrise/sunset is a rule, not a mask.** A `sunrise-sunset` value changes its mask most weeks of
the year, so baking it produces roughly one segment per week — dozens for one place, more bytes
than every fixed schedule combined — and it is year-bound, so it rots annually along with
everything else. Quantising to months trades that for error at the equinoxes on the order of an
hour, which is enough to call a park open after it shut. (Research put those at 35 segments / 329
bytes gzipped and 73 minutes of drift; the exact figures are unverified and the argument does not
turn on them — anyone who wants to reopen this decision should re-derive them.) Rejected both.
Instead the baker emits a `SolarRule`
descriptor (`open: sunrise+0`, `close: sunset+0`, plus a weekday mask) and the runtime resolves it
against the solar module that **`daylight-budget` already ships**. That module is in the bundle
anyway; reusing it costs zero bytes and never goes stale. See the contract below.

**`unknown` is the default and renders as absence.** Anything that filtered the pool on openness
alone would silently delete most of the destinations — everything OSM has no schedule for. `closed` is excluded; `unknown` is always kept
and is never presented as "probably open".

**Category fallbacks are two rules, not a table of guesses.** A public park in Richmond closes at
dusk — that is a city ordinance, not a per-place fact, and it is exactly the case where a guess is
better than silence. Everything else (museums, markets, cemeteries, viewpoints, memorials, plazas)
is `unknown` unless OSM says otherwise. When a fallback speaks, its provenance rides on the verdict
and is shown: "Parks close around dusk — assumed, not from OSM."

**Arrival time, not now.** The evaluator takes an epoch instant and the caller passes arrival — the
route's own duration where the route has settled, the outbound dial budget otherwise. This is the
whole point of the feature.

**One clock, and it is not this module's.** `daylight-budget` establishes `useConditions` (a minute
tick that pauses on `visibilitychange`), `clockOffsetMs`, and `arrivalMs(atMs, outboundSeconds)` in
`src/app/conditions.ts`, explicitly "for `opening-hours`". This spec adds **no timer and no
`Date.now()` in App.tsx**. It reads `conditions.atMs` and calls `arrivalMs`. A second clock would
mean the daylight line and the hours line disagreeing about what time it is, and would ignore
`setClockOffset` the moment `weather-filters` starts correcting the device.

**Richmond wall clock, not device clock.** The masks are baked in `America/New_York` wall time. The
runtime converts through `Intl.DateTimeFormat` with an explicit `timeZone`, so a visitor in Berlin
planning a Richmond walk gets Richmond's answer. `Intl` is free — it is in the platform, not the
bundle.

**Identity comes from a curated `osmId`, never fuzzy name matching.** Verified: hours exist in OSM
under different names for St. John's Church, both farmers markets and the Branch Museum, and there
are POIs *with* hours within 120 m of Tredegar and Shockoe Bottom that a proximity match would
happily steal. An `osmId` per place is a one-time identity mapping, not hours maintenance, and it
is the only reliable join. **Contract with `places-expansion`:** that pipeline already resolves each
proposed place to a concrete OSM element, so it emits `osmId` on every `Place` it appends. This spec
adds the field to the `Place` type and fills it in by hand for the existing 62; whichever spec lands
first owns the field's declaration and the other one uses it as-is.

**Not verified, must be checked first.** Three things research could not settle and an implementer
must confirm before trusting the build:

1. **Whether Richmond's park-hours ordinance is actually dawn-to-dusk**, and with what shoulder.
   The fallback rule's numbers are placeholders (`sunrise-30` to `sunset+30`) until somebody reads
   the city code. If it turns out to be a fixed clock time, the fallback becomes a mask and the
   solar path is used by OSM values alone. Check before shipping the copy that asserts it.
2. **The string-lat/lon trap in `opening_hours.js`.** Research reported that passing numeric
   `lat`/`lon` in the nominatim object makes sunrise/sunset silently resolve to a flat 06:00–18:00
   with no warning. **This has not been re-verified against 3.14.0 and must not be trusted on my
   word.** The design mostly sidesteps it (solar values become rules, not masks), but the baker
   still *evaluates* solar values to validate them, so the assertion in "Algorithm" step 9 is
   mandatory — that assertion *is* the verification, and it is written so that it passes whether or
   not the trap exists and fails only if the flat fallback is what is being measured.
3. **Whether any Richmond value mixes solar and clock times in one rule** (e.g. `Mo-Fr
   sunrise-21:00`). None was observed in the 15 covered places, but the harvest is small. The
   baker's solar grammar is strict and anything outside it becomes `unknown` with a build log line,
   so the failure mode is safe — but somebody should read the log the first time.

## Data and types

### `src/data/hours.ts` (generated — do not edit by hand)

```ts
/** Where a schedule came from. Rendered, not just recorded. */
export type HoursSource = "osm" | "category";

/** Bit 0 = Monday ... bit 6 = Sunday. Matches the mask's day order. */
export type DayMask = number;

/**
 * A schedule expressed relative to the sun. Cannot be baked without either
 * rotting annually or costing 35 segments for one place, so it resolves at
 * runtime against the solar module from `daylight-budget`.
 */
export type SolarRule = {
  days: DayMask;
  open: { ref: "sunrise" | "sunset"; offsetMinutes: number };
  close: { ref: "sunrise" | "sunset"; offsetMinutes: number };
};

/**
 * A weekly opening mask valid from `from` until the next segment's `from`.
 * `mask` is base64 of 42 bytes = 336 bits, one per half hour, Monday 00:00
 * first. Bit set means open.
 */
export type HoursSegment = {
  /** Richmond-local calendar date, "YYYY-MM-DD". */
  from: string;
  mask: string;
};

export type HoursEntry = {
  /** Place id, matching `Place.id` in src/data/places.ts. */
  id: string;
  source: HoursSource;
  /** Set when source is "category": which rule spoke, e.g. "public-park". */
  category?: string;
  /** OSM element the value came from, e.g. "way/12345". Absent for fallbacks. */
  osmId?: string;
  /** The raw opening_hours value, shown in the drawer and used for a fix link. */
  value?: string;
  segments?: HoursSegment[];
  solar?: SolarRule;
  /**
   * A quoted comment on a rule the parser reports as state "unknown", such as
   * Maymont's "weather permitting". Its presence downgrades an open verdict to
   * unknown and supplies the sentence.
   */
  comment?: string;
  /** check_date:opening_hours / check_date / survey:date, "YYYY-MM-DD". */
  checkedAt?: string;
};

export type HoursTable = {
  version: number;
  /** ISO instant the bake ran. */
  bakedAt: string;
  /** Richmond-local dates. Outside this window every verdict is unknown. */
  coversFrom: string;
  coversThrough: string;
  timeZone: "America/New_York";
  slotMinutes: 30;
  entries: readonly HoursEntry[];
};

export const HOURS: HoursTable;
```

`entries` is an array, not a keyed object: the anti-slop plugin bans dictionary types, and the
runtime builds a `Map<string, HoursEntry>` once at module load.

### `src/lib/hours.ts` (runtime evaluator — a lookup, not a parser)

```ts
import type { SolarEvents } from "./solar";   // owned by `daylight-budget`

export type Openness = "open" | "closed" | "unknown";

export type HoursVerdict = {
  state: Openness;
  /** Absent when state is "unknown" for want of any data at all. */
  source?: HoursSource;
  /** Set when source is "category" — the assumption is shown, not hidden. */
  category?: string;
  /**
   * The whole sentence the card renders, already composed: closing time,
   * assumption wording, quoted comment and ", last checked 2021" included.
   * Null means render nothing. Composed here rather than in the component so
   * every string in this feature is asserted by `node --test`, and so there is
   * exactly one place that decides what the user is told.
   */
  note: string | null;
  /** check_date older than STALE_YEARS. The verdict stands; the note says so. */
  stale: boolean;
};

/**
 * Richmond wall-clock parts plus the two things every caller derives from
 * them. Computed once per pool evaluation and threaded, never per place:
 * `hoursClock` is an `Intl.DateTimeFormat.formatToParts` call and
 * `selectCandidates` runs over 62 places on every render by design.
 */
export type HoursClock = {
  year: number;
  month: number;   // 1..12
  day: number;     // 1..31
  /** Minutes since Richmond-local midnight, 0..1439. */
  minutes: number;
  /** 0 = Monday ... 6 = Sunday. Matches the mask's day order. */
  weekdayIndex: number;
  /** "YYYY-MM-DD", Richmond-local. */
  date: string;
  /** 0..335, the mask bit this instant selects. */
  slot: number;
};

/** The window the baked masks are valid for. Passed in, never read off the
 *  generated module, so the tests can state their own window. */
export type HoursCoverage = { from: string; through: string };

export function hoursClock(atMs: number): HoursClock;
export function segmentFor(segments: readonly HoursSegment[], date: string): HoursSegment | null;
export function bitAt(mask: string, slot: number): boolean;
/** Minutes-since-midnight of the first unset bit at or after `slot`, within
 *  the same local day, or null if the day never closes inside it. Feeds the
 *  "— closes 5:00 pm" clause. */
export function nextCloseMinutes(mask: string, slot: number): number | null;
export function solarOpen(rule: SolarRule, clock: HoursClock, sun: SolarEvents | null): Openness;

/** The one entry point. Pure: no module state, no clock, no HOURS read. */
export function evaluateHours(
  entry: HoursEntry | undefined,
  clock: HoursClock,
  sun: SolarEvents | null,
  coverage: HoursCoverage,
): HoursVerdict;

export function hoursFor(placeId: string): HoursEntry | undefined;
/** `HOURS.coversFrom` / `coversThrough`, so App does not reach into the table. */
export const HOURS_COVERAGE: HoursCoverage;
/**
 * The start of the containing half-hour slot, as epoch ms. The pool's arrival
 * instant goes through this so the candidate list changes twice an hour rather
 * than on every minute tick — see App.tsx below for why that matters.
 */
export function quantiseToSlot(atMs: number): number;
export function isOpenEnough(verdict: HoursVerdict): boolean;  // state !== "closed"
```

Everything above except `hoursFor` and `HOURS_COVERAGE` is pure and takes its world as arguments, so
`node --test` drives the whole evaluator from hand-written fixtures with no generated file and no
solar module in the picture. `evaluateHours` imports `formatClock` from `src/lib/format.ts` to build
the closing clause and nothing else.

**Knip.** `hoursFor`, `HOURS_COVERAGE`, `evaluateHours`, `quantiseToSlot` and `isOpenEnough` are
reached from `src/app/App.tsx`; `hoursClock`, `segmentFor`, `bitAt`, `nextCloseMinutes` and
`solarOpen` are reached only from `src/lib/hours.test.ts`, and `src/**/*.test.ts` is **not** a knip
entry (`knip.json` lists only `server/*.test.ts`). Tag those five `/** @public */` or the lint gate
fails — the same trap `daylight-budget` flags for `arrivalMs`.

### Contract with `daylight-budget`

This spec does **not** write solar math and does **not** invent a solar API. It consumes exactly what
`daylight-budget` already specifies in `src/lib/solar.ts`:

```ts
export type SolarEvents = {
  day: string;                    // Richmond-local YYYY-MM-DD
  civilDawnMs: number | null;
  sunriseMs: number | null;
  solarNoonMs: number;
  sunsetMs: number | null;
  civilDuskMs: number | null;
};
export function solarEvents(atMs: number, lat: number, lng: number): SolarEvents;
```

`solarEvents` never returns null; the nulls are per field. So the degradation has three doors, and
all three land on `unknown`:

- **No solar module yet.** App passes `sun = null` literally. Solar places and the park fallback read
  `unknown`; masked places are unaffected. This is the ship-before-`daylight-budget` path.
- **`sunriseMs` or `sunsetMs` is null** (impossible at Richmond's latitude, present because the
  arithmetic is general). `solarOpen` returns `unknown`.
- **`sun.day !== clock.date`.** The caller handed events for a different local day than the arrival
  instant — a real risk, since arrival can cross midnight. `solarOpen` returns `unknown` rather than
  comparing a Tuesday sunset against a Wednesday clock. App's job is to call
  `solarEvents(arrivalMs, ...)`, not `solarEvents(nowMs, ...)`.

Do not write a second sunrise formula. If `daylight-budget` lands after this, wire `null` and open a
follow-up whose whole diff is one argument.

### Contract with `pool-reasoning`

That spec owns counting and explaining why the pool is smaller than the map suggests. This spec
contributes exactly one exclusion reason and expects the union to carry it:

```ts
// owned by pool-reasoning
type PoolReason = ... | "closed";
```

`selectCandidates` gains the `hideClosed`, `clock` and `sun` arguments described above and, in `pool-reasoning`'s reason-collecting variant,
attributes a rejection to `"closed"` when `isOpenEnough` is false and every other filter passed.
The user-facing sentence ("3 closed when you'd arrive") belongs to `pool-reasoning`; the predicate
belongs here. If `pool-reasoning` has not landed, this spec still filters and still shows the count
in the existing empty-pool notice — it just does not get the full explanation surface.

### Overpass request/response (build time only, never from the browser)

Request: `POST https://overpass-api.de/api/interpreter`, body `data=<QL>`, header
`User-Agent: walk-roulette-hours-baker/1.0 (+https://github.com/<owner>/richmond-walk-roulette)`.
The contact is a **committed constant at the top of the script**, not an env var and not a personal
address: the repo URL is a real contact channel, survives a fresh clone, and cannot go missing on
the one machine that runs the bake. An operator who cannot see who is calling is exactly who
rate-limits you. Replace `<owner>` with the real one when the script is written. The query is one
batched element lookup built from the curated ids:

```
[out:json][timeout:180];
(node(id:1,2,3);way(id:4,5);relation(id:6););
out tags;
```

Response is standard Overpass JSON; the baker reads `elements[].tags.opening_hours`,
`elements[].tags["check_date:opening_hours"]`, `check_date`, `survey:date`, and
`osm3s.timestamp_osm_base`, and writes the raw body to `data/osm/hours.json` beside the manifest
`places-expansion` uses. `osm3s.copyright` travels with it; `data/osm/README.md` carries the ODbL
notice.

No new `/api` endpoint. No Worker change. No `wrangler.toml` change. Overpass is touched by a
human-invoked script only, never by the app and never by CI. The public instance's own commons
document lists "setting up an app for more than just OSM mappers and relying on the public instances
as backend" among the behaviours that do not work, concluding that "only running your own instance
sustainably serves your mission"
(<https://dev.overpass-api.de/overpass-doc/en/preface/commons.html>, read 2026-08-21). Discouraged,
not forbidden — but a once-a-year batched request by a person is the shape it is asking for, and a
runtime dependency is not.

## Changes, file by file

**`src/data/places.ts` — modified.** Add `osmId?: string` to `Place` with a comment explaining that
it is an identity mapping, not hours maintenance, and that it is what lets the baker join. Then fill
it in **for all 62 places, by hand, one human confirmation each** — this is the expensive part of the
feature and it is not optional: a place left without an `osmId` can never gain hours, and a place
given the wrong one gains somebody else's. Leave it absent rather than guess. Add
`kind`-style category hints only if `places-expansion` has not already; otherwise the fallback reads
the tags it already has. Update the prose comment that currently ends "nothing on screen now says
so" — it does now.

**`src/data/hours.ts` — new, generated.** Header comment naming the generator and forbidding hand
edits. Exports the types above and `HOURS: HoursTable`. Marked `@public` so knip does not clip the
types the generator alone re-declares.

**`src/lib/hours.ts` — new.** The evaluator listed above, plus `STALE_YEARS = 3` and
`SLOT_MINUTES = 30`. Builds its `Map` once at module scope. Runtime imports: `HOURS` and
`formatClock`. The `SolarEvents` **type** is imported type-only — no runtime import of the solar
module, which stays App.tsx's job to thread in. Five exports carry `/** @public */`, see above.

**`src/lib/hours.test.ts` — new.** See Tests.

**`src/app/session.ts` — modified.** Add `hideClosed: boolean` to `Session` (default `true`) with a
comment on why the default excludes rather than annotates. Add `{ type: "toggleHideClosed" }` to
`Action` and a case to the exhaustive switch. Add `hideClosed: true` to the `clearFilters` reset
alongside terrain/vibes/edgeOnly.

**`src/app/App.tsx` — modified.** No new timer, no `new Date()`, no `Date.now()`. The clock is
`useConditions` (`daylight-budget`); until it lands, one `const nowMs = Date.now()` read per render
is *not* acceptable — implement `useConditions` first or ship this behind `sun = null` with the
arrival derived from `conditions.atMs` once it exists.

- **The pool's arrival instant, quantised, and frozen during a throw:**

  ```ts
  const liveArrivalMs = quantiseToSlot(arrivalMs(conditions.atMs, outboundSeconds));
  // A pool that changed mid-throw would trip the spin-abort effect at
  // App.tsx:357-369 and cancel the spin for no reason the user can see.
  const frozenArrivalRef = useRef(liveArrivalMs);
  if (!state.spinning) frozenArrivalRef.current = liveArrivalMs;
  const poolArrivalMs = frozenArrivalRef.current;
  const poolClock = hoursClock(poolArrivalMs);
  const poolSun = solarEvents(poolArrivalMs, origin.lat, origin.lng);   // or null
  ```

  `quantiseToSlot` is what makes this worth anything: `conditions.atMs` advances every minute, but
  the value above changes twice an hour, so `candidateKey` is stable between slot boundaries. The
  ref freeze covers the remaining case — a boundary crossed mid-throw. Reading a ref during render
  is deliberate and gets a comment; it is a "hold the last value" latch, not derived state.

- `selectCandidates(reach, terrain, vibes, edgeOnly, hideClosed, poolClock, poolSun)`: after the vibe
  test and before the polygon test, when `hideClosed`, reject a place whose verdict is `"closed"`.
  The clock is computed **once by the caller and threaded**, never per place. Arrival for the pool
  uses the outbound dial budget: a per-place route duration is not known for every candidate, and
  using one would make the pool depend on route warming.
- **Pool and card can disagree, and the card wins.** The pool judges at the dial's outbound budget,
  quantised to the half hour. The card judges at the settled route duration, unquantised — a
  different, better number. So a place can survive "Skip closed places" and then land showing
  "Likely closed when you arrive", when the real route is longer than the dial's budget or the
  arrival crosses a closing time inside the same half-hour slot. That is not a bug to hide: the
  filter is a coarse pre-sort over 62 places, the card is the honest answer about the one walk the
  user actually got, and the card must never be silenced to protect the filter's story. It is
  documented in the code comment on `selectCandidates` and covered by acceptance criterion 11.
- The `<Filters>` block (~line 710) gains `hideClosed={state.hideClosed}` and
  `onToggleHideClosed={() => dispatch({ type: "toggleHideClosed" })}`.
- The picked place's verdict uses the *route's* duration when it has settled, the outbound budget
  otherwise: `const cardMs = arrivalMs(conditions.atMs, route?.durationSeconds ?? outboundSeconds)`,
  then `evaluateHours(hoursFor(picked.id), hoursClock(cardMs), solarEvents(cardMs, …), HOURS_COVERAGE)`,
  passed as `<ResultCard hours={verdict} />`.
- `activeFilters` (line 485) is **unchanged**. `hideClosed` defaults on, so counting it would make
  the drawer read "Filters (1 active)" from first paint forever, and counting it only when *off*
  would announce a widened pool as a narrowing. The count answers "why is my pool smaller than I
  expected"; a default-on safety is not an answer to that. The trade is that a user who switches it
  off gets no drawer reminder — accepted, and stated here so nobody re-litigates it in review.
- `describeResult(...)` gains the verdict and appends `verdict.note` when it is non-null, so the one
  `sr-only role="status"` line carries it. Nothing new gets `aria-live`.

**`src/ui/Filters.tsx` — modified.** A third `Switch` in the existing `.switch-row`
(after "Far edge only"): label "Skip closed places", hint "Judged by when you'd arrive".
`playThock(!props.hideClosed)` immediately before the callback, per the house convention.

**`src/ui/ResultCard.tsx` — modified.** One optional row, placed **below `.result-stats`, beside the
two existing `.result-warning` rows** — that is where warnings actually live in this component
today. New prop `hours: HoursVerdict | null`.

The component composes no strings; it chooses a row and prints `hours.note`.

| Verdict | Row |
| --- | --- |
| `note === null` | Nothing. Absence is the answer — no "unknown", no dash. |
| `state === "closed"` | `.result-warning` (existing pattern: `<p>`, `WarningIcon` size 15 weight fill, amber). |
| `state === "open"`, `source === "osm"` | `.result-hours`, no icon. |
| `state === "unknown"` **with** an entry | `.result-hours.is-assumed`, no icon. Reachable three ways this spec creates — a comment downgrade, an out-of-coverage date, a null sun — and each one has a sentence worth reading. |
| `source === "category"` | `.result-hours.is-assumed`, no icon, whatever the state. |

The sentences (all composed in `evaluateHours`, all asserted in tests):

- open, from OSM: `"Open when you arrive"`, plus `" — closes 5:00 pm"` when `nextCloseMinutes` finds
  a close within 120 minutes. The clock string is `formatClock` from `src/lib/format.ts`
  (`daylight-budget` owns that export; whichever spec lands first declares it, exactly as with
  `osmId`).
- closed: `"Likely closed when you arrive."`
- category park: `"Parks close around dusk — assumed, not from OSM."`
- comment downgrade: the quoted comment verbatim, e.g. `"Hours say “weather permitting”."`
- out of coverage: `"Hours data is out of date."`
- stale, appended to any of the above: `", last checked 2021"` (the year of `checkedAt`).

**`src/styles/app.css` — modified.** One new rule beside `.result-warning` (which is at 836-843 and
sets `margin: 0` — a `<p>` that does not would inherit UA margins and break the card's rhythm):

```css
.result-hours {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--ink-2);
}
.result-hours.is-assumed {
  color: var(--ink-3);
}
```

No new tokens, no new hue — amber stays the only accent and the closed case borrows the existing
warning pattern. Be honest about that second rule: `--ink-2` (#93a6b5) and `--ink-3` (#8195a4) are
one step apart and nobody will see the difference. The assumed tier is carried by the **word**
"assumed" in the sentence; the class exists so the tier is expressible later, not because the colour
is doing work today.

**`scripts/build-hours.mjs` — new.** See Algorithm. Follows `build-reach.mjs`: SSR-loads
`src/data/places.ts` through a throwaway Vite server (own `cacheDir: node_modules/.vite-build-hours`)
so ids and `osmId`s cannot drift from a copy, then writes `src/data/hours.ts`. Unlike `build-reach.mjs`
it needs **no running dev server** — it talks to Overpass and to a local library, not to `/api`.

**`scripts/check-hours.mjs` — new.** A cheap staleness gate for CI: reads `HOURS.coversThrough` and
fails if fewer than 60 days remain, printing the rebuild command. Runs in the lint job.

**`package.json` — modified.** `devDependencies: { "opening_hours": "^3.14.0" }`. Scripts:
`"build:hours": "node scripts/build-hours.mjs"`, `"check:hours": "node scripts/check-hours.mjs"`.

**Whether `check:hours` joins the `lint` chain is a real decision, not a detail.** Adding it means
`npm run lint` and CI go red on a calendar date with no code change — every other tool in that chain
(eslint, oxlint, knip) is a pure function of the tree, and a developer who pulls a clean commit and
sees red will not thank you. The argument for doing it anyway: the failure mode this guards is the
app confidently reading last year's Thanksgiving, the fix is one command, and a warning nobody is
obliged to read is how the table rots. The recommendation is to add it, with the failure message
naming `npm run build:hours` and the deadline date, and to accept that this repo now has one
time-dependent lint. If that is unacceptable, the fallback is a separate `npm run check:hours`
called only by the scheduled CI job, which trades the surprise for a slower discovery.

**`.github/workflows/ci.yml` — modified.** Nothing new beyond `npm run lint` picking up
`check:hours`, if the above is accepted. CI never calls Overpass.

**`knip.json` — modified only if needed.** `scripts/*.mjs` is already an entry point; the generated
module is imported by `src/lib/hours.ts`, so no change is expected.

**`README.md` — modified.** Lines 236-238 are the only confession in the repo — "Several places are
seasonal or weekly ... nothing on screen says so. A spin can send you to a closed lot." Replace that
block quote with what now happens, and keep the honesty: the coverage number **as the bake prints
it**, that `unknown` renders as nothing, that the table is baked annually, and where the ODbL notice
lives. (`docs/history/IDEAS.md` has no hours item — nothing to strike there.)

Untouched, deliberately: `server/proxy.ts`, `server/vite-plugin.ts`, `worker/index.ts`,
`wrangler.toml`, `.env.example`, `public/_headers`. This feature adds no runtime traffic at all.

## Algorithm

### Build (`scripts/build-hours.mjs`)

1. SSR-load `PLACES`. Collect every `place.osmId`. If none, exit 0 with a printed warning — an empty
   join is a configuration problem, not a reason to emit an empty table.
2. Read the previous `src/data/hours.ts` if it exists (via `vite.ssrLoadModule`) and keep it as the
   fallback. **A failed harvest must never publish an empty table**: an Overpass outage would
   otherwise ship a build where every destination is unknown.
3. One batched Overpass request for all ids. On any failure — non-200, `remark: rate_limited`,
   timeout, network error — print the reason, keep the previous table, exit **1** so a human notices
   without a bad file landing. On success, write the raw body to `data/osm/hours.json`.
4. For each element, read `opening_hours`. Elements without it fall through to step 8.
5. Construct `new opening_hours(value, nominatim, { mode: 0 })` where `nominatim` is
   `{ lat: String(place.lat), lon: String(place.lng), address: { country_code: "us", state: "Virginia" } }`.
   **The lat/lon must be strings** — see the assertion in step 9.
6. `getWarnings()`. If it returns anything, print the place, the value and every warning, and **drop
   the entry** (it becomes `unknown`) unless `--accept-warnings` is passed. This is the gate that
   stops a typo like `Su 01:00-16:00` — a museum open at one in the morning — from shipping as
   fact. A dropped entry is a build
   warning, not a build failure — one bad OSM value should not block a release.
7. Classify the value:
   - **Solar**: matches the strict grammar below. Emit a `SolarRule`; no segments. Offsets convert
     to minutes (sign, then `hh*60 + mm`).

     ```
     ^(?:<weekday selector> )?<vt>-<vt>$
     where <vt> = (?:sunrise|sunset)|\((?:sunrise|sunset)[+-]\d{2}:\d{2}\)
     ```

     **The parentheses are mandatory and are the whole point of this correction.** The
     `opening_hours` specification defines a variable time as either a bare event *or*
     `( <event> <plus_or_minus> <hour_minutes> )`; a bare `sunrise+01:00` is not valid syntax
     (<https://wiki.openstreetmap.org/wiki/Key:opening_hours/specification>, read 2026-08-21). An
     earlier draft of this spec had the offset outside the parentheses, which would have matched
     nothing but `sunrise-sunset` and quietly degraded every offset schedule in Richmond to
     `unknown` while claiming to handle offsets. Accept both forms; a real value looks like
     `Mo-Su (sunrise+01:00)-(sunset-00:30)`.
   - **Contains a solar token but does not match**: emit no schedule, log it, leave the place
     `unknown`. Honest and loud beats a half-parsed rule.
   - **Otherwise**: bake masks (step 8).
8. Mask baking, per place, over `[coversFrom, coversThrough]`. **The window is pinned to calendar
   boundaries — 1 January of the current year through 31 December of next year — never "today".**
   A window that starts today makes every first segment's `from` move with the bake date, so two
   bakes on different days differ in every entry and acceptance criterion 2 becomes untestable. It
   also costs nothing: the extra past weeks collapse into the first segment for any fixed schedule.
   ```
   segments = []
   for each week W starting on the Monday on or before coversFrom, while W.start <= coversThrough:
     mask = 42 zero bytes
     for slot in 0..335:
       // WALL-CLOCK ARITHMETIC ONLY. new Date(y, m, d + dayOffset, hour, minute).
       // Epoch arithmetic (+ n*86400000) was measured to split every fixed
       // schedule into five spurious segments at the DST boundaries.
       t = wallClockDate(W.start, slot)
       if oh.getState(t) and not oh.getUnknown(t): setBit(mask, slot)
     b64 = base64(mask)
     if segments is empty or last.mask != b64: segments.push({ from: ymd(W.start), mask: b64 })
   ```
   Consecutive identical weeks collapse, which is what turns a fixed schedule into one segment.

   **What the DST weeks actually mean, since a fixed 48-slots-per-day mask has no honest answer for
   four of them a year.** Wall-clock arithmetic fixes segment *splitting* — the reason for the rule
   above — but it does not conjure a 02:00 that does not exist.
   - *Spring forward* (second Sunday in March): slots 02:00 and 02:30 do not occur.
     `new Date(y, m, d, 2, 0)` silently resolves to 03:00, so the baker writes 03:00's answer into
     those two bits. Nothing ever reads them: `Intl` never reports 02:xx on that date, so
     `hoursClock` cannot produce those slot indices. Harmless, and written down here so the next
     person does not spend an afternoon on it.
   - *Fall back* (first Sunday in November): 01:00–01:59 happens twice, EDT then EST. `Intl` reports
     01:xx for both, and the mask holds one bit per slot, so both passes read the same answer. The
     baker's `new Date(y, m, d, 1, 0)` resolves to the **first** (EDT) pass, so that is what is
     written. One hour a year, a verdict can be an hour stale. This is an app about walking to a
     park; it is not worth a second dimension on the mask.

   Neither case is a build failure and neither is logged at runtime.
9. **Two mandatory build-time assertions**, both guarding silent regressions research verified:
   - Bake the literal value `"sunrise-sunset"` at Battery Park's coordinates for 2026-06-15 and
     assert the open interval is **not** exactly 06:00–18:00. That is the numeric-lat/lon fallback,
     and it emits no warning of its own.
   - Bake a known fixed value (`"Tu-Su 10:00-17:00"`) and assert it collapses to exactly **one**
     segment across the window. More than one means epoch arithmetic crept back in.
   Either assertion failing exits 1 before anything is written.
10. Comments: if `oh.getUnknown(t)` is true anywhere in the window and `oh.getComment(t)` returns
    text, store it as `entry.comment`. A value like "weather permitting" is the case this catches.
11. `checkedAt` from `check_date:opening_hours`, else `check_date`, else `survey:date`.
12. Step 8 skipped places (no `opening_hours`) get a **category fallback** if and only if they are a
    public park — `leisure=park|garden|nature_reserve` on the joined element, or, absent a joined
    element, a `Place` tagged `park` and not tagged `museum`. The fallback is a `SolarRule`:
    `days = 0b1111111`, `open = sunrise-30`, `close = sunset+30`, `source: "category"`,
    `category: "public-park"`. **Placeholder offsets — confirm against the city ordinance (Open
    Question 1).** Everything else gets no entry at all.
13. Format and write `src/data/hours.ts`: sorted by id, one entry per line where it fits, with the
    header comment, `bakedAt`, `coversFrom`, `coversThrough`, and a summary comment recording
    coverage ("18 of 62 places, 15 from OSM, 3 from category fallback").
14. Print a coverage table and the count of dropped-on-warning entries.

### Runtime (`src/lib/hours.ts`)

```
hoursClock(atMs):
  parts = Intl.DateTimeFormat("en-US", { timeZone: "America/New_York",
    year, month, day, hour, minute, hour12: false, weekday: "short" }).formatToParts(atMs)
  weekdayIndex = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(parts.weekday)
  -> { year, month, day,
       minutes: hour*60 + minute,
       weekdayIndex,
       date: "YYYY-MM-DD",
       slot: weekdayIndex * 48 + floor(minutes / 30) }
// The formatter is constructed once at module scope. This is the only
// Intl call in the feature and it happens ONCE per pool evaluation, not
// once per place -- see App.tsx.

evaluateHours(entry, clock, sun, coverage):
  if entry is undefined -> { state: "unknown", note: null, stale: false }
  stale = entry.checkedAt is present and older than STALE_YEARS
  if entry.solar:
     state = solarOpen(entry.solar, clock, sun)      // unknown covers every null door
  else if clock.date < coverage.from or clock.date > coverage.through:
     -> { state: "unknown", source, category, stale, note: "Hours data is out of date." + staleClause }
  else:
     seg = segmentFor(entry.segments, clock.date)     // last segment with from <= date
     if seg is null -> state = "unknown"
     else state = bitAt(seg.mask, clock.slot) ? "open" : "closed"
  if state === "open" and entry.comment:
     state = "unknown"; note = quoted comment          // never reported open
  else note = sentence for (state, entry.source, entry.category) per the ResultCard table,
              plus " — closes <formatClock>" when state is "open", source is "osm",
              and nextCloseMinutes(seg.mask, clock.slot) is within 120 minutes,
              plus ", last checked <year>" when stale
```

The coverage window is a **parameter**, not a read of `HOURS`. That is what lets test 13 exist:
a hand-written entry plus a hand-written `{ from, through }` proves the out-of-date path without
depending on a generated table whose window moves every bake. App passes `HOURS_COVERAGE`.

Solar entries deliberately skip the window check — a `SolarRule` is date-independent, so it keeps
working after the masks expire.

`solarOpen(rule, clock, sun)` returns `"unknown"` if `sun` is null, if `sun.day !== clock.date`, or
if `sun.sunriseMs` / `sun.sunsetMs` is null. Otherwise it checks the weekday bit
(`rule.days & (1 << clock.weekdayIndex)`; unset means `"closed"`), converts `sunriseMs` and
`sunsetMs` to Richmond wall-clock minutes with `hoursClock`, adds the offsets, and compares against
`clock.minutes`. A window whose close is before its open (possible with a big negative offset) is
treated as never open and logged once in dev.

`bitAt` decodes lazily: `atob(mask).charCodeAt(slot >> 3) & (1 << (7 - (slot & 7)))`. No allocation
per call beyond the `atob`, which is memoised per mask string in a module `Map`.

`quantiseToSlot(atMs)` returns `atMs - ((atMs - slotOriginMs) mod 1_800_000)` computed from the
Richmond wall clock, i.e. the epoch instant at the start of the containing half hour. Half-hour
offsets exist in other zones but not in America/New_York, so subtracting the local minute-remainder
is exact here; the comment says so rather than pretending it is general. This is the entire
mechanism keeping the candidate pool still between slot boundaries.

## Failure and degradation

| What breaks | What happens |
| --- | --- |
| Overpass down / rate-limited at build | Script exits 1, prints the reason, **keeps the previous `src/data/hours.ts`**. No release ships an empty table. |
| A place has no `osmId` | No entry. `unknown`. Renders as nothing. Build log lists them so the mapping can grow. |
| OSM has the element but no `opening_hours` | Park fallback if it qualifies, otherwise `unknown`. |
| `getWarnings()` fires on a value | Entry dropped, place reads `unknown`, build prints place + value + warnings. Not a build failure. |
| Value uses solar syntax the strict grammar rejects | `unknown`, logged loudly at build. Never half-parsed. |
| `daylight-budget` not implemented (App passes `sun = null`), or `sunriseMs`/`sunsetMs` null, or the events belong to a different local day | Solar rules and the park fallback read `unknown`. Masked places unaffected. |
| Clock past `coversThrough` | Every masked verdict becomes `unknown` with the note "Hours data is out of date." Solar rules keep working — they are date-independent. `check:hours` fails 60 days before this can happen. |
| `check_date` older than 3 years | Verdict stands, card appends ", last checked 2021". |
| A value the parser reports as state-unknown (e.g. "weather permitting") | Verdict is `unknown` and the card shows the comment verbatim. Never counted as closed, never counted as open. |
| User's device clock is wrong | Nothing can fix this; the timezone is pinned so at least a *correct* clock in another zone is right. |
| `hideClosed` empties the pool | The existing `emptyNotice` path fires; with `pool-reasoning` landed it says how many were closed, and offers the "Skip closed places" switch as the thing to turn off. Without it, the generic empty notice plus the switch is still visible one drawer away. |
| Generated module missing entirely | Not a runtime degradation — it is an unresolved import and `tsc --noEmit` fails. The file is committed, so this only happens if somebody deletes it. Said plainly because the tempting sentence, "then every verdict is unknown", is false. |
| Pool and card disagree about openness | The card is shown and the card is right; the filter is a coarse pre-sort at the dial's budget. Documented above, tested by criterion 11. |
| Twice-yearly DST hour | Two mask bits are unreachable in March; two carry the EDT answer for both passes in November. See Algorithm step 8. |

Nothing here fails silently. The build prints its coverage; the panel shows an assumption as an
assumption; and `unknown` is drawn as nothing rather than as reassurance.

## Cost

**Bundle.** Estimated, not measured — see the decision above for the method. `src/data/hours.ts`
around 700 bytes gzipped at today's coverage and under 3 KB if all 62 were covered;
`src/lib/hours.ts` 700–900 bytes gzipped including the `Intl` plumbing and the verdict copy. Call it
under 1.6 KB today and under 4 KB at full coverage: 2.5% and 6% of the 64 KB budget. The refused
alternative was a measured 108 KB.

**Requests.** Zero at runtime. No new `/api` endpoint, no fetch, no Worker cost, no rate-limit
units, no engine load. `Intl.DateTimeFormat` is constructed once at module scope and called once per
pool evaluation — not once per place, which at 62 places per render would be the one place this
feature could plausibly cost a frame.

**Build.** One Overpass request (batched ids, `out tags;`), seconds. Mask baking is 336
`getState` calls per week per place — roughly 78 weeks x 336 x ~20 places = ~525k evaluations, a
few seconds in Node. `opening_hours` unpacks to 4.6 MB in `node_modules`; it is a devDependency and
never enters `dist/`.

**Hosting.** None. Nothing new is deployed.

**Cadence.** Annual rebuild, plus whenever `places-expansion` adds destinations. Annual because
opening-hours tags change on the order of years, not weeks, and because the window is two calendar
years wide — a yearly bake never lets it run out. `check:hours` makes the deadline visible 60 days
out rather than letting it pass silently.

## Tests

`src/lib/hours.test.ts`, `node --test`. Fixtures are hand-written `HoursEntry` literals — no
network, no library, no generated file dependency, so the suite tests the evaluator rather than the
bake.

Fixture masks (built once at the top of the file by a local `maskOf(slots: number[])` helper that
sets bits and base64s 42 bytes):

- `MUSEUM` — Tu–Su 10:00–17:00, one segment from `2026-01-01`.
- `SEASONAL` — two segments: `2026-01-01` all-closed, `2026-04-01` Sa–Su 10:00–16:00.
- `PARK_SOLAR` — `{ days: 0b1111111, open: { ref: "sunrise", offsetMinutes: -30 }, close: { ref: "sunset", offsetMinutes: 30 } }`.
- `SUN_JUNE` — a `SolarEvents` literal: `{ day: "2026-06-15", sunriseMs: <2026-06-15T05:48-04:00>,
  sunsetMs: <2026-06-15T20:33-04:00>, civilDawnMs: …, solarNoonMs: …, civilDuskMs: … }`. The two
  clock times are illustrative fixture values, not asserted astronomy — `daylight-budget` owns
  testing the solar port against USNO.
- `COVERAGE` — `{ from: "2026-01-01", through: "2027-12-31" }`, passed explicitly by every test.
- `COMMENTED` — `MUSEUM` plus `comment: "weather permitting"`.
- `STALE` — `MUSEUM` plus `checkedAt: "2019-04-02"`.

1. `hoursClock` converts a UTC instant to Richmond parts — `2026-01-15T20:00:00Z` → 15:00 local;
   `2026-07-15T20:00:00Z` → 16:00 local. **DST is the point.**
2. `hoursClock().slot` — Monday 00:00 → 0; Monday 00:29 → 0; Monday 00:30 → 1; Sunday 23:30 → 335.
   Same test asserts `weekdayIndex` is 0 for Monday and 6 for Sunday.
3. `bitAt` reads the bit the baker wrote, for slots 0, 7, 8, 335 (byte and bit boundaries).
4. `segmentFor` picks the last segment with `from <= date`; returns null before the first; picks the
   April segment for `2026-05-02` and the January one for `2026-03-31`.
5. `evaluateHours(undefined, ...)` → `{ state: "unknown", note: null }`. Never "open".
6. `MUSEUM` on a Tuesday at 12:00 → `open`; on the same Tuesday at 09:30 → `closed`; on a Monday at
   12:00 → `closed`.
7. `SEASONAL` on `2026-02-14` (Saturday) → `closed`; on `2026-05-16` (Saturday) at 12:00 → `open`.
   This is the market case the README confesses.
8. `PARK_SOLAR` with `SUN_JUNE`: 05:00 → `closed`, 05:30 → `open` (sunrise −30), 21:00 → `open`
   (sunset +30), 21:15 → `closed`.
9. `PARK_SOLAR` degrades to `unknown` — not `open`, not `closed` — for each of the three doors
   separately: `sun = null`; `sunsetMs: null`; and `sun.day = "2026-06-14"` against a 2026-06-15
   clock.
10. Solar verdict carries `source: "category"` and `category: "public-park"`, and its `note` is
    exactly `"Parks close around dusk — assumed, not from OSM."`
11. `COMMENTED` inside its open window → `state: "unknown"` with the comment quoted in `note`. An
    unknown-state rule is never reported open.
12. `STALE` → `stale: true`, `state` unchanged, and `note` ends `", last checked 2019"`.
13. With `COVERAGE = { from: "2026-01-01", through: "2026-12-31" }`, a 2027-03-02 clock and `MUSEUM`
    → `unknown` with note `"Hours data is out of date."`; the same clock with `PARK_SOLAR` still
    resolves. **The window is a fixture, not the generated table** — this is why `evaluateHours`
    takes `coverage`.
14. `nextCloseMinutes` on `MUSEUM` at Tuesday 15:30 → 17:00, and the composed note reads
    `"Open when you arrive — closes 5:00 pm"`. At Tuesday 10:30, with the close more than 120
    minutes out, the note is `"Open when you arrive"` with no clause.
15. `quantiseToSlot` is stable across a 29-minute advance inside one half-hour slot and jumps at the
    boundary. **This is the spin-stability guarantee** — the pool key must not churn per minute
    tick.
16. `isOpenEnough` is true for `open` and `unknown`, false for `closed`.

Additionally in `src/data/places.test.ts` (new, or extended if `places-expansion` created it): every
`osmId`, where present, matches `/^(node|way|relation)\/\d+$/`, and every `HoursEntry.id` in the
generated table corresponds to a real `Place.id`. That last one catches a rename silently orphaning
a schedule.

## Acceptance criteria

1. `npm run build:hours` writes `src/data/hours.ts` from a live Overpass fetch plus the curated
   `osmId` mapping, and the raw response lands in `data/osm/hours.json`.
2. Running it twice on different days with no OSM change produces a byte-identical
   `src/data/hours.ts` apart from the `bakedAt` line — which the calendar-pinned coverage window
   makes achievable. (`data/osm/hours.json` is excluded from this: it carries Overpass's own
   `timestamp_osm_base`.)
3. Simulating an Overpass failure leaves the existing `src/data/hours.ts` untouched and exits 1.
4. The build asserts the solar sanity case and the single-segment DST case, and exits 1 if either
   fails.
5. A value with parser warnings is dropped with a printed warning and that place reads `unknown` in
   the app — demonstrated by feeding the baker a deliberately malformed value if the live data no
   longer contains one.
6. `opening_hours` appears only in `devDependencies` and does not appear in `dist/` — verified by
   grepping the build output for a string unique to the library.
7. App JS gzipped grows by less than 2 KB, verified against the build's reported chunk sizes.
8. The result card for a market outside its season shows the amber "Likely closed when you arrive"
   row; the same market in season shows nothing alarming.
9. A park with no OSM hours, spun at 22:00 in June, shows the assumed-dusk line in `--ink-3` with
   the word "assumed" and is excluded from the pool when "Skip closed places" is on.
10. A place with no entry shows no hours line at all — no "unknown", no dash, nothing. A place with
    an entry that evaluates to `unknown` **does** show a line: the quoted comment, or "Hours data is
    out of date.", in the assumed style.
11. Openness is judged at arrival: with a 40-minute walk and a place closing in 20 minutes, the card
    says closed. And when the settled route is longer than the dial budget, a place that passed the
    "Skip closed places" filter may still land showing the closed row — the card is not suppressed
    to match the filter.
12. "Skip closed places" appears in the Filters drawer, defaults on, answers with `playThock`, and
    is reset by "Clear filters".
13. Turning the switch off restores the excluded places to the pool without a reload.
14. The verdict sentence appears in the single `sr-only role="status"` line, and no new `aria-live`
    region exists anywhere.
15. A spin is never cancelled by the clock: with the clock advanced minute by minute across a
    half-hour boundary mid-throw, `candidateKey` does not change and no `spinCancel` is dispatched.
16. `grep` for `Date.now()`, `new Date()` and `setTimeout` in `App.tsx` finds nothing added by this
    feature: the arrival instant descends from `conditions.atMs` and `arrivalMs` only, so
    `setClockOffset` moves the hours line and the daylight line together.
17. The drawer summary still reads "Filters" on a fresh load with `hideClosed` on — `activeFilters`
    was not touched.
18. `npm run lint` (including `check:hours` if it was added to the chain), `npm test` and
    `npm run build` are clean; the new tests in Tests all pass. In particular `knip` passes, which
    requires the `@public` tags on the test-only exports.
19. The README no longer claims a spin can send you to a closed lot, and does state the coverage
    figure the bake printed and the rebuild cadence.
20. Nothing under `server/`, `worker/`, `wrangler.toml` or `public/_headers` changed.

## Open questions

1. **What are Richmond's actual public-park hours?** The `sunrise-30 / sunset+30` fallback is a
   placeholder. Somebody has to read the city ordinance (or a park sign) and either confirm the
   shoulder or replace the rule with the real clock times. Until then the fallback ships with the
   word "assumed" doing a lot of work.
2. **Does the parser-warning gate drop too much?** It drops any value with a warning, and
   `getWarnings()` fires on cosmetic things (spacing, redundant selectors) as readily as on real
   nonsense — the research sample had a well-formed museum schedule carrying four of them. The
   alternative is to gate only on warnings matching a severity
   allowlist. A human should look at the first build's log and decide.
3. **Annual rebuild owner.** `check:hours` will start failing 60 days before coverage runs out. Whose
   job is it, and does it happen on a calendar reminder or only when CI complains?

## Corrections after implementation

Written against the code that shipped. Eight things, worst first.

1. **The park ordinance is 5:00 a.m. to dusk, and the placeholder was wrong in
   both edges.** Open Question 1 asked somebody to read the city code. The City
   of Richmond Parks and Recreation Rules and Regulations, developed under
   section 58-1 of the Code of Ordinances, say: *"The parks are open to the
   public from 5:00 a.m. until dusk and in areas in which lighting is provided
   the area is open until 11:00 p.m."* So the open edge is a **fixed clock
   time**, not `sunrise-30`, and the close is dusk rather than `sunset+30`.

   That is not a numbers change, it is a **shape** change: `SolarRule` had to
   grow a `clock` ref, because a rule with a fixed open and a solar close cannot
   be expressed by two solar references. The lighted-areas exception is
   deliberately not modelled — nothing in OSM says which areas are lit, and
   assuming a park is lit is how somebody ends up in a dark field at 10 pm.

2. **Solar values must be classified before baking, and the first
   implementation forgot.** Step 7 of the algorithm is exactly right and was
   simply not written; `sunrise-sunset` went through the mask baker and produced
   **72 segments** for Battery Park alone. The generated file was 76 KB. This is
   the failure the spec predicts in as many words — "more bytes than every fixed
   schedule combined" — and it is invisible unless somebody reads the output.
   Seven values ride as rules now and the file is 14 KB.

3. **The 2 KB budget is superseded, and the arithmetic matters.** Criterion 7
   was written against an assumed coverage of "near 15 of 62". Actual coverage
   is **118 of 242** — chunk 8 quadrupled the dataset and the OSM hit rate is
   what it is. Measured growth is **+3,932 B gzipped**, which is 33 B per
   covered place against this spec's own implied 47 (700 B for ~15). The
   per-place estimate was good; the place count moved. The real gate — the
   102,400 B ceiling — holds with 9.0 KB to spare.

4. **The park rule is one constant, and it took a second pass to become one.**
   The table first carried an identical `solar` object on all 93 park entries.
   That is 93 copies of the thing the checklist calls "one constant", and it
   cost bytes for nothing. The table carries `parks: string[]` and the runtime
   holds one `PARK_RULE`.

5. **The card said the same thing twice.** `pool-reasoning` already renders an
   amber "Shut when you would get there." for a pick excluded as closed. Adding
   a neutral "Likely closed when you arrive." underneath it is the card telling
   the reader twice. The hours line stands down when the verdict has said it,
   which leaves it the half the verdict cannot say: a closing time coming up,
   the park assumption, a quoted comment, data past its window.

6. **`build-hours.mjs` does not fetch, and `harvest-hours.mjs` is new.** README
   section 2.6 moved the Overpass call into the shared harvester, which deletes
   this spec's keep-the-previous-table-on-failure machinery outright. The hours
   family is also its own script, because it is the one family that changes when
   `place.osm` does — every backfilled identity is an element nobody has asked
   about yet, and re-running all six families to get it would be rude.

7. **`osmId` is `osm`** (README 2.6), and the backfill is 42 of 62 rather than
   all 62: 4 ambiguous and 16 with no candidate are left without one. See
   HUMAN-REVIEW 2.8 for the list. The spec is right that this is an afternoon's
   human work; what it could not know is that two thirds of it can be done by a
   machine that refuses to guess.

8. **The `frozenArrivalRef` latch is not needed.** `useConditions(origin,
   frozen)` already holds the clock through a throw, so quantising to the slot
   is the only stabiliser this spec needs. README section 2.1 predicted that and
   it held.

Two more worth knowing:

- **`dawn` and `dusk` are separate refs from `sunrise` and `sunset`.** Roughly
  half an hour apart at this latitude, which is the difference between a park
  being open and shut, and "dusk" is the word the ordinance itself uses. Real
  Richmond values use `dawn-dusk` as well as `sunrise-sunset`.
- **Open question 2 is live.** The warning gate drops exactly one place — the
  Virginia Holocaust Museum — and its value looks well-formed to a human. That
  is the "drops too much" case the question anticipates, now with a name.
  HUMAN-REVIEW 5.9.
