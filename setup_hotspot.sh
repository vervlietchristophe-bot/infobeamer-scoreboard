#!/bin/bash
# ============================================================
#  OrbisEdge Scoreboard — Pi4 WiFi Hotspot Setup
#  Run once on the Pi as root:  sudo bash setup_hotspot.sh
#
#  Result:
#    • Pi broadcasts WiFi network "Scoreboard"
#    • Pi gets static IP 10.0.0.1
#    • Laptop connects to "Scoreboard" → gets IP 10.0.0.x
#    • Open controller.html, enter IP: 10.0.0.1
# ============================================================

set -e

SSID="Scoreboard"
PASS="kickoff2025"       # change this
IFACE="wlan0"            # WiFi interface (wlan0 on Pi4)
PI_IP="10.0.0.1"
DHCP_START="10.0.0.10"
DHCP_END="10.0.0.50"

echo ""
echo "=== Scoreboard Hotspot Setup ==="
echo "  SSID     : $SSID"
echo "  Password : $PASS"
echo "  Pi IP    : $PI_IP"
echo ""

# ── 1. Install required packages ──────────────────────────────────────────────
echo "[1/5] Installing hostapd + dnsmasq..."
apt-get update -q
apt-get install -y hostapd dnsmasq

# ── 2. Stop services while we configure ───────────────────────────────────────
echo "[2/5] Stopping services..."
systemctl stop hostapd  2>/dev/null || true
systemctl stop dnsmasq  2>/dev/null || true
systemctl stop wpa_supplicant 2>/dev/null || true

# Prevent wpa_supplicant from managing wlan0
cat > /etc/wpa_supplicant/wpa_supplicant.conf << WPAEOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=BE
WPAEOF

# ── 3. Static IP for wlan0 ────────────────────────────────────────────────────
echo "[3/5] Setting static IP on $IFACE..."

# Remove any existing wlan0 block from dhcpcd.conf
sed -i '/^interface wlan0/,/^$/d' /etc/dhcpcd.conf

cat >> /etc/dhcpcd.conf << DHCPEOF

interface $IFACE
    static ip_address=$PI_IP/24
    nohook wpa_supplicant
DHCPEOF

# ── 4. Configure dnsmasq (DHCP server) ────────────────────────────────────────
echo "[4/5] Configuring DHCP server (dnsmasq)..."

# Backup original if exists
[ -f /etc/dnsmasq.conf ] && mv /etc/dnsmasq.conf /etc/dnsmasq.conf.bak

cat > /etc/dnsmasq.conf << DNSEOF
interface=$IFACE
dhcp-range=$DHCP_START,$DHCP_END,255.255.255.0,24h
domain=local
address=/scoreboard.local/$PI_IP
DNSEOF

# ── 5. Configure hostapd (access point) ───────────────────────────────────────
echo "[5/5] Configuring access point (hostapd)..."

cat > /etc/hostapd/hostapd.conf << HAPEOF
interface=$IFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$PASS
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
HAPEOF

# Point hostapd at the config file
sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd 2>/dev/null || \
  echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' >> /etc/default/hostapd

# ── Enable & start services ───────────────────────────────────────────────────
systemctl unmask hostapd
systemctl enable hostapd
systemctl enable dnsmasq

echo ""
echo "=== Setup complete. Rebooting in 5 seconds... ==="
echo ""
echo "  After reboot:"
echo "  1. Connect laptop WiFi to: $SSID"
echo "  2. Password: $PASS"
echo "  3. Open controller.html"
echo "  4. Enter Pi IP: $PI_IP  (or hostname: scoreboard.local)"
echo "  5. Enter your info-beamer Node ID"
echo ""

sleep 5
reboot
