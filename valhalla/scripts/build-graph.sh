#!/usr/bin/env bash
# Builds the routing graph, then corrects the two limits the app depends on
# and that nothing else will tell you are wrong.
#
# The image builds tiles on first start from the .osm.pbf in the mounted data
# directory, and writes its config there. The config it writes caps isochrones
# far below what this app asks for, so the sequence is: start, wait for the
# config, correct it, restart.
#
# Safe to re-run. A changed extract triggers a rebuild; an unchanged one does
# not, and the limits are left alone once they are already right.
set -euo pipefail

VALHALLA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../richmond.env
source "${VALHALLA_DIR}/richmond.env"

if [ ! -f "${RICHMOND_EXTRACT}" ]; then
  echo "No extract at ${RICHMOND_EXTRACT}. Run ./scripts/clip-extract.sh first." >&2
  exit 1
fi

cd "${VALHALLA_DIR}"

echo "Starting the engine. The first run builds the graph - about a minute for"
echo "a clipped extract - and later runs reuse it."
docker compose up -d

printf 'Waiting for the config to be written'
for _ in $(seq 1 300); do
  [ -f "${VALHALLA_CONFIG}" ] && break
  printf '.'
  sleep 2
done
printf '\n'

if [ ! -f "${VALHALLA_CONFIG}" ]; then
  echo "No config after ten minutes. Check: docker compose logs -f" >&2
  exit 1
fi

python3 "${VALHALLA_DIR}/scripts/set-limits.py" \
  "${VALHALLA_CONFIG}" "${VALHALLA_MAX_CONTOURS}" "${VALHALLA_MAX_TIME_CONTOUR}"

docker compose restart

echo "Waiting for the engine to answer..."
for _ in $(seq 1 60); do
  if curl -fsS "http://${VALHALLA_HOST}:${VALHALLA_PORT}/status" >/dev/null 2>&1; then
    curl -fsS "http://${VALHALLA_HOST}:${VALHALLA_PORT}/status"
    printf '\n\n'
    echo "Serving on ${VALHALLA_HOST}:${VALHALLA_PORT}. Point the app at it:"
    echo "  in .env.local, VALHALLA_URL=http://localhost:${VALHALLA_PORT}"
    echo "                 VALHALLA_MAX_CONTOURS=${VALHALLA_MAX_CONTOURS}"
    exit 0
  fi
  sleep 2
done

echo "The engine did not answer. Check: docker compose logs -f" >&2
exit 1
