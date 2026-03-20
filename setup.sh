#!/bin/bash
# ============================================================
#  Scoreboard — Raspberry Pi OS Setup Script
#  Run once as root:  sudo bash setup.sh
#
#  What this does:
#    1. Installs Node.js 20 + npm
#    2. Installs project dependencies (npm install)
#    3. Creates systemd service (auto-start on boot)
#    4. Sets up Chromium kiosk on HDMI (auto-start on boot)
#    5. Disables screen blanking / screensaver
#    6. Enables autologin for user 'pi'
#    7. Installs cloudflared for remote tunnel
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTUAL_USER="${SUDO_USER:-$(logname)}"
USER_HOME="/home/$ACTUAL_USER"
SERVICE_USER="$ACTUAL_USER"

echo ""
echo "=== Scoreboard Pi Setup ==="
echo "  Project dir : $PROJECT_DIR"
echo ""

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -q
apt-get install -y curl unclutter chromium

# ── 2. Node.js 20 via NodeSource ──────────────────────────────────────────────
echo "[2/7] Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "  Node $(node -v), npm $(npm -v)"

# ── 3. npm install ────────────────────────────────────────────────────────────
echo "[3/7] Installing project dependencies..."
cd "$PROJECT_DIR"
npm install --omit=dev

# ── 4. Systemd service for Node.js server ─────────────────────────────────────
echo "[4/7] Creating systemd service..."
cat > /etc/systemd/system/scoreboard.service << EOF
[Unit]
Description=Scoreboard Node.js Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable scoreboard
systemctl restart scoreboard
echo "  Scoreboard service started."

# ── 5. Chromium kiosk autostart ───────────────────────────────────────────────
echo "[5/7] Setting up Chromium kiosk display..."

AUTOSTART_DIR="$USER_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/scoreboard-display.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Scoreboard Display
Exec=bash -c 'sleep 8 && chromium --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state --no-first-run --disable-translate --check-for-update-interval=31536000 --disable-features=TranslateUI http://localhost:3000/display'
X-GNOME-Autostart-enabled=true
EOF

# Disable screensaver / blanking
cat > "$AUTOSTART_DIR/disable-screensaver.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Disable Screensaver
Exec=bash -c 'xset s off && xset s noblank && xset -dpms'
X-GNOME-Autostart-enabled=true
EOF

# Hide mouse cursor when idle
cat > "$AUTOSTART_DIR/unclutter.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Hide Cursor
Exec=unclutter -idle 1 -root
X-GNOME-Autostart-enabled=true
EOF

chown -R "$ACTUAL_USER:$ACTUAL_USER" "$AUTOSTART_DIR"
echo "  Kiosk autostart configured."

# ── 6. Autologin for pi user ──────────────────────────────────────────────────
echo "[6/7] Enabling autologin..."
raspi-config nonint do_boot_behaviour B4 2>/dev/null || \
  echo "  (run 'sudo raspi-config' → System → Boot → Desktop Autologin if needed)"

# ── 7. cloudflared ────────────────────────────────────────────────────────────
echo "[7/7] Installing cloudflared..."
ARCH=$(uname -m)
if [[ "$ARCH" == "aarch64" ]]; then
  CF_DEB="cloudflared-linux-arm64.deb"
elif [[ "$ARCH" == "armv7l" ]]; then
  CF_DEB="cloudflared-linux-arm.deb"
else
  CF_DEB="cloudflared-linux-amd64.deb"
fi

curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_DEB" \
  -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb || true
rm /tmp/cloudflared.deb
echo "  cloudflared $(cloudflared --version 2>&1 | head -1) installed."

echo ""
echo "=== Setup complete! ==="
echo ""
echo "  Next steps — Cloudflare Tunnel:"
echo "  1. On THIS Pi, run:  cloudflared tunnel login"
echo "     (opens a browser URL — paste it on your laptop to authorize)"
echo "  2. cloudflared tunnel create scoreboard"
echo "  3. cloudflared tunnel route dns scoreboard scorebord.nextphase.be"
echo "  4. sudo cloudflared service install"
echo "  5. sudo systemctl start cloudflared"
echo ""
echo "  Then visit https://scorebord.nextphase.be from any device!"
echo ""
echo "  Rebooting in 10 seconds..."
sleep 10
reboot
