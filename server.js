const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const path       = require('path');

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
  period:        1,
  total_periods: 2,
  duration_min:  20,
  minute:        0,
  second:        0,
  match_live:    false,
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
            stopClock();
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Scoreboard server running on http://0.0.0.0:${PORT}`)
);
