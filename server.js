const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const path       = require('path');
const fs         = require('fs');
const { execFile } = require('child_process');

// ── Session storage (JSON file, 30-day retention) ─────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const LOGOS_DIR     = path.join(DATA_DIR, 'logos');
const SPONSORS_DIR  = path.join(DATA_DIR, 'sponsors');
const RETENTION_MS  = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const MIME_EXT = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/gif':     'gif',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
};

function ensureLogosDir() {
  if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });
}
function findLogoFile(team) {
  ensureLogosDir();
  return fs.readdirSync(LOGOS_DIR).find(f => f.startsWith(team + '.'));
}
function deleteLogosFor(team) {
  ensureLogosDir();
  for (const f of fs.readdirSync(LOGOS_DIR)) {
    if (f.startsWith(team + '.')) {
      try { fs.unlinkSync(path.join(LOGOS_DIR, f)); } catch {}
    }
  }
}
function logoUrlFor(team) {
  const f = findLogoFile(team);
  return f ? `/logos/${f}?v=${Date.now()}` : '';
}

function ensureSponsorsDir() {
  if (!fs.existsSync(SPONSORS_DIR)) fs.mkdirSync(SPONSORS_DIR, { recursive: true });
}
function listSponsors() {
  ensureSponsorsDir();
  const tag = Date.now();
  return fs.readdirSync(SPONSORS_DIR)
    .filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f))
    .sort()
    .map(f => ({ id: f, url: `/sponsors/${encodeURIComponent(f)}?v=${tag}` }));
}

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

app.use(express.json({ limit: '2mb' }));

// Static files. We disable caching for HTML pages and the build zip so that
// updates show up immediately for both the Chrome kiosk and anyone re-using
// the /download.html page. Other assets (fonts, images) cache normally.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') ||
        filePath.endsWith('.zip')  ||
        filePath.includes(`${path.sep}downloads${path.sep}`)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

ensureLogosDir();
ensureSponsorsDir();
app.use('/logos',    express.static(LOGOS_DIR,    { maxAge: 0 }));
app.use('/sponsors', express.static(SPONSORS_DIR, { maxAge: 0 }));
app.get('/', (_req, res) => res.redirect('/controller.html'));

// ── Match state ───────────────────────────────────────────────────────────────
let state = {
  home_name:     'HOME',
  away_name:     'AWAY',
  home_score:    0,
  away_score:    0,
  home_color:    '#0a1447',
  away_color:    '#420a0a',
  home_logo:     '',
  away_logo:     '',
  home_show_name: true,
  away_show_name: true,
  home_name_color: '',
  away_name_color: '',
  name_size:       8,
  show_timer:      true,
  clock_size:      18,
  sponsors:        [],
  sponsor_enabled:          false,
  sponsor_interval:         30,
  sponsor_duration:         8,
  sponsor_only_when_paused: true,
  sponsor_trigger: 0,
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

// Restore any persisted logos and sponsors on startup
state.home_logo = logoUrlFor('home');
state.away_logo = logoUrlFor('away');
state.sponsors  = listSponsors();

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
          case 'show_sponsor':
            state.sponsor_trigger = (state.sponsor_trigger || 0) + 1;
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
    home_logo:     state.home_logo,
    home_score:    state.home_score,
    away_name:     state.away_name,
    away_color:    state.away_color,
    away_logo:     state.away_logo,
    away_score:    state.away_score,
    total_periods: state.total_periods,
    duration_min:  state.duration_min,
    events:        [...state.events],
  };
  list = [session, ...list];
  saveSessions(list);
  res.json({ ok: true, session });
});

// ── Logo upload / delete ──────────────────────────────────────────────────────
app.post('/api/logo/:team', (req, res) => {
  const team = req.params.team;
  if (team !== 'home' && team !== 'away') {
    return res.status(400).json({ error: 'invalid team' });
  }
  const dataUrl = req.body && req.body.data;
  if (typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'missing data' });
  }
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'invalid data url' });
  const mime = m[1].toLowerCase();
  const ext  = MIME_EXT[mime];
  if (!ext) return res.status(400).json({ error: 'unsupported image type' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0)               return res.status(400).json({ error: 'empty image' });
  if (buf.length > MAX_LOGO_BYTES)    return res.status(413).json({ error: 'image too large' });

  deleteLogosFor(team);
  ensureLogosDir();
  fs.writeFileSync(path.join(LOGOS_DIR, team + '.' + ext), buf);
  state[team + '_logo'] = `/logos/${team}.${ext}?v=${Date.now()}`;
  broadcast(state);
  res.json({ ok: true, url: state[team + '_logo'] });
});

app.delete('/api/logo/:team', (req, res) => {
  const team = req.params.team;
  if (team !== 'home' && team !== 'away') {
    return res.status(400).json({ error: 'invalid team' });
  }
  deleteLogosFor(team);
  state[team + '_logo'] = '';
  broadcast(state);
  res.json({ ok: true });
});

// ── Sponsors (multi-image rotation) ──────────────────────────────────────────
app.post('/api/sponsors', (req, res) => {
  const dataUrl = req.body && req.body.data;
  if (typeof dataUrl !== 'string') return res.status(400).json({ error: 'missing data' });
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'invalid data url' });
  const ext = MIME_EXT[m[1].toLowerCase()];
  if (!ext) return res.status(400).json({ error: 'unsupported image type' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0)            return res.status(400).json({ error: 'empty image' });
  if (buf.length > MAX_LOGO_BYTES) return res.status(413).json({ error: 'image too large' });

  ensureSponsorsDir();
  const rawName = (req.body && req.body.name) ? String(req.body.name) : 'sponsor';
  const safe    = rawName.replace(/[^\w-]+/g, '_').slice(0, 40) || 'sponsor';
  const id      = `${Date.now()}-${safe}.${ext}`;
  fs.writeFileSync(path.join(SPONSORS_DIR, id), buf);
  state.sponsors = listSponsors();
  broadcast(state);
  res.json({ ok: true, id });
});

app.delete('/api/sponsors/:id', (req, res) => {
  const id = req.params.id;
  // strict allow-list for filenames (server-generated)
  if (!/^[\w.-]+$/.test(id)) return res.status(400).json({ error: 'bad id' });
  try { fs.unlinkSync(path.join(SPONSORS_DIR, id)); } catch {}
  state.sponsors = listSponsors();
  broadcast(state);
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', (req, res) => {
  let list = loadSessions().filter(s => s.id !== req.params.id);
  saveSessions(list);
  res.json({ ok: true });
});

// ── Portable-build self-download ─────────────────────────────────────────────
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');
const PORTABLE_ZIP  = path.join(DOWNLOADS_DIR, 'scoreboard-portable.zip');
const BUILD_SCRIPT  = path.join(__dirname, 'tools', 'build-portable.ps1');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function buildPortableZip() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BUILD_SCRIPT)) {
      return reject(new Error('build script missing: ' + BUILD_SCRIPT));
    }
    execFile(
      'powershell.exe',
      ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', BUILD_SCRIPT],
      { timeout: 90_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).trim()));
        resolve((stdout || '').trim());
      }
    );
  });
}

app.get('/api/build-info', (_req, res) => {
  if (!fs.existsSync(PORTABLE_ZIP)) return res.json({ exists: false });
  const st = fs.statSync(PORTABLE_ZIP);
  res.json({ exists: true, size: st.size, mtime: st.mtimeMs });
});

app.post('/api/rebuild', async (_req, res) => {
  try {
    const out = await buildPortableZip();
    res.json({ ok: true, message: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Best-effort initial build at startup (non-blocking).
if (!fs.existsSync(PORTABLE_ZIP)) {
  buildPortableZip()
    .then(out => console.log('[build] portable zip ready:', out))
    .catch(err => console.warn('[build] could not create portable zip:', err.message));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Scoreboard server running on http://0.0.0.0:${PORT}`)
);
