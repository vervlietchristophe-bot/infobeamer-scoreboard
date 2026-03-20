# Scorebord — info-beamer Live Scoreboard

Live soccer/sports scoreboard for a 512×128 LED wall, driven by a Raspberry Pi 4 running [info-beamer](https://info-beamer.com/).

```
[ Laptop ]──WiFi──[ Pi4 "Scoreboard" hotspot ]──HDMI──[ LED wall ]
              10.0.0.x        10.0.0.1
```

## Files

| File | Purpose |
|---|---|
| `node.lua` | info-beamer display script (runs on Pi, 512×128 px) |
| `package.json` | info-beamer package descriptor |
| `controller.html` | Web controller — open on laptop to control the scoreboard |
| `setup_hotspot.sh` | One-time Pi WiFi hotspot setup script |
| `README_hotspot.md` | Hotspot setup & usage guide |

## Quick start

1. Run `setup_hotspot.sh` once on the Pi (see `README_hotspot.md`)
2. On match day: connect laptop WiFi to **Scoreboard** (password: `kickoff2025`)
3. Open `controller.html` in your browser
4. Enter Pi IP `10.0.0.1` and your info-beamer Node ID → click **Test**
5. Set team names, match format, and go

## Display layout

```
┌──────────────────────────────────────────────────────────────────┐
│  HOME NAME          H1 / LIVE          AWAY NAME                 │
│                     00:00                                        │
│       0          20m left          0                             │
├──────────────────────────────────────────────────────────────────┤
│  ● ●                                        1st Half             │
└──────────────────────────────────────────────────────────────────┘
```

Supports 2 halves or 4 quarters, configurable period duration.
