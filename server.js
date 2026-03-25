const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const path       = require('path');
const fs         = require('fs');

// ── Session storage (JSON file, 30-day retention) ─────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
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
function pruned(list) {
  const cutoff = Date.now() - RETENTION_MS;
  return list.filter(s => new Date(s.date).getTime() > cutoff);
}

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.redirect('/controller.html'));

// ── Match state ───────────────────────────────────────────────────────────────
let state = {
  home_name:     'HOME',
  away_name:     'AWAY',
  home_score:    0,
  away_score:    0,
  home_color:    '#0a1447',
  away_color:    '#420a0a',
  period:        1,
  total_periods: 2,
  duration_min:  20,
  minute:        0,
  second:        0,
  match_live:    false,
  lang:          'nl',
  events:        [],
  last_event:    null,
  event_seq:     0,
};

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Scoreboard server running on http://0.0.0.0:${PORT}`)
);
