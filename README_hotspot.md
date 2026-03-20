# Pi4 WiFi Hotspot Setup — Scoreboard

## What this does

The Pi4 broadcasts its **own WiFi network** called `Scoreboard`.
Your laptop connects to it directly — no router, no internet needed.

```
[ Laptop ]──WiFi──[ Pi4 "Scoreboard" hotspot ]──HDMI──[ Screen ]
              10.0.0.x        10.0.0.1
```

---

## One-time setup on the Pi

Copy `setup_hotspot.sh` to the Pi and run it as root:

```bash
# On your laptop — copy the script to the Pi (Pi must be on same network first)
scp setup_hotspot.sh pi@<current-pi-ip>:~

# SSH into the Pi
ssh pi@<current-pi-ip>

# Run the setup (takes ~2 minutes)
sudo bash setup_hotspot.sh
```

The Pi will reboot automatically when done.

---

## After reboot — every match day

| Step | Action |
|---|---|
| 1 | Power on the Pi |
| 2 | On your laptop: connect WiFi to **Scoreboard** |
| 3 | WiFi password: **kickoff2025** |
| 4 | Open `controller.html` in your browser |
| 5 | Pi IP field: **10.0.0.1** |
| 6 | Node ID: your info-beamer node ID |
| 7 | Click **Test** → should go green |

You can also use the hostname `scoreboard.local` instead of `10.0.0.1`
(works on most laptops without any extra config).

---

## Changing the WiFi name or password

Edit `/etc/hostapd/hostapd.conf` on the Pi:

```bash
sudo nano /etc/hostapd/hostapd.conf
```

Change `ssid=` and/or `wpa_passphrase=`, then restart:

```bash
sudo systemctl restart hostapd
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Laptop connects but can't reach Pi | Try `ping 10.0.0.1` — if no response, run `sudo systemctl restart hostapd dnsmasq` on Pi |
| "Scoreboard" network not visible | Check `sudo systemctl status hostapd` on Pi |
| info-beamer not responding | Confirm info-beamer is running: `sudo systemctl status info-beamer` |
| Need internet on Pi too | Plug an ethernet cable into the Pi — it will have internet via eth0 while broadcasting WiFi |

---

## Network details

| Item | Value |
|---|---|
| SSID | `Scoreboard` |
| Password | `kickoff2025` |
| Pi IP | `10.0.0.1` |
| Laptop gets IP | `10.0.0.10` – `10.0.0.50` |
| Hostname | `scoreboard.local` |
| Channel | 6 (2.4 GHz) |

