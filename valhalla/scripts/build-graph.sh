#!/usr/bin/env bash
# Writes the config and builds the routing graph from the clipped extract.
#
# Safe to re-run: it rebuilds from whatever extract is on disk. Re-run it
# after clip-extract.sh has fetched a newer one.
set -euo pipefail

# shellcheck source=../richmond.env
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/richmond.env"

if [ ! -f "${RICHMOND_EXTRACT}" ]; then
  echo "No extract at ${RICHMOND_EXTRACT}. Run ./scripts/clip-extract.sh first." >&2
  exit 1
fi

mkdir -p "${VALHALLA_TILE_DIR}"

valhalla_build_config \
  --mjolnir-tile-dir "${VALHALLA_TILE_DIR}" \
  --mjolnir-tile-extract "${VALHALLA_DATA_DIR}/tiles.tar" \
  --mjolnir-timezone "" \
  --mjolnir-admin "" \
  > "${VALHALLA_CONFIG}"

# The generated config caps isochrones well below what the dial needs. The
# ladder is 96 contours in one query and the longest is 100 minutes; leave
# these lower and the app's warm-up is rejected outright.
python3 - "${VALHALLA_CONFIG}" "${VALHALLA_MAX_CONTOURS}" "${VALHALLA_MAX_TIME_CONTOUR}"   "${VALHALLA_HOST}" "${VALHALLA_PORT}" <<'PY'
import json, sys

path, max_contours, max_time = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
host, port = sys.argv[4], int(sys.argv[5])
with open(path) as handle:
    config = json.load(handle)

limits = config.setdefault("service_limits", {}).setdefault("isochrone", {})
limits["max_contours"] = max_contours
limits["max_time_contour"] = max_time

# The generated config listens on every interface. The engine takes a raw
# location and a costing model with no rate limit and no bounds check, so the
# only thing that should be able to reach it is the app's proxy.
listen = config.setdefault("httpd", {}).setdefault("service", {})
listen["listen"] = f"tcp://{host}:{port}"

with open(path, "w") as handle:
    json.dump(config, handle, indent=2)
print(f"isochrone limits set to {max_contours} contours, {max_time} minutes")
print(f"listening on {host}:{port}")
PY

echo "Building tiles (about a minute for a clipped extract)..."
valhalla_build_tiles -c "${VALHALLA_CONFIG}" "${RICHMOND_EXTRACT}"

echo "Graph built. Next: ./scripts/run-engine.sh, or install the systemd unit."
