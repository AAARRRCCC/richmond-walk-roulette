# The feel pass

**Status:** ground prepared, waiting on a person.

Everything else in this plan is a proposition that is true or false. This is the one part that
is not, and it is the reason the word "feel" appears nowhere else in `GOAL.md`. What follows is
the ground laid for it: how to start the thing, what to try in what order, what to *look at*
rather than press, what is ugly on purpose, all the copy in one place, and how to reach the
three states that are hardest to reach deliberately.

Read `HUMAN-REVIEW.md` §2 first if you read nothing else. Twelve decisions were made on your
behalf and every one names the constant that reverses it.

---

## 1. Starting it

```sh
git clone <this repo> && cd richmond-walk-roulette
npm install
npm run dev            # http://localhost:5173
```

There is no `.env` step for the app itself to start. `cp .env.example .env.local` is what points
it at an engine, and the file explains why none of those variables carry a `VITE_` prefix: they are
server-side only and never reach the browser.

**The engine is a separate thing and the app is honest when it is missing.** Contours and routes
come from a local Valhalla instance; without it you get a panel saying so rather than a broken
screen, which is worth seeing once on purpose.

```sh
cd valhalla && ./scripts/run-engine.sh start     # in WSL
curl -s http://127.0.0.1:8002/status             # expect a version and a tileset date
```

**On this machine there is a trap that will waste your afternoon.** WSL idles the whole distro
out between commands and takes the published port with it, so Valhalla looks down when it is
running perfectly. Hold a process open in the distro for as long as you are working:

```sh
wsl -e bash -lc "sleep 3600" &
```

If `/api/health` answers and then stops answering a minute later, that is this and not the app.
`HUMAN-REVIEW.md` §5.16 has the full diagnosis.

---

## 2. The walkthrough — phone first

Do it on a phone if you can. **Six of the open acceptance boxes across the run are open only
because nobody looked at a 390 px viewport**, and the panel is where the app spends most of its
screen. Each step names what to *look at*, because pressing the button is the easy half.

### The ordinary walk

1. **Cold load.** Look at how long it takes before the map means anything, and at the dial's
   warm-up counter. A preset origin is a baked snapshot and should be near-instant; the counter
   is there for the case that is not.
2. **Scrub the dial.** Look at whether the contour tracks your thumb or lags it. This is the
   single most tuned interaction in the app — the whole 96-rung ladder is prefetched so that
   scrubbing never touches the network.
3. **Press Spin.** Look at the *reel*, not the result: how long it turns, how it slows, whether
   the landing feels like a stop or a jump. Every number behind that is live in the TUNE panel
   (§4), and it is the one thing in the app explicitly designed to be adjusted by ear.
4. **The result card.** Look at the order of what it tells you, and whether the elevation chart
   reads as terrain or as noise. Then look at the sentences under it — see §5.
5. **Drag the origin marker.** Look at what happens to the pool while it moves, and how long the
   new reach takes to arrive. A dropped pin has no snapshot and pays full price.

### The filters

6. **Open Filters and turn things on until the pool empties.** Look at the summary line above
   Spin as it shrinks — every filter that removes a place is supposed to be named there — and
   then at the empty-pool notice, which should name **one** fix and give you the button for it.
   Press the button and check the pool actually refills.
7. **Turn on "Get back before dark."** Look at the dead zone that appears on the dial and whether
   the note explains itself without you having to reason about it.

### Sharing

8. **Press Share on a result, then open the link in a new tab.** Look at whether the walk comes
   back on the *first frame* — no reel, no flash of the default origin.
9. **Now move the dial.** Look at the address bar: it should clear to `/` on the next paint,
   while "Spin your own" stays. That distinction is deliberate and it is the subtlest rule in the
   app.

### Both in reach

10. **Press "Invite someone to meet" and open the link** (a second device is better; a second
    browser profile will do). Look at what the recipient sees **before** they choose a start: an
    empty map, a question, a disabled Spin. Nothing is measured until they answer — check the
    network panel is silent.
11. **Choose a start.** Look at the two warm-ups arriving one after the other, yours first, and at
    whether the second contour landing is a pleasant reveal or a jolt.
12. **Look at the two contours together.** The overlap is not computed — it is two translucent
    fills crossing. Decide whether you can actually see where the shared region is. **If you
    cannot, that is the trigger to reopen `meet-in-the-middle` open question 6**, and it is a
    look-at-it decision that belongs to you rather than to an implementer.
13. **Look at the dashed outline.** Does it read as "theirs", or as noise? Open question 7, and
    ten minutes with a phone settles it.

---

## 3. Reaching the three hard states

**Empty pool.** The reliable recipe: set the dial to its minimum, then turn on *Far edge only*
and pick a vibe that nothing near you has — *Museum* from a residential preset does it. The
notice should name one fix and refill the pool when pressed.

**Dark.** Two ways. Honestly, by opening the app after civil dusk — the daylight line names the
real time. Impatiently, with the dev clock hook: `HUMAN-REVIEW.md` §6.3 documents it, and it is
dev-only.

**No overlap.** This turns out to be the *easy* one, which is itself a finding: **no preset pair
shares a pool at a round trip, at any budget the dial has.** Open any invite between two presets
and you are already in the state. To see the *opposite* — a real shared pool — turn Round trip
**off** and set the dial wide; that halves the distance each person must cover.

---

## 4. The TUNE panel, and what is not in it

The panel is dev-only, bottom of the rail. It holds the reel and the sound cues: duration, first
and last flip intervals, the ease exponent, the maximum hold, the settle, volume, and the
circular-order experiment. Values persist per browser, and **Bake** writes them into
`src/app/tuning.ts` so they survive.

**GOAL asks that every feel constant the run touched be adjustable there live, and that is not
true.** The panel covers the reel and sound only. These are feel constants too, and each needs an
edit and a reload:

| Constant | File | What it decides |
| --- | --- | --- |
| `CLIMB_EASY_MAX_M_PER_KM` (12), `CLIMB_HILLY_MIN_M` (25) | `src/lib/elevation.ts` | Whether a walk is "easy" |
| `PROFILE_MIN_RANGE_M` (20) | `src/lib/elevation.ts` | Whether a flat walk's chart reads as terrain |
| `MEET_GAP_MINUTES` (8) | `src/app/meet.ts` | When the card says who waits |
| `MAX_ACCURACY_METERS` (250), `CAVEAT_ACCURACY_METERS` (100) | `src/lib/locate.ts` | When a GPS fix is refused or caveated |
| `PIN_PRECISION` (3) | `src/app/share.ts` | How precisely a shared pin is published |

Adding them to the panel is a small piece of work and was deliberately not smuggled into a v0.5
chunk. If you find yourself editing any of them twice, that is the signal.

---

## 5. All the copy, in one place

Copy is judged by reading it together, not by meeting one line at a time on eleven screens.

**Why a place is not in the pool** (`eligibility.ts`, one row per reason):

> Further than your budget walks. · Closer than the range's lower end. · Outside the other
> person's reach. · Not the climb you asked for. · None of the things you are looking for. · Not
> the kind of place you asked for. · Not out in the far edge band. · Shut when you would get
> there. · Not a walk for this weather.

**When there is nothing to spin** (`EmptyPoolNotice.tsx`):

> Nothing to spin. {N} places are in reach; {M} of them are held back.
> Nothing is in reach in {N} min. The nearest match is {place}, about {M} min away.
> Nothing to spin inside {N} min. The weather trimmed your {M} min, and everything that matches is outside what is left.
> Everything that matches is closer than your range starts.
> Nothing is inside {N} min of both of you. At {M} min, {place} comes into both your reaches.
> Nothing is inside 100 minutes' walk of both of you — the widest the dial goes.
> Waiting on their side.
> Nothing matches, at any budget the dial offers.

**On a result card** (`App.tsx`'s `resultLines`, in fixed order):

> {conditions headline} · {duration} out and back · {dusk} · {hours note} · Other apps will
> recalculate — their walk times will differ. · Both walks are measured at the same pace.

**Warnings on a card:**

> Outside your current time budget. · Closer than your range's lower end. · This walk does not
> fit in the light left. · Could not measure this walk.

**Location** (`locate.ts`):

> Your device reported a position this can't read. Drop a pin on the map instead.
> Located to within about {N} — the edges are approximate.

**The invite, before you press** (`InviteButton.tsx`) — the most consequential paragraph in the
app, because it is the one that has to be true:

> This link carries where you're starting from, rounded to about 100 metres. Anyone who gets the
> link can read it — including the app you send it through, which fetches the link to build its
> preview. It does not expire and it cannot be taken back. Treat it like a text message, not a
> secret.

> This link names {preset}, not a coordinate. Nothing about where you actually are goes into it.

**What the recipient is told** (`MeetPanel.tsx`):

> Someone shared a starting point with you. Set where you're starting from and you'll see what's
> inside {N} minutes' walk of both of you.

> When you set your start, it goes to this app's own server to measure how far you can walk — and
> nowhere else. It never goes into a link, and it never reaches the other person unless you press
> *Send this back*.

That second sentence was rewritten during the run. The first draft said *"your starting point
stays on this device"*, which was **false** — the app posts it to `/api/isochrone` the moment you
set it, because that is the measurement you asked for. Shipping a comfortable untruth in the one
sentence written to reassure people would have been the worst line in the product.

**Weather, when it is off:**

> Forecast is switched off in this build.

---

## 6. Ugly on purpose

Called out in advance so they read as decisions rather than as things nobody noticed.

- **Weather is switched off.** Not broken — the free tier of the data source is non-commercial
  only, and the run took the conservative branch. One constant turns it on. `HUMAN-REVIEW.md` §2.4
  is the decision, and it needs an answer from you: *is this app free and ad-free?*
- **The invite state shows an empty map.** No contours at all, not even the sender's. That is the
  cost of the promise printed on the same screen — nothing is measured until the recipient
  chooses. The sibling spec wanted the sender's reach drawn; the privacy criterion won. §3.10.
- **A round trip almost never has a shared pool.** Not a bug. The dial's widest is 100 minutes
  total, so 50 each way, and Richmond's presets are further apart than that.
- **There is no overlap polygon and no overlap area.** Two fills cross and the region looks
  denser. The app will not print a number it cannot measure, and a clipper was refused — 9–17 KB
  for a library with an open robustness bug that this repo's own snapshots would trigger.
- **The app is downtown-shaped.** Eleven baked snapshots, none south of the James. A Southside
  walker pays a full cold ladder while a preset answers in milliseconds. The largest unaddressed
  asymmetry in the app, and it is named in `docs/plans/README.md` §6.
- **Most places have no opening hours** — 118 of 242, and `unknown` renders as nothing rather
  than as a guess.
- **The bundle is 98.8 KB against a README that claims 64.** The claim was stale before v0.5
  began. §2.1, and §6.4 for where chunk 11's share went.
- **Both walkers share one pace.** Stated on the card rather than implied. §2.12 — and it is the
  most expensive decision in the document to reverse.

---

## 7. What this pass inherits

Not failures — work that needed a thing this machine did not have.

- **A phone.** Six boxes across the run, and the meet panel has never been seen at 390 px.
- **A second person and a second device.** Two boxes. Also the only way to see the divergence
  §2.9 predicts: the two devices can legitimately show different counts near the overlap boundary.
- **A deployment.** Three checks that only a real request can make — `run_worker_first` lives in
  `wrangler.toml` and nothing local proves it. All three are curls in `LAUNCH.md`.
- **A stopwatch.** `meetMinimum` was never timed, which its own spec says must not ship. §5.13.
- **Weather that did not happen.** Every weather rule is asserted against injected conditions; no
  rule has ever fired on real weather, because the run happened on mild dry nights.
