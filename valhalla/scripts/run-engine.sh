#!/usr/bin/env bash
# Runs the engine in the foreground. This is the development path - on a
# server, use the systemd unit beside this directory instead.
set -euo pipefail

# shellcheck source=../richmond.env
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/richmond.env"

if [ ! -f "${VALHALLA_CONFIG}" ]; then
  echo "No config at ${VALHALLA_CONFIG}. Run ./scripts/build-graph.sh first." >&2
  exit 1
fi

echo "Serving on ${VALHALLA_HOST}:${VALHALLA_PORT}. Ctrl-C to stop."
exec valhalla_service "${VALHALLA_CONFIG}" 1
