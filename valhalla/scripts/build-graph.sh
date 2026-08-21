#!/usr/bin/env bash
# Builds the routing graph, then corrects the limits the app depends on and
# that nothing else will tell you are wrong.
#
# The image builds tiles on first start from the .osm.pbf in the mounted data
# directory, writes its config there, and only then begins serving. So the
# sequence is: start, wait until it ANSWERS, correct the config, restart.
#
# Waiting for the config file instead would be waiting for the wrong thing.
# The config appears within seconds, near the beginning of the build, and
# restarting on it interrupts the build and packs a partial tile extract - one
# that loads without complaint and then answers every route with "no suitable
# edges near location". Verified: it produced a graph with 8 tiles in it.
#
# Safe to re-run. A changed extract triggers a rebuild; an unchanged one does
# not, and the limits are left alone once they are already right.
set -euo pipefail

VALHALLA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../richmond.env
source "${VALHALLA_DIR}/richmond.env"

STATUS_URL="http://${VALHALLA_HOST}:${VALHALLA_PORT}/status"

# Answers only once the graph is built and loaded.
wait_for_engine() {
  local label="$1" tries="$2"
  printf '%s' "${label}"
  for _ in $(seq 1 "${tries}"); do
    if curl -fsS "${STATUS_URL}" >/dev/null 2>&1; then
      printf '\n'
      return 0
    fi
    printf '.'
    sleep 2
  done
  printf '\n'
  return 1
}

if [ ! -f "${RICHMOND_EXTRACT}" ]; then
  echo "No extract at ${RICHMOND_EXTRACT}. Run ./scripts/clip-extract.sh first." >&2
  exit 1
fi

cd "${VALHALLA_DIR}"

if [ "${REBUILD:-0}" = "1" ]; then
  echo "REBUILD=1: discarding the existing graph."
  docker compose down
  rm -rf "${VALHALLA_DATA_DIR}/valhalla_tiles" \
         "${VALHALLA_DATA_DIR}/valhalla_tiles.tar" \
         "${VALHALLA_DATA_DIR}/file_hashes.txt"
fi

echo "Starting the engine. The first run builds the graph - a few minutes for"
echo "a clipped extract - and later runs reuse it."
docker compose up -d

# Ten minutes. A clipped extract is far quicker, but a cold machine building
# for the first time should not be told it failed.
if ! wait_for_engine "Building the graph" 300; then
  echo "The engine never answered. Check: docker compose logs -f" >&2
  exit 1
fi

if python3 "${VALHALLA_DIR}/scripts/set-limits.py" \
  "${VALHALLA_CONFIG}" "${VALHALLA_MAX_CONTOURS}" "${VALHALLA_MAX_TIME_CONTOUR}" | grep -q "already correct"; then
  echo "Config already correct; leaving the engine alone."
else
  docker compose restart
  if ! wait_for_engine "Restarting with the corrected limits" 120; then
    echo "The engine did not come back. Check: docker compose logs -f" >&2
    exit 1
  fi
fi

# A graph that loaded is not the same as a graph with Richmond in it. An
# interrupted build produces one that serves /status happily and knows about
# no roads at all, so the last word here is a real route through the city.
echo "Checking the graph actually routes..."
ROUTE=$(curl -fsS -m 30 -X POST "http://${VALHALLA_HOST}:${VALHALLA_PORT}/route" \
  -H 'content-type: application/json' \
  -d '{"locations":[{"lat":37.5464,"lon":-77.4517},{"lat":37.5385,"lon":-77.4335}],"costing":"pedestrian","units":"kilometers","elevation_interval":30}' \
  || true)

if ! printf '%s' "${ROUTE}" | grep -q '"summary"'; then
  echo >&2
  echo "The engine is up but cannot route across Richmond:" >&2
  printf '  %s\n' "${ROUTE}" >&2
  echo >&2
  echo "Usually a partial graph. Rebuild from scratch with:" >&2
  echo "  REBUILD=1 ./scripts/build-graph.sh" >&2
  exit 1
fi

# The second silent failure, and it is quieter than the first. A graph built
# without build_elevation still routes, still answers, still looks healthy -
# and returns -500.0 for every elevation sample, which is Valhalla's
# kNoElevationData sentinel. Nothing else in the stack will tell you. The app
# would draw a confident flat line five hundred metres below sea level and
# label it terrain.
#
# python3 rather than grep, because the question is "is every sample real",
# which is about an array of numbers and not about whether a substring appears
# somewhere in a 60 KB body.
echo "Checking the graph knows about hills..."
ELEVATION=$(printf '%s' "${ROUTE}" | python3 -c '
import json, sys
leg = json.load(sys.stdin)["trip"]["legs"][0]
samples = leg.get("elevation") or []
dead = [s for s in samples if s <= -500]
if not samples:
    print("no elevation array in the leg")
elif len(dead) == len(samples):
    print("all %d samples are the no-data sentinel" % len(samples))
elif dead:
    print("%d of %d samples are the no-data sentinel" % (len(dead), len(samples)))
else:
    print("ok - %d samples, %.0f to %.0f m" % (len(samples), min(samples), max(samples)))
')

case "${ELEVATION}" in
  ok*)
    echo "Elevation: ${ELEVATION}"
    ;;
  *)
    echo >&2
    echo "The graph routes but has no elevation in it: ${ELEVATION}" >&2
    echo >&2
    echo "build_elevation=True is a BUILD setting. It does nothing to a graph" >&2
    echo "that already exists, and on the first run after turning it on the" >&2
    echo "SRTM tiles may only be fetched after the build that needed them." >&2
    echo "Run it once more, now that they are on disk:" >&2
    echo "  REBUILD=1 ./scripts/build-graph.sh" >&2
    echo >&2
    echo "If a second pass does not fix it, the tiles do not cover the" >&2
    echo "extract. Look for N37W078 under ./data/elevation_data." >&2
    exit 1
    ;;
esac

curl -fsS "${STATUS_URL}"
printf '\n\n'
echo "Routing across Richmond works. Point the app at it:"
echo "  in .env.local, VALHALLA_URL=http://127.0.0.1:${VALHALLA_PORT}"
echo "                 VALHALLA_MAX_CONTOURS=${VALHALLA_MAX_CONTOURS}"
