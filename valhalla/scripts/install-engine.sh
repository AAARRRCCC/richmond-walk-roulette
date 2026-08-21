#!/usr/bin/env bash
# Installs the routing engine and the one tool used to clip the extract.
#
# Debian and Ubuntu, which covers WSL and every small VPS. Run once per
# machine. Everything else in this directory assumes the binaries this puts on
# the PATH: valhalla_build_config, valhalla_build_tiles, valhalla_service.
set -euo pipefail

if command -v valhalla_service >/dev/null 2>&1 && command -v osmium >/dev/null 2>&1; then
  echo "Engine and osmium already installed."
  exit 0
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer is for Debian and Ubuntu. On anything else, install" >&2
  echo "Valhalla and osmium-tool by hand; the other scripts only need them" >&2
  echo "on the PATH." >&2
  exit 1
fi

sudo apt-get update
# osmium-tool is in the main archives and does the bbox clip.
sudo apt-get install -y osmium-tool curl python3

# Valhalla itself is not in the Debian or Ubuntu archives. The project
# maintains a PPA; where it has no build for this release, fall through to
# saying so rather than half-installing something.
if ! command -v valhalla_service >/dev/null 2>&1; then
  sudo apt-get install -y software-properties-common
  sudo add-apt-repository -y ppa:valhalla-core/valhalla
  sudo apt-get update
  sudo apt-get install -y valhalla-bin || {
    echo >&2
    echo "No Valhalla package for this release." >&2
    echo >&2
    echo "Two ways on from here:" >&2
    echo "  - build from source: https://valhalla.github.io/valhalla/building/" >&2
    echo "  - or run the container instead: docker compose up -d, from the" >&2
    echo "    directory above this one. The compose file is still there and" >&2
    echo "    reads the same ./data directory these scripts write." >&2
    exit 1
  }
fi

echo "Installed. Next: ./scripts/build-graph.sh"
