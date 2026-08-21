// Is the baked hours table about to run out?
//
//   npm run check:hours
//
// The masks cover a fixed calendar window. Past `coversThrough` every verdict
// degrades to `unknown` - which is safe, and silent, and would stay that way
// until somebody noticed the app had stopped saying anything about hours.
//
// **Deliberately NOT in the `lint` chain.** Every other tool there - eslint,
// oxlint, knip - is a pure function of the tree, and a check that goes red on a
// calendar date with no code change is how a developer learns to ignore the
// chain. This runs in the scheduled CI job, where a slow discovery is the
// correct trade. `docs/plans/README.md` section 2.6 settles that.
import { createServer } from "vite";

/** How much warning is enough to schedule an afternoon. */
const WARN_DAYS = 60;

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-check-hours",
  optimizeDeps: { noDiscovery: true, include: [] },
});
let HOURS;
try {
  HOURS = (await vite.ssrLoadModule("/src/data/hours.ts")).HOURS;
} finally {
  await vite.close();
}

// Compared as dates rather than instants: the window is a Richmond calendar
// window, and an hour either side of midnight is not what this is measuring.
const through = new Date(`${HOURS.coversThrough}T12:00:00Z`);
const now = new Date();
const daysLeft = Math.floor((through.getTime() - now.getTime()) / 86_400_000);

const covered = HOURS.entries.length + HOURS.parks.length;
console.log(`hours: ${covered} places covered, baked ${HOURS.bakedAt.slice(0, 10)}`);
console.log(`window: ${HOURS.coversFrom} to ${HOURS.coversThrough} (${daysLeft} days left)`);

if (daysLeft < WARN_DAYS) {
  console.error(
    `\ncheck-hours: only ${daysLeft} days of coverage remain.\n` +
      "Past the window every hours verdict silently becomes `unknown`.\n\n" +
      "  npm run harvest:hours && npm run build:hours\n",
  );
  process.exit(1);
}
