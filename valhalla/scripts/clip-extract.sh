#!/usr/bin/env bash
# Cuts a Richmond-sized extract out of the Virginia one.
#
# The state extract is about 900 MB and takes fifteen minutes or so to turn
# into a graph. Almost none of it is within walking distance of Richmond. The
# clipped extract is a fraction of that and builds in about a minute, which is
# the difference between rebuilding the graph being a chore and being nothing.
set -euo pipefail

# shellcheck source=../richmond.env
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/richmond.env"

mkdir -p "${VALHALLA_DATA_DIR}"

if [ ! -f "${STATE_EXTRACT}" ]; then
  echo "Fetching the Virginia extract (about 900 MB, once)..."
  curl -L --fail -o "${STATE_EXTRACT}.part" "${STATE_EXTRACT_URL}"
  mv "${STATE_EXTRACT}.part" "${STATE_EXTRACT}"
fi

echo "Clipping to ${RICHMOND_BBOX_LEFT},${RICHMOND_BBOX_BOTTOM},${RICHMOND_BBOX_RIGHT},${RICHMOND_BBOX_TOP}..."
osmium extract \
  --bbox "${RICHMOND_BBOX_LEFT},${RICHMOND_BBOX_BOTTOM},${RICHMOND_BBOX_RIGHT},${RICHMOND_BBOX_TOP}" \
  --strategy complete_ways \
  --overwrite \
  --output "${RICHMOND_EXTRACT}" \
  "${STATE_EXTRACT}"

echo "Wrote ${RICHMOND_EXTRACT} ($(du -h "${RICHMOND_EXTRACT}" | cut -f1))."
