const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const os         = require('os');
const path       = require('path');
const fs         = require('fs');

// ── Session storage (JSON file, 30-day retention) ─────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const ADS_FILE      = path.join(DATA_DIR, 'ads.json');
const RETENTION_MS  = 30 * 24 * 60 * 60 * 1000;

function loadSessions() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch { return []; }
}
function saveSessions(list) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2));
}
function loadAds() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(ADS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ADS_FILE, 'utf8'));
  } catch { return []; }
}
function saveAds(list) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ADS_FILE, JSON.stringify(list, null, 2));
}
function pruned(list) {
  const cutoff = Date.now() - RETENTION_MS;
  return list.filter(s => new Date(s.date).getTime() > cutoff);
}

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/controller.html'));

// ── Match state ───────────────────────────────────────────────────────────────
let state = {
  home_name:        'HOME',
  away_name:        'AWAY',
  home_score:       0,
  away_score:       0,
  home_color:       '#0a1447',
  away_color:       '#420a0a',
  home_text_color:  null,
  away_text_color:  null,
  text_font:        null,
  period:           1,
  total_periods:    2,
  duration_min:     20,
  minute:           0,
  second:           0,
  match_live:       false,
  lang:             'nl',
  events:           [],
  last_event:       null,
  event_seq:        0,
  ads:              [],
  ad_auto:          false,
  ad_interval_sec:  60,
  current_ad:       null,
};

state.ads = loadAds();

// ── Server-side clock ─────────────────────────────────────────────────────────
let clockInterval = null;

function startClock() {
  if (clockInterval) return;
  clockInterval = setInterval(() => {
    state.second++;
    if (state.second >= 60) { state.second = 0; state.minute++; }
    if (state.minute >= state.duration_min) {
      state.minute    = state.duration_min;
      state.second    = 0;
      state.match_live = false;
      stopClock();
    }
    broadcast(state);
  }, 1000);
}

function stopClock() {
  clearInterval(clockInterval);
  clockInterval = null;
}

// ── Broadcast to all connected clients ───────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify({ type: 'state', data });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// ── Ad scheduling ────────────────────────────────────────────────────────────
let adRotationIdx = 0;
let adClearTimer  = null;

function showAd(ad) {
  if (!ad) return;
  const dur = Math.max(3, Math.min(60, ad.duration_sec || 15));
  state.current_ad = {
    id:           ad.id,
    text:         ad.text || '',
    image:        ad.image || null,
    duration_sec: dur,
    started_at:   Date.now(),
  };
  broadcast(state);
  clearTimeout(adClearTimer);
  adClearTimer = setTimeout(() => {
    state.current_ad = null;
    broadcast(state);
  }, dur * 1000);
}

setInterval(() => {
  if (!state.ad_auto || state.current_ad || state.ads.length === 0) return;
  const interval = Math.max(10, state.ad_interval_sec || 60);
  // Rotate through ads at the configured interval. Use a separate counter so
  // adding/removing ads doesn't change the rotation cadence.
  if (!showAd._lastAt) showAd._lastAt = 0;
  if (Date.now() - showAd._lastAt < interval * 1000) return;
  showAd._lastAt = Date.now();
  const ad = state.ads[adRotationIdx % state.ads.length];
  adRotationIdx = (adRotationIdx + 1) % Math.max(1, state.ads.length);
  showAd(ad);
}, 1000);

// ── WebSocket handler ─────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', data: state }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'update') {
        state = { ...state, ...msg.data };
        broadcast(state);
      }

      if (msg.type === 'command') {
        switch (msg.action) {
          case 'start':
            state.match_live = true;
            startClock();
            break;
          case 'stop':
            state.match_live = false;
            stopClock();
            break;
          case 'reset_clock':
            state.match_live = false;
            state.minute     = 0;
            state.second     = 0;
            stopClock();
            break;
          case 'set_time':
            state.minute = Math.min(state.duration_min, Math.max(0, msg.minute || 0));
            state.second = Math.min(59, Math.max(0, msg.second || 0));
            break;
          case 'reset_match':
            state.home_score = 0;
            state.away_score = 0;
            state.period     = 1;
            state.minute     = 0;
            state.second     = 0;
            state.match_live = false;
            state.events     = [];
            state.last_event = null;
            state.event_seq  = 0;
            stopClock();
            break;
          case 'add_event': {
            const evt = {
              type:   msg.event_type,
              team:   msg.team,
              player: msg.player || '',
              minute: msg.minute || 0,
              seq:    ++state.event_seq,
            };
            state.events     = [evt, ...state.events].slice(0, 100);
            state.last_event = evt;
            break;
          }
          case 'clear_events':
            state.events     = [];
            state.last_event = null;
            break;
          case 'show_ad': {
            const ad = state.ads.find(a => a.id === msg.id);
            if (ad) showAd(ad);
            return;
          }
          case 'stop_ad':
            clearTimeout(adClearTimer);
            state.current_ad = null;
            break;
          case 'ad_settings':
            if (typeof msg.auto === 'boolean') state.ad_auto = msg.auto;
            if (typeof msg.interval_sec === 'number') {
              state.ad_interval_sec = Math.max(10, Math.min(3600, msg.interval_sec));
            }
            // Reset cadence so a toggle takes effect immediately on next tick.
            showAd._lastAt = 0;
            break;
        }
        broadcast(state);
      }
    } catch {}
  });

  ws.on('error', () => {});
});

// ── HTTP fallback (optional direct POST) ─────────────────────────────────────
app.get('/api/state',  (_req, res) => res.json(state));
app.post('/api/state', (req, res) => {
  state = { ...state, ...req.body };
  broadcast(state);
  res.json({ ok: true });
});

// ── Sessions REST API ─────────────────────────────────────────────────────────
app.get('/api/sessions', (_req, res) => {
  const list = pruned(loadSessions());
  saveSessions(list);
  res.json(list);
});

app.post('/api/sessions', (_req, res) => {
  let list = pruned(loadSessions());
  const session = {
    id:            Date.now().toString(),
    date:          new Date().toISOString(),
    home_name:     state.home_name,
    home_color:    state.home_color,
    home_score:    state.home_score,
    away_name:     state.away_name,
    away_color:    state.away_color,
    away_score:    state.away_score,
    total_periods: state.total_periods,
    duration_min:  state.duration_min,
    events:        [...state.events],
  };
  list = [session, ...list];
  saveSessions(list);
  res.json({ ok: true, session });
});

app.delete('/api/sessions/:id', (req, res) => {
  let list = loadSessions().filter(s => s.id !== req.params.id);
  saveSessions(list);
  res.json({ ok: true });
});

// ── Ads REST API ──────────────────────────────────────────────────────────────
function sanitizeAd(input, existingId) {
  return {
    id:           existingId || Date.now().toString(),
    text:         (input.text || '').slice(0, 200),
    image:        typeof input.image === 'string' && input.image.startsWith('data:image/')
                  ? input.image.slice(0, 4 * 1024 * 1024)
                  : null,
    duration_sec: Math.max(3, Math.min(60, parseInt(input.duration_sec) || 15)),
  };
}

app.post('/api/ads', (req, res) => {
  const ad = sanitizeAd(req.body || {});
  state.ads = [...state.ads, ad];
  saveAds(state.ads);
  broadcast(state);
  res.json({ ok: true, ad });
});

app.put('/api/ads/:id', (req, res) => {
  const idx = state.ads.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false });
  state.ads = state.ads.map((a, i) =>
    i === idx ? sanitizeAd({ ...a, ...(req.body || {}) }, a.id) : a
  );
  saveAds(state.ads);
  broadcast(state);
  res.json({ ok: true, ad: state.ads[idx] });
});

app.delete('/api/ads/:id', (req, res) => {
  state.ads = state.ads.filter(a => a.id !== req.params.id);
  saveAds(state.ads);
  if (state.current_ad && state.current_ad.id === req.params.id) {
    clearTimeout(adClearTimer);
    state.current_ad = null;
  }
  broadcast(state);
  res.json({ ok: true });
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('');
  console.log('==========================================================');
  console.log('  Scoreboard server ready');
  console.log('----------------------------------------------------------');
  console.log(`  Display (open on HDMI)    : http://localhost:${PORT}/display.html`);
  console.log(`  Controller (this laptop)  : http://localhost:${PORT}/controller.html`);
  if (ips.length) {
    console.log('');
    console.log('  Controller from phone / tablet (same Wi-Fi):');
    for (const ip of ips) console.log(`    http://${ip}:${PORT}/controller.html`);
  }
  console.log('==========================================================');
  console.log('');
});
