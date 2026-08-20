> **Historical document** (pre-isochrone wheel version). The Google
> Routes/Isochrones setup it references is gone: the app now runs on
> self-hosted Valhalla with no Google APIs at all. For current launch
> guidance read `LAUNCH.md` and `valhalla/README.md`.

# Handback

Brady — while you were away, Web Claude took over as PM and we ran ten more iterations (41–50) on top of the original autonomous-loop work. Score sits at 99/100. First-paint JS is 56 KB gzipped. The mobile flip Web Claude pushed for is in (`15f480f`) — the wheel is a transient overlay during spin, the map fills the dominant viewport at `<900px`, and the bottom sheet carries the current pick + a Spin Again button alongside the filter drawer. The Bezier fallback got an honesty signal (red "APPROX ROUTE" pill in the map-meta plus muted polyline opacity + a dashed line pattern), and the new sub-component tree gained a proper a11y pass — aria-live announcements, focus management around the spin overlay, `inert` on the closed-drawer body so tab order doesn't leak into offscreen Controls. The biggest single catch was a regression I introduced myself in iter 47: a data-driven `line-dasharray` that MapLibre 4.x silently rejects, breaking the route layer entirely. Caught it during iter 50's validation pass and fixed with two static-paint layers (`3267360`). Web Claude called that one "the biggest win in this whole sprint" and asked me to do live-preview validation rather than computed-style inspection on any future map-paint work.

The launch-readiness pass is `LAUNCH.md` — please read that before exposing the app to the web. It walks you through the Routes API key referrer restriction, the OG image asset I left a slot for at `/og-image.png`, optional Cloudflare Web Analytics (gated behind `VITE_CF_ANALYTICS_TOKEN`), the build, and a post-deploy smoke-test checklist. Some of that is decision work I can't make for you, surfaced below.

## Things only you can answer

- **Phone-test the mobile flip — this is the actual ship blocker.** The MCP Chrome window couldn't resize below ~640px, so the live mobile experience has never been visually verified at real phone widths. Iter 45 was deliberately structured as a single revertable commit if it's broken.
- **Hosting target**: subdomain (`walk-roulette.plvr.net`?) vs. something else? The Routes API key's referrer allow-list and the OG meta tags' implicit base both depend on this.
- **OG image**: I wired the meta tags pointing at `/og-image.png` but didn't create the 1200×630 asset — wanted your eye on branding. LAUNCH.md has the suggested approach.
- **`prefers-reduced-motion`**: Web Claude wanted this but it touches your off-limits list (spin animation timing/easing). Either skip the animation entirely or cut its timing significantly — which approach do you want?
- **POI expansion past 34**: Web Claude flagged this as the bigger product unlock than the mobile drawer was. `pois.ts` is off-limits without your OK. Curated-only or curated-plus-OSM-hybrid?
- **Saved routes / history / custom POI submission**: Web Claude deferred these explicitly because of moderation surface. Worth a real conclusion when you're ready.

## What's not verified

The mobile layout at real phone widths, screen-reader behavior on actual assistive tech (only inferred from the ARIA + DOM structure), and the OG card rendering in iMessage/Slack/Discord (gated on the image). Everything else has either a live Chrome screenshot or a computed-style/console check behind it.

Repo: `github.com/AAARRRCCC/richmond-walk-roulette`. Initial commit `969547c` is the revert anchor. Iteration history is in `iter-log.html` (visual) and `IDEAS.md` (running log). The Claude.ai conversation tab Brady opened in iter 41 has Web Claude's full thread of direction-setting and reviews — worth scrolling through if you want the design-decision reasoning behind any specific iter.

I'm standing down. Web Claude was explicit: "polish iters without Brady's review gate are entropy." Run `/goal clear` whenever, or just leave the goal sitting until you fire it on something new.
