'use strict';
/* Server-side game engine.
   The game rules are NOT re-implemented: the original browser files js/config.js, js/board.js and js/rules.js
   are loaded unchanged into an isolated vm context (one per room), so the server and the clients always
   use exactly the same rules, dice values, captures, safe squares, turn order and win conditions.
   Only the browser-only hooks (draw / push / drive) are replaced by server equivalents. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', 'js');
const compile = f => new vm.Script(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: 'js/' + f });
const CONFIG = compile('config.js');
const BOARD = compile('board.js');
const RULES = compile('rules.js');

/* declared by animation.js in the browser; the server does not need animations */
const SHIM = new vm.Script(`
let LOCK=false,BUD=0;const MEMO=new Map();
function draw(){}
function push(){__out(JSON.stringify(S))}
`, { filename: 'server/shim.js' });

/* server-only helpers; they run INSIDE the context so they can use the game's own globals */
const API = new vm.Script(`
drive=function(){};          /* no computer players online, nothing to schedule */
M='online';
function E_start(pl,n,order){mk(pl,n,order)}
function E_canThrow(pid){const a=S&&!S.over&&S.phase=='throw'?act():null;return !!a&&a.uid===pid&&!a.gone}
function E_ver(){return S?S.v:0}
function E_over(){return !!(S&&S.over)}
function E_apply(a,b,v0){if(!S||S.v!==v0||S.over||S.phase!='throw')return false;
 S.ld=S.ld||[null,null];S.ld[S.turn]=[a,b,a+b==0?12:a+b];   /* display only: latest throw of each team */
 applyThrow(a,b);return true}
function E_turn(){return S.turn}
function E_move(pid,i,v,sv){
 if(!S||S.over)return 'over';
 if(S.phase!='move'||S.v!==sv)return 'stale';
 if(!S.pl.some(p=>p.team==S.turn&&p.uid===pid&&!p.gone))return 'notyours';
 if(!Number.isInteger(i)||i<0||i>=S.n||!Number.isInteger(v)||!S.pool.includes(v))return 'bad';
 if(!ok(S.turn,i,v))return 'illegal';
 mv(i,v);return 'ok'}
/* same behaviour as the original leaveRoom(): the player is skipped from now on; if the whole team is gone the other team wins */
function E_leave(pid){
 if(!S||S.over)return false;
 const pi=S.pl.findIndex(p=>p.uid===pid&&!p.gone);if(pi<0)return false;
 const tm=S.pl[pi].team;S.pl[pi].gone=true;
 if(!S.pl.some(p=>p.team==tm&&!p.gone)){S.over=true;S.win=1-tm}
 else if(act()===S.pl[pi]){S.bn=0;endTurn()}
 S.v++;push();return true}
function E_state(){return JSON.stringify(S)}
`, { filename: 'server/api.js' });

function createGame({ onState, setTimeout: st, clearTimeout: ct }) {
  const noop = () => 0;
  const sandbox = {
    document: { querySelector: () => ({ value: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } }), querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: noop, clearTimeout: noop,
    __out: s => onState(s),
  };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  CONFIG.runInContext(ctx);               // top-level timer in config.js is a no-op here
  sandbox.setTimeout = st; sandbox.clearTimeout = ct;
  BOARD.runInContext(ctx);
  SHIM.runInContext(ctx);
  RULES.runInContext(ctx);
  API.runInContext(ctx);
  const call = (fn, ...args) => {
    sandbox.__args = args;
    return vm.runInContext(`${fn}(...__args)`, ctx, { timeout: 2000 });
  };
  return {
    start: (pl, n, order) => call('E_start', pl, n, order),
    canThrow: pid => call('E_canThrow', pid),
    version: () => call('E_ver'),
    turn: () => call('E_turn'),
    over: () => call('E_over'),
    applyThrow: (a, b, v0) => call('E_apply', a, b, v0),
    move: (pid, i, v, sv) => call('E_move', pid, i, v, sv),
    leave: pid => call('E_leave', pid),
    state: () => call('E_state'),
  };
}

module.exports = { createGame };
