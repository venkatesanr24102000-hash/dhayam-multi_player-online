'use strict';
/* Dhayam multiplayer server: static files + WebSocket rooms.
   - Serves the game (index.html, css/, js/, assets/) over HTTP on process.env.PORT (Render sets it).
   - /ws        WebSocket endpoint for rooms, players and spectators.
   - /healthz   health check for Render.
   The server is authoritative: dice are rolled here, every move is validated here with the game's own rules.js,
   and the resulting state is broadcast to every player and spectator in the room. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createGame } = require('./engine');

const ROOT = path.join(__dirname, '..');
const PORT = +process.env.PORT || 8000;
const GRACE_MS = +process.env.RECONNECT_GRACE_MS || 4 * 60 * 1000;   // a disconnected player's seat is held for 4 minutes
const ROLL_MS = +process.env.ROLL_MS || 1150;                        // time the dice animation runs before the result is applied
const MAX_SPEC = +process.env.MAX_SPECTATORS || 10;
const MAX_ROOMS = +process.env.MAX_ROOMS || 500;
const ROOM_MAX_AGE = 12 * 3600 * 1000;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/* ---------------------------------------------------------------- static files */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const PUBLIC = /^\/(index\.html|sw\.js|manifest\.webmanifest|css\/[\w.-]+|js\/[\w.-]+|assets\/[\w./-]+)$/;

function serveStatic(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p.includes('..') || !PUBLIC.test(p)) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(ROOT, p);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'ETag': etag, 'Cache-Control': 'no-cache' };
    if (p === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
});

/* ---------------------------------------------------------------- rooms */
const rooms = new Map();
const rid = n => crypto.randomBytes(n).toString('hex');
const clean = s => String(s == null ? '' : s).replace(/[<>&"'`\\\u0000-\u001f]/g, '').trim().slice(0, 12);
const validTok = t => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);
const log = (...a) => console.log(new Date().toISOString(), ...a);

function newCode() {
  for (let k = 0; k < 50; k++) {
    const c = Array.from({ length: 5 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
    if (!rooms.has(c)) return c;
  }
  return null;
}

function createRoom(n) {
  const code = newCode();
  if (!code) return null;
  const room = { code, n, host: null, started: false, members: new Map(), byTok: new Map(), timers: new Set(), game: null, created: Date.now(), seq: 0 };
  rooms.set(code, room);
  return room;
}

function send(ws, str) { if (ws && ws.readyState === 1) { try { ws.send(str); } catch (e) { /* socket closing */ } } }
const J = o => JSON.stringify(o);

function teamList(room, t) { return [...room.members.values()].filter(m => m.team === t); }

function roomInfo(room, you) {
  const now = Date.now();
  return J({
    t: 'room', code: room.code, n: room.n, started: room.started, host: room.host, you, maxSpec: MAX_SPEC, grace: GRACE_MS,
    members: [...room.members.values()].sort((a, b) => a.jt - b.jt).map(m => ({
      pid: m.pid, name: m.name, team: m.team, online: m.online, gone: !!m.gone,
      remain: m.online || !m.deadline ? 0 : Math.max(0, m.deadline - now),
    })),
  });
}
function bcastRoom(room) { for (const m of room.members.values()) if (m.online) send(m.ws, roomInfo(room, m.pid)); }
function bcastState(room, str) { const s = '{"t":"state","st":' + str + '}'; for (const m of room.members.values()) if (m.online) send(m.ws, s); }

function destroyRoom(room, msg) {
  if (!rooms.has(room.code)) return;
  rooms.delete(room.code);
  room.timers.forEach(clearTimeout); room.timers.clear();
  for (const m of room.members.values()) {
    if (m.timer) clearTimeout(m.timer);
    if (m.ws) { if (msg) send(m.ws, J({ t: 'closed', msg })); m.ws.roomRef = null; }
  }
  log('room closed', room.code);
}

function pickHost(room) {
  const cur = room.members.get(room.host);
  if (cur && cur.online) return;
  const c = [...room.members.values()].filter(m => m.online).sort((a, b) => (a.team < 0) - (b.team < 0) || a.jt - b.jt)[0];
  if (c) room.host = c.pid;
}

function removeMember(room, m) {
  if (m.timer) { clearTimeout(m.timer); m.timer = null; }
  room.members.delete(m.pid);
  room.byTok.delete(m.tok);
  if (m.ws && m.ws.roomRef === room) m.ws.roomRef = null;
  if (!room.members.size) return destroyRoom(room);
  pickHost(room);
  bcastRoom(room);
}

/* Is anybody still connected to the room? */
function anyOnline(room) { for (const m of room.members.values()) if (m.online) return true; return false; }
function playersOnline(room) { for (const m of room.members.values()) if (m.online && m.team >= 0 && !m.gone) return true; return false; }

function expire(room, m) {
  m.timer = null;
  if (m.online || room.members.get(m.pid) !== m) return;
  const g = room.game;
  if (!room.started || m.team < 0 || m.gone || (g && g.over())) {            // lobby / spectator / finished game: free the seat
    if (!room.started && !anyOnline(room)) return destroyRoom(room);
    return removeMember(room, m);
  }
  if (!playersOnline(room)) {                                             // nobody to continue with: keep waiting, close the room if everybody timed out
    m.expired = true;
    return checkAbandoned(room);
  }
  applyGone(room, m);
}

function applyGone(room, m) {
  m.gone = true; m.expired = false;
  room.game.leave(m.pid);                                                 // pushes the new state to everyone
  checkFinished(room);
  bcastRoom(room);
  log('seat released after grace', room.code, m.name);
}

function checkAbandoned(room) {
  if (playersOnline(room)) return;
  const pend = [...room.members.values()].filter(m => m.team >= 0 && !m.gone && !m.online);
  if (pend.length && pend.every(m => m.expired)) destroyRoom(room, 'All players were disconnected for too long. The room was closed.');
}

function checkFinished(room) { /* nothing to persist; finished rooms are cleaned when everyone left */ }

function startGrace(room, m) {
  m.online = false; m.ws = null; m.deadline = Date.now() + GRACE_MS; m.expired = false;
  if (m.timer) clearTimeout(m.timer);
  m.timer = setTimeout(() => expire(room, m), GRACE_MS);
}

function onSocketClosed(ws) {
  const room = ws.roomRef, pid = ws.pid;
  if (!room || !rooms.has(room.code)) return;
  const m = room.members.get(pid);
  if (!m || m.ws !== ws) return;                                          // replaced by a newer connection of the same player
  const g = room.game;
  if (m.team < 0 || (g && g.over())) {                                    // spectators and finished games: nothing to hold
    return removeMember(room, m);
  }
  startGrace(room, m);
  pickHost(room);
  bcastRoom(room);
  log('disconnected', room.code, m.name);
}

/* sweep players whose seat time ran out while nobody else was online */
function sweep(room, except) {
  for (const m of room.members.values()) {
    if (m !== except && room.started && m.team >= 0 && !m.gone && !m.online && m.expired) applyGone(room, m);
  }
}

/* ---------------------------------------------------------------- message handlers */
function err(ws, msg, extra) { send(ws, J({ t: 'err', msg, ...extra })); }

function attach(room, m, ws) {
  if (m.ws && m.ws !== ws) { send(m.ws, J({ t: 'replaced' })); m.ws.roomRef = null; try { m.ws.close(4001, 'replaced'); } catch (e) { /* ignore */ } }
  if (m.timer) { clearTimeout(m.timer); m.timer = null; }
  m.ws = ws; m.online = true; m.deadline = 0; m.expired = false;
  ws.roomRef = room; ws.pid = m.pid;
}

function addMember(room, ws, tok, name, team) {
  const t = Date.now();
  const m = { pid: rid(4), tok, name, team, jt: t, tt: t, online: false, ws: null, timer: null, deadline: 0 };
  room.members.set(m.pid, m); room.byTok.set(tok, m.pid);
  attach(room, m, ws);
  return m;
}

function welcome(room, m) {
  send(m.ws, roomInfo(room, m.pid));
  if (room.started && room.game) send(m.ws, '{"t":"state","st":' + room.game.state() + '}');
}

function doCreate(ws, msg) {
  if (ws.roomRef) return err(ws, 'You are already in a room.');
  if (!validTok(msg.tok)) return err(ws, 'Bad session.');
  if (rooms.size >= MAX_ROOMS) return err(ws, 'Server is busy, try again later.');
  const n = [4, 6, 12].includes(+msg.n) ? +msg.n : 4;
  const room = createRoom(n);
  if (!room) return err(ws, 'Could not create room.');
  const m = addMember(room, ws, msg.tok, clean(msg.name) || 'Player', 0);
  room.host = m.pid;
  log('room created', room.code, 'coins', n);
  welcome(room, m);
}

function doJoin(ws, msg) {
  if (!validTok(msg.tok)) return err(ws, 'Bad session.');
  const code = String(msg.code || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) return err(ws, 'Room not found.', { notFound: true });
  if (ws.roomRef && ws.roomRef !== room) return err(ws, 'You are already in a room.');
  const name = clean(msg.name) || 'Player';

  let m = room.members.get(room.byTok.get(msg.tok));
  if (m) {                                                               // same device coming back (reload, network drop, phone sleep)
    attach(room, m, ws);
    if (name && m.name !== name && !room.started) m.name = name;
  } else {
    const nm = name.toLowerCase();                                       // new device taking over a disconnected seat (same name)
    const seat = [...room.members.values()].find(x => x.team >= 0 && !x.gone && !x.online && x.name.toLowerCase() === nm);
    if (seat) {
      room.byTok.delete(seat.tok); seat.tok = msg.tok; room.byTok.set(msg.tok, seat.pid);
      attach(room, seat, ws); m = seat;
    } else if (room.started) {
      if (teamList(room, -1).length >= MAX_SPEC) return err(ws, `Room is full (${MAX_SPEC} spectators).`);
      m = addMember(room, ws, msg.tok, name, -1);
    } else {
      const c = [teamList(room, 0).length, teamList(room, 1).length];
      let team = c[0] <= c[1] ? 0 : 1;
      if (c[0] >= 2 && c[1] >= 2) team = -1;
      if (team === -1 && teamList(room, -1).length >= MAX_SPEC) return err(ws, `Room is full (4 players and ${MAX_SPEC} spectators).`);
      m = addMember(room, ws, msg.tok, name, team);
    }
  }
  pickHost(room);
  sweep(room, m);
  welcome(room, m);
  bcastRoom(room);
  log('joined', room.code, m.name, m.team < 0 ? '(spectator)' : '');
}

function doPick(ws, msg) {
  const room = ws.roomRef; if (!room) return;
  const m = room.members.get(ws.pid); if (!m) return;
  if (room.started) return err(ws, 'The game has already started.');
  const team = +msg.team;
  if (![0, 1, -1].includes(team) || m.team === team) return;
  if (team >= 0 ? teamList(room, team).length >= 2 : teamList(room, -1).length >= MAX_SPEC)
    return err(ws, team < 0 ? 'Spectator seats are full.' : ['Red', 'Blue'][team] + ' team is full.', { lobby: true });
  m.team = team; m.tt = Date.now();
  bcastRoom(room);
}

function doStart(ws) {
  const room = ws.roomRef; if (!room) return;
  if (room.started) return;
  if (room.host !== ws.pid) return err(ws, 'Only the host can start.', { lobby: true });
  const R = teamList(room, 0), B = teamList(room, 1);
  if (!((R.length === 1 && B.length === 1) || (R.length === 2 && B.length === 2))) return err(ws, 'Teams are not ready.', { lobby: true });
  const off = [...R, ...B].find(m => !m.online);
  if (off) return err(ws, off.name + ' is disconnected.', { lobby: true });
  const pl = [...R, ...B].sort((a, b) => a.jt - b.jt).map(m => ({ name: m.name, uid: m.pid, cpu: false, team: m.team }));
  let order = pl.map((_, i) => i);
  if (pl.length === 4) { const t0 = pl[0].team, A = [], O = []; pl.forEach((p, i) => (p.team === t0 ? A : O).push(i)); order = [A[0], O[0], A[1], O[1]]; }
  room.game = createGame({
    onState: str => bcastState(room, str),
    setTimeout: (f, ms) => { const h = setTimeout(() => { room.timers.delete(h); if (rooms.has(room.code)) { try { f(); } catch (e) { log('timer error', e); } } }, ms); room.timers.add(h); return h; },
    clearTimeout: h => { clearTimeout(h); room.timers.delete(h); },
  });
  room.game.start(pl, room.n, order);
  room.started = true;
  bcastRoom(room);
  bcastState(room, room.game.state());
  log('game started', room.code, pl.length + ' players');
}

function doThrow(ws) {
  const room = ws.roomRef; if (!room || !room.started || !room.game || room.rolling) return;
  const g = room.game;
  if (!g.canThrow(ws.pid)) return;                                       // not your turn / not a player / spectator
  room.rolling = true;
  const a = crypto.randomInt(4), b = crypto.randomInt(4), v0 = g.version();
  const out = J({ t: 'roll', a, b, team: g.turn() });
  for (const m of room.members.values()) if (m.online) send(m.ws, out);   // everybody animates the SAME result
  const h = setTimeout(() => {
    room.timers.delete(h);
    room.rolling = false;
    if (!rooms.has(room.code)) return;
    try { g.applyThrow(a, b, v0); } catch (e) { log('applyThrow error', e); }
  }, ROLL_MS);
  room.timers.add(h);
}

function doMove(ws, msg) {
  const room = ws.roomRef; if (!room || !room.started || !room.game || room.rolling) return;
  let r;
  try { r = room.game.move(ws.pid, msg.i, msg.v, msg.sv); } catch (e) { log('move error', e); return; }
  if (r === 'stale') { const m = room.members.get(ws.pid); if (m) send(ws, '{"t":"state","st":' + room.game.state() + '}'); }
}

function doLeave(ws) {
  const room = ws.roomRef; if (!room) return;
  const m = room.members.get(ws.pid); if (!m) return;
  if (room.started && room.game && m.team >= 0 && !m.gone && !room.game.over()) room.game.leave(m.pid);
  ws.roomRef = null;
  send(ws, J({ t: 'left' }));
  removeMember(room, m);
  if (rooms.has(room.code) && room.started) checkAbandoned(room);
}

const HANDLERS = { create: doCreate, join: doJoin, pick: doPick, start: doStart, throw: doThrow, move: doMove, leave: doLeave };

/* ---------------------------------------------------------------- websocket */
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').split('?')[0] !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', ws => {
  ws.isAlive = true; ws.roomRef = null; ws.pid = null; ws.bucket = 30; ws.bt = Date.now();
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => {
    ws.isAlive = true;
    const now = Date.now();                                              // simple flood protection: 30 messages burst, 15 per second
    ws.bucket = Math.min(30, ws.bucket + (now - ws.bt) * 0.015); ws.bt = now;
    if (--ws.bucket < 0) return;
    let msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') return send(ws, '{"t":"pong"}');
    const h = HANDLERS[msg.t]; if (!h) return;
    try { h(ws, msg); } catch (e) { log('handler error', msg.t, e); }
  });
  ws.on('close', () => onSocketClosed(ws));
  ws.on('error', () => { /* handled by close */ });
});

const beat = setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignore */ } });
}, 20000);

const gc = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.created > ROOM_MAX_AGE || (!anyOnline(room) && ![...room.members.values()].some(m => m.timer))) destroyRoom(room);
  }
}, 60000);

server.listen(PORT, '0.0.0.0', () => log(`Dhayam server listening on port ${PORT}`));

function shutdown() {
  log('shutting down');
  clearInterval(beat); clearInterval(gc);
  wss.clients.forEach(ws => { try { ws.close(1012, 'restart'); } catch (e) { /* ignore */ } });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', e => log('uncaught', e));
process.on('unhandledRejection', e => log('unhandled', e));

module.exports = { server, rooms };
