#!/usr/bin/env bash
# Starts, stops or follows the engine. The graph must already be built.
#
#   ./scripts/run-engine.sh          start in the background
#   ./scripts/run-engine.sh logs     follow the log
#   ./scripts/run-engine.sh stop     stop it
#
# The container restarts itself unless it was stopped on purpose, so on a
# server this is only needed the first time: Docker brings it back on boot.
set -euo pipefail

VALHALLA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../richmond.env
source "${VALHALLA_DIR}/richmond.env"
cd "${VALHALLA_DIR}"

case "${1:-start}" in
  start)
    if [ ! -f "${RICHMOND_EXTRACT}" ]; then
      echo "No extract at ${RICHMOND_EXTRACT}. Run ./scripts/clip-extract.sh first." >&2
      exit 1
    fi
    docker compose up -d
    echo "Serving on ${VALHALLA_HOST}:${VALHALLA_PORT}. Logs: $0 logs"
    ;;
  logs) docker compose logs -f ;;
  stop) docker compose down ;;
  *)
    echo "Usage: $0 [start|logs|stop]" >&2
    exit 1
    ;;
esac
