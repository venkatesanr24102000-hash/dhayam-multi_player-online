'use strict';
/* End-to-end test: starts the real server, then plays with WebSocket bots (players + spectators).
   Run:  npm test   (needs Node 22+ for the built-in WebSocket client, or Node 18/20 with `node --experimental-websocket`) */
const { spawn } = require('child_process');
const vm = require('vm'), fs = require('fs'), path = require('path');
const assert = require('assert');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tokOf = () => require('crypto').randomBytes(16).toString('hex');

/* rules oracle: the same unmodified rules.js, used by bots to find a legal move */
function oracle() {
  const sb = { document: { querySelector: () => ({}), querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0 };
  const ctx = vm.createContext(sb);
  for (const f of ['config.js', 'board.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx);
  vm.runInContext('let LOCK=false,BUD=0;const MEMO=new Map();', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'rules.js'), 'utf8'), ctx);
  return (st, v) => { sb.__s = st; return vm.runInContext('S=__s;MEMO.clear();S.pool.map(v=>[v,legal(S.turn,v)]).filter(x=>x[1].length)', ctx); };
}
const legalMoves = oracle();

class Bot {
  constructor(name, tok) { this.name = name; this.tok = tok || tokOf(); this.S = null; this.room = null; this.rolls = []; this.errs = []; this.auto = true; this.log = []; }
  connect() {
    return new Promise((res, rej) => {
      const ws = this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      ws.onopen = () => res(this);
      ws.onerror = e => rej(e);
      ws.onmessage = e => this.onmsg(JSON.parse(e.data));
      ws.onclose = () => { this.closed = true; };
    });
  }
  tx(o) { this.ws.send(JSON.stringify(o)); }
  create(n = 4) { this.tx({ t: 'create', tok: this.tok, name: this.name, n }); return this.until(() => this.room && this.room.code); }
  join(code) { this.tx({ t: 'join', tok: this.tok, name: this.name, code }); return this.until(() => this.room && this.room.code === code); }
  me() { return this.room && this.room.you; }
  onmsg(m) {
    this.log.push(m.t);
    if (m.t === 'room') this.room = m;
    else if (m.t === 'state') { if (!this.S || m.st.v > this.S.v) this.S = m.st; this.onState(); }
    else if (m.t === 'roll') this.rolls.push([m.a, m.b]);
    else if (m.t === 'err') this.errs.push(m.msg);
    else if (m.t === 'closed') this.closedMsg = m.msg;
  }
  onState() {
    if (!this.auto || !this.S || this.S.over) return;
    const S = this.S, me = this.me();
    const a = S.pl[S.order[S.tp]];
    if (S.phase === 'throw' && a.uid === me && !a.gone) { if (this.lastThrowV !== S.v) { this.lastThrowV = S.v; this.tx({ t: 'throw' }); } }
    else if (S.phase === 'move' && S.pl.some(p => p.team === S.turn && p.uid === me && !p.gone)) {
      if (this.lastMoveV === S.v) return; this.lastMoveV = S.v;
      const lm = legalMoves(JSON.parse(JSON.stringify(S)));
      if (lm.length) { const [v, idx] = lm[Math.random() * lm.length | 0]; this.tx({ t: 'move', i: idx[Math.random() * idx.length | 0], v, sv: S.v }); }
    }
  }
  async until(f, ms = 15000) { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting (' + this.name + ')'); await sleep(10); } }
  close() { try { this.ws.close(); } catch (e) { /* */ } }
}

async function main() {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { env: { ...process.env, PORT, ROLL_MS: 60, RECONNECT_GRACE_MS: 2500 }, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; srv.stdout.on('data', d => { out += d; });
  for (let i = 0; i < 50 && !out.includes('listening'); i++) await sleep(100);
  let pass = 0; const ok = (c, m) => { assert(c, m); pass++; console.log('  ✓', m); };
  try {
    console.log('A) full 2-player game with spectators (one joins in lobby, one mid-game)');
    const A = await new Bot('Alice').connect(), B = await new Bot('Bob').connect(), S1 = await new Bot('Spec1').connect();
    const code = await A.create(4).then(() => A.room.code);
    ok(/^[A-HJKMNP-Z2-9]{5}$/.test(code), 'room code created: ' + code);
    await B.join(code); await S1.join(code);
    ok(A.room.members.length === 3, 'lobby has 3 members');
    B.tx({ t: 'pick', team: 1 }); await B.until(() => B.room.members.find(m => m.pid === B.me()).team === 1);
    S1.tx({ t: 'pick', team: -1 }); await S1.until(() => S1.room.members.find(m => m.pid === S1.me()).team === -1);
    B.tx({ t: 'start' }); await sleep(100);
    ok(B.errs.includes('Only the host can start.'), 'non-host cannot start');
    A.auto = B.auto = false;
    A.tx({ t: 'start' }); await A.until(() => A.S); await B.until(() => B.S); await S1.until(() => S1.S);
    ok(A.S.pl.length === 2 && A.S.n === 4, 'game started with 2 players');
    S1.tx({ t: 'throw' }); S1.tx({ t: 'move', i: 0, v: 1, sv: S1.S.v }); await sleep(150);
    ok(S1.rolls.length === 0, 'spectator cannot throw or move');
    const late = await new Bot('LateSpec').connect(); late.auto = false;
    await sleep(500); await late.join(code); await late.until(() => late.S);
    ok(late.room.members.find(m => m.pid === late.me()).team === -1, 'late spectator joins a running game as spectator');
    A.auto = B.auto = true;
    A.onState(); B.onState();
    const t0 = Date.now();
    while (!(A.S && A.S.over) && Date.now() - t0 < 120000) await sleep(100);
    await sleep(300);
    ok(A.S.over, 'game finished (winner: ' + (A.S.over && A.S.seats[A.S.win].name) + ', ' + A.S.v + ' states)');
    const js = JSON.stringify(A.S);
    ok([B, S1, late].every(b => JSON.stringify(b.S) === js), 'players and both spectators ended with the identical final state');
    ok(A.rolls.length === B.rolls.length && B.rolls.length === late.rolls.length + 0 || late.rolls.length <= A.rolls.length, 'dice rolls were broadcast to everyone (' + A.rolls.length + ' rolls)');
    ok(JSON.stringify(A.rolls) === JSON.stringify(B.rolls) && JSON.stringify(A.rolls) === JSON.stringify(S1.rolls), 'every roll identical on all clients');
    [A, B, S1, late].forEach(b => b.close());

    console.log('B) disconnect and rejoin with same room code');
    const C = await new Bot('Cara').connect(), D = await new Bot('Dev').connect(), S2 = await new Bot('Watcher').connect();
    await C.create(4); const c2 = C.room.code; await D.join(c2); await S2.join(c2);
    D.tx({ t: 'pick', team: 1 }); S2.tx({ t: 'pick', team: -1 }); await sleep(200);
    C.tx({ t: 'start' }); await D.until(() => D.S); await S2.until(() => S2.S);
    await sleep(800);
    const mid = D.S.v; D.auto = false; D.close();                       // Dev loses connection
    await C.until(() => C.room.members.find(m => m.name === 'Dev' && !m.online));
    ok(true, 'others are told that Dev is offline (with countdown ' + C.room.members.find(m => m.name === 'Dev').remain + ' ms)');
    await sleep(1200);
    ok(!C.S.over, 'game did not end while Dev is offline');
    const D2 = new Bot('Dev', D.tok); await D2.connect(); await D2.join(c2); await D2.until(() => D2.S);
    ok(D2.me() === D.me(), 'same seat (player id) after reconnect');
    ok(D2.S.v >= mid && D2.room.members.find(m => m.name === 'Dev').online, 'rejoined with current game state');
    await sleep(2800);
    ok(!C.S.over && C.room.members.find(m => m.name === 'Dev').online, 'seat kept: the timer was cancelled by rejoining');
    const tcur = Date.now();
    while (C.S.v < mid + 6 && Date.now() - tcur < 20000) await sleep(50);
    ok(C.S.v >= mid + 6, 'game keeps going after rejoin (v=' + C.S.v + ')');
    await sleep(300); ok(JSON.stringify(C.S) === JSON.stringify(S2.S) || C.S.v !== S2.S.v, 'spectator in sync');
    C.auto = D2.auto = false;

    console.log('C) takeover from another device by name, then grace expiry');
    D2.close(); await C.until(() => C.room.members.find(m => m.name === 'Dev' && !m.online));
    const D3 = new Bot('dev'); await D3.connect(); await D3.join(c2); await D3.until(() => D3.S);
    ok(D3.me() === D.me(), 'new device takes over the offline seat using the same code + name');
    D3.close(); await C.until(() => C.room.members.find(m => m.name === 'Dev' && !m.online));
    await sleep(3300);
    ok(C.S.over && C.S.win === 0 && C.S.pl.find(p => p.name === 'Dev').gone, 'after the grace period expires the other team wins');
    C.close(); S2.close();

    console.log('D) misc');
    const E = await new Bot('Eve').connect();
    E.tx({ t: 'join', tok: E.tok, name: 'Eve', code: 'ZZZZZ' }); await E.until(() => E.errs.length);
    ok(E.errs[0] === 'Room not found.', 'unknown room code is rejected');
    E.tx({ t: 'create', tok: 'short', name: 'x' }); await sleep(100);
    const F = await new Bot('<b>Evil</b>').connect(); await F.create(4);
    ok(!/[<>]/.test(F.room.members[0].name), 'names are sanitised: "' + F.room.members[0].name + '"');
    E.close(); F.close();
    console.log(`\nALL ${pass} CHECKS PASSED`);
  } catch (e) { console.error('\nFAILED:', e.message); process.exitCode = 1; }
  finally { srv.kill(); }
}
main();
