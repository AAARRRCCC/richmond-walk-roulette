#!/usr/bin/env bash
# Everything the engine needs, from the Ubuntu archives. Once per machine.
#
# Valhalla is not packaged for Debian or Ubuntu - checked against Launchpad
# rather than assumed - so it runs as the project's own container image. That
# means Docker Engine, which is what a Linux server runs. Docker Desktop is a
# Windows and macOS product and is not involved, here or in WSL.
set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer is for Debian and Ubuntu." >&2
  exit 1
fi

sudo apt-get update
# osmium-tool clips the extract; the other two run the engine.
sudo apt-get install -y osmium-tool curl python3 docker.io docker-compose-v2

sudo systemctl enable --now docker

# So docker works without sudo. Group membership is read at login, so this
# shell will not have it yet; the check below is what tells you when it does.
if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  sudo usermod -aG docker "$USER"
  echo
  echo "Added $USER to the docker group. That takes effect on the next login:"
  echo "  on WSL, run  wsl --shutdown  from PowerShell, reopen Ubuntu, and"
  echo "  run this script again to confirm."
  exit 0
fi

if docker info >/dev/null 2>&1; then
  echo "Docker is working. Next: ./scripts/clip-extract.sh"
else
  echo "Docker is installed but this shell cannot reach the daemon." >&2
  echo "On WSL:  wsl --shutdown  from PowerShell, then reopen Ubuntu." >&2
  exit 1
fi
