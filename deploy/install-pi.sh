#!/bin/sh
# Sets the board up on a Raspberry Pi running Raspberry Pi OS with a desktop.
# Run it once from the project folder: sh deploy/install-pi.sh
set -e
FOLDER=$(pwd)
ME=$(id -un)

if [ ! -f server.mjs ]; then
  echo "Run this from the project folder." >&2
  exit 1
fi

# Node 22 or newer is needed for import.meta.dirname and the built-in fetch. Raspberry Pi OS
# ships an older one, so this adds NodeSource's packages, which have 22.
MAJOR=0
if command -v node >/dev/null; then MAJOR=$(node -p "process.versions.node.split('.')[0]"); fi
if [ "$MAJOR" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 22 ]; then
  echo "Node $MAJOR is still too old. Install Node 22 or newer, then run this again." >&2
  exit 1
fi

# The board dims itself at night, so the Pi's own screen blanking is turned off.
if command -v raspi-config >/dev/null; then sudo raspi-config nonint do_blanking 1 || true; fi

npm ci --omit=dev

# The server, from power-on
sed -e "s|USER|$ME|" -e "s|FOLDER|$FOLDER|" deploy/home-board.service \
  | sudo tee /etc/systemd/system/home-board.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now home-board

# The screen, once the desktop has started
chmod +x deploy/kiosk.sh
mkdir -p "$HOME/.config/labwc"
AUTOSTART="$HOME/.config/labwc/autostart"
touch "$AUTOSTART"
grep -q "deploy/kiosk.sh" "$AUTOSTART" || echo "\"$FOLDER/deploy/kiosk.sh\" &" >> "$AUTOSTART"

echo "Done. Restart the Pi and the board should open by itself:"
echo "  sudo reboot"
