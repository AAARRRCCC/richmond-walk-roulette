# Launch checklist

Brady runs through this once before exposing the app to the public web.
Web Claude has been reviewing iters as PM; this doc is the deploy gate.

The app is a static SPA. The Mac Mini hosts it; Cloudflare Tunnel
exposes it; that's the planned topology.

---

## 1. Decide the hosting target

Web Claude flagged this as an open decision:

- Subdomain (`walk-roulette.plvr.net`?) vs a different domain?
- That decision affects:
  - The Routes API key's HTTP-referrer allow-list (next item)
  - The OG meta tags' implicit base URL for `/og-image.png`
  - Cloudflare Tunnel route config

**Action:** pick the URL. Everything below assumes you have it.

---

## 2. Configure the Google Routes API key

The key in `.env` (gitignored) works in dev but should be **restricted** before public exposure.

1. Open Google Cloud Console → APIs & Services → Credentials.
2. Find the key the app uses (the one in `.env`'s `VITE_GOOGLE_MAPS_API_KEY`).
3. Under **Application restrictions** → choose **HTTP referrers (web sites)**.
4. Add an entry for your hosting target (from step 1):
   - e.g. `https://walk-roulette.plvr.net/*`
   - and `https://*.walk-roulette.plvr.net/*` if you'll use subpaths
5. Under **API restrictions**, restrict to only the **Routes API**.
6. Save.

**Don't skip this.** An unrestricted Maps key in a public-facing site
can be scraped from the network panel and used by anyone, on your bill.

The app degrades gracefully if the key is missing or domain-rejected
— routes fall back to the stylized Bezier polyline, and the "APPROX
ROUTE" badge appears (iter 41 / 47). But intentional deploy = keep
the key working.

---

## 3. Supply the OG image asset

Iter 50a (`030f129`) wired the `og:image` meta tag pointing at
`/og-image.png`. The asset itself doesn't exist yet.

**Required:** a 1200 × 630 PNG of the wheel on the paper-aesthetic
background, dropped at `public/og-image.png` (creates the path
`dist/og-image.png` after build).

Suggested approach:

- Open the running app at a real desktop viewport (e.g. 1920×1200).
- Spin or pick a POI so the wheel + a highlighted destination are
  visible.
- Screenshot the wheel pane + a sliver of the map.
- Crop/scale to 1200 × 630 in any image tool.
- Save as `public/og-image.png`.

Test the preview locally: paste `http://localhost:5173/#s=...` into
iMessage / Discord / Slack after deploy. The big card should show
your image + the dynamic title.

(Per-pick dynamic OG image generation is a v2 concern — static is
fine for v1.)

---

## 4. Phone-test the mobile flip

**This is the actual ship-blocker.** Iter 45 (`15f480f`) restructured
the layout at `<900px` into a map-dominant + transient-wheel-overlay
+ result-in-drawer-peek pattern. It was verified by CSS-rule
inspection and computed-style checks, but the MCP Chrome window
couldn't actually resize below ~640px, so **the live mobile experience
has never been visually verified**.

Before going public:

1. Deploy a staging build (or use the Cloudflare Tunnel's preview URL
   if available).
2. Open it on an actual phone (iOS Safari + Android Chrome both).
3. Verify:
   - Map fills the dominant viewport area
   - Drawer peek shows result + Spin Again button at the bottom
   - Tapping the drawer handle opens it; tapping again closes
   - Spinning shows the wheel as a fullscreen-ish overlay with
     paper-tinted fade-in
   - URL-restored picks (open a shared link) don't trigger the
     overlay animation
   - Filters work; Clear Filters works
   - Open in Maps opens the native Maps app with walking directions
   - Touch targets feel right (chips, range thumbs)
   - Safe-area: iOS notch + home indicator don't overlap content
4. If something's off, file via `git revert` of the offending iter or
   open a new issue. Iter 45 was deliberately structured as a single
   revertable commit so this can be rolled back if mobile is broken.

---

## 5. Optional: Cloudflare Web Analytics

If you want page-view tracking:

1. Cloudflare dashboard → Analytics → Web Analytics → "+ Add a site".
2. Use your hosting target URL.
3. Copy the JS beacon **token** (NOT the script tag verbatim).
4. Add to `.env`: `VITE_CF_ANALYTICS_TOKEN=<token>`.
5. Rebuild. If the env var is set, the build inlines the beacon
   script tag automatically (iter 50c).

Cookie-free, no banner needed. Skip this step if you don't care
about analytics.

---

## 6. Build + deploy

From the project root:

```sh
npm run typecheck    # sanity check
npm run build        # produces dist/ — static site
```

Verify `dist/og-image.png` exists (step 3).

Deploy `dist/` however you serve static files:

- **Mac Mini direct**: copy `dist/` to your static-server document root
  (e.g. Caddy / nginx / `serve`). Reload the server.
- **Cloudflare Tunnel** (`cloudflared`): no extra step — the tunnel
  points at the local static server, and the static server's
  document root is `dist/`.

---

## 7. Post-deploy smoke tests

Open the deployed URL in a fresh browser tab (no cache):

- [ ] Page loads, wheel renders, map renders
- [ ] Spin the wheel; result lands; "Open in Maps" works
- [ ] Filter to Hilly + River → result changes
- [ ] Empty state: filter to Hilly + Food (no matches) → "Clear filters"
      button restores
- [ ] Click "Share"; paste link into another tab → state restores
      identically
- [ ] Phone-test (step 4) confirmed before announcing
- [ ] OG preview confirmed in at least one chat app (step 3)
- [ ] No console errors on desktop OR mobile
- [ ] `https://search.google.com/test/rich-results` accepts the page
      (validates OG/Twitter tags)
- [ ] Network panel: only requests go to your domain, OpenFreeMap
      tile server, and `routes.googleapis.com`. No third-party trackers
      unless you opted into step 5.

---

## Standing escalations Brady should look at when back

These came up during the Web Claude-managed iters and need your
explicit call before they can be addressed:

- **`prefers-reduced-motion` branch.** Skipping the 4.2s spin
  animation for users who set OS-level "reduce motion." A reduced
  branch would either (a) skip the animation entirely and jump
  straight to a result, or (b) cut the timing significantly. Both
  touch the spin animation timing/easing, which is on your off-limits
  list — needs your OK on which approach + how aggressive.
- **POI expansion past 34.** Web Claude flagged that more POIs is
  the bigger product unlock than the mobile drawer. `src/data/pois.ts`
  is off-limits without your OK. Worth deciding curated-only vs.
  curated-plus-OSM-hybrid.
- **Saved routes / history / custom POI submission.** Web Claude
  deferred these explicitly — moderation surface area. Reach a real
  conclusion (yes/no) when you want to validate the loop further.

---

## Reference

- Repo: `github.com/AAARRRCCC/richmond-walk-roulette` (private)
- Iter log (visual summary): `iter-log.html`
- Backlog: `IDEAS.md`
- Web Claude PM conversation: the claude.ai tab Brady opened in iter 41
- Initial commit (revert point): `969547c`
