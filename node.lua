-- ============================================================
--  Soccer Scoreboard  –  node.lua  [512×128]
--  Supports: 2 halves OR 4 quarters, any duration per period
--  State pushed from controller.html via info-beamer data API
-- ============================================================

local json = require "json"

local W, H = 512, 128

-- ── State (mirrors controller) ────────────────────────────────────────────────
local S = {
    home_name     = "HOME",
    away_name     = "AWAY",
    home_score    = 0,
    away_score    = 0,
    period        = 1,
    total_periods = 2,
    duration_min  = 20,
    minute        = 0,
    second        = 0,
    match_live    = false,
    updated       = 0,
}

function node.data_triggered(path, data)
    local ok, obj = pcall(json.decode, data)
    if not ok then return end
    for k, v in pairs(obj) do S[k] = v end
    S.updated = sys.now()
end

-- ── Font ─────────────────────────────────────────────────────────────────────
local fnt_ok, fnt = pcall(resource.load_font, "font.ttf")
if not fnt_ok then fnt = resource.load_font() end

-- ── Helpers ───────────────────────────────────────────────────────────────────
local function fill(x, y, w, h, r, g, b, a)
    resource.create_colored_texture(r, g, b, a or 1):draw(x, y, x+w, y+h)
end
local function cwrite(size, text, y, r, g, b)
    local tw = fnt:width(text, size)
    fnt:write((W-tw)/2, y, text, size, r, g, b, 1)
end
local function rwrite(size, text, rx, y, r, g, b)
    fnt:write(rx - fnt:width(text, size), y, text, size, r, g, b, 1)
end
local function lwrite(size, text, x, y, r, g, b)
    fnt:write(x, y, text, size, r, g, b, 1)
end
local function fit(text, size, max_w)
    while #text > 1 and fnt:width(text, size) > max_w do text = text:sub(1,-2) end
    return text
end
local function pad2(n) return string.format("%02d", n) end

-- ── Period label ──────────────────────────────────────────────────────────────
local function period_short(p, total)
    if total == 2 then return p == 1 and "H1" or "H2" end
    if total == 4 then return "Q"..p end
    return "P"..p
end
local function period_long(p, total)
    if total == 2 then return p == 1 and "1st Half" or "2nd Half" end
    if total == 4 then return "Quarter "..p end
    return "Period "..p
end

-- ── Layout ────────────────────────────────────────────────────────────────────
local CENTRE_W = 100
local TEAM_W   = (W - CENTRE_W) / 2   -- 206
local CX       = TEAM_W
local BAR_H    = 17
local BODY_H   = H - BAR_H            -- 111

local SZ = { score=72, name=13, plabel=13, status=10, clock=16, remain=9, bar=11 }

local BG_HOME   = {0.04,0.08,0.28}
local BG_AWAY   = {0.26,0.04,0.04}
local BG_CENTRE = {0.07,0.07,0.09}
local BG_BAR    = {0.04,0.04,0.06}
local WHITE     = {1.00,1.00,1.00}
local GOLD      = {1.00,0.78,0.10}
local GREEN     = {0.15,0.88,0.35}
local MUTED     = {0.40,0.40,0.46}
local DOT_ON    = {1.00,0.78,0.10}
local DOT_OFF   = {0.22,0.22,0.28}

-- ── Render ────────────────────────────────────────────────────────────────────
function node.render()
    gl.clear(0,0,0,1)

    -- Panels
    fill(0,   0, TEAM_W,   BODY_H, table.unpack(BG_HOME))
    fill(CX,  0, CENTRE_W, BODY_H, table.unpack(BG_CENTRE))
    fill(CX+CENTRE_W, 0, TEAM_W, BODY_H, table.unpack(BG_AWAY))
    fill(0, BODY_H, W, BAR_H, table.unpack(BG_BAR))

    -- Team names
    local hn = fit(string.upper(S.home_name), SZ.name, TEAM_W-8)
    local an = fit(string.upper(S.away_name), SZ.name, TEAM_W-8)
    rwrite(SZ.name, hn, CX-4,          3, table.unpack(MUTED))
    lwrite(SZ.name, an, CX+CENTRE_W+4, 3, table.unpack(MUTED))

    -- Scores
    local sy = (BODY_H - SZ.score) / 2 + 4
    rwrite(SZ.score, tostring(S.home_score), CX-6,          sy, table.unpack(WHITE))
    lwrite(SZ.score, tostring(S.away_score), CX+CENTRE_W+6, sy, table.unpack(WHITE))

    -- Centre: period label
    local plbl = period_short(S.period, S.total_periods)
    cwrite(SZ.plabel, plbl, 3, table.unpack(GOLD))

    -- Live / Paused
    if S.match_live then
        cwrite(SZ.status, "LIVE",   19, table.unpack(GREEN))
    else
        cwrite(SZ.status, "PAUSED", 19, table.unpack(MUTED))
    end

    -- Clock
    local clock = pad2(S.minute)..":"..pad2(S.second)
    cwrite(SZ.clock, clock, 36, table.unpack(WHITE))

    -- Remaining
    local rem = math.max(0, S.duration_min*60 - (S.minute*60 + S.second))
    local rm  = math.floor(rem/60)
    local rs  = rem % 60
    local rem_txt = rem == 0 and "Time!" or (rm > 0 and (rm.."m left") or (rs.."s left"))
    cwrite(SZ.remain, rem_txt, 58, table.unpack(MUTED))

    -- Status bar: progress dots
    local total = S.total_periods
    local dot_w = 8
    local dot_gap = total <= 2 and 8 or 5
    local dot_block = total * dot_w + (total-1) * dot_gap
    local dot_x0 = 8
    local by = BODY_H + 4
    for i = 1, total do
        local dx = dot_x0 + (i-1) * (dot_w + dot_gap)
        local col = i <= S.period and DOT_ON or DOT_OFF
        fill(dx, by, dot_w, dot_w, table.unpack(col))
    end

    -- Period name right
    local plong = period_long(S.period, S.total_periods)
    if not S.match_live and S.minute == 0 and S.second == 0 and S.period > 1 then
        plong = "Break"
    end
    rwrite(SZ.bar, plong, W-6, BODY_H+4, table.unpack(MUTED))

    -- Stale signal warning
    if S.match_live and S.updated > 0 and (sys.now() - S.updated) > 15 then
        cwrite(SZ.bar, "no signal", BODY_H+4, 0.9, 0.3, 0.2)
    end
end