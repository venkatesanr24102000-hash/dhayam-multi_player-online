/* Online rooms over WebSocket (Node server, e.g. on Render): 2-player or 4-player team mode + spectators.
   The SERVER owns the room and the game: it rolls the dice, validates every move with the same rules.js and broadcasts
   the new state. This file only sends what the player wants to do (create / join / pick / start / throw / move / leave)
   and shows what the server sends back, so all players and spectators always see the same game.
   Reconnect: every device has a private token (localStorage). If the connection drops the page reconnects by itself and
   the server holds the seat for 4 minutes; the same room code (same device, or same name from another device) takes it back.
   team: 0 = Red, 1 = Blue, -1 = spectator. */
let WS=null,RM=null,CODE=null,PEND=null,THR=0,retry=0,rcT=null,hbT=null,lastRx=0,lostAt=0,wantConn=false,HOSTID=null,flashT=null,flashMsg='';
const GRACE=4*60*1000;
/* commit() in rules.js calls push() after every local state change. The old version published the state to the shared database; online games now push from the server, so on the client this is a no-op. */
function push(){}
function tok(){const k='dhTok'+(new URLSearchParams(location.search).get('p')||'');let t=null;try{t=localStorage.getItem(k)}catch(e){}
 if(!t||t.length<16){const a=new Uint8Array(24);try{crypto.getRandomValues(a)}catch(e){for(let i=0;i<24;i++)a[i]=Math.random()*256|0}
  t=Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');try{localStorage.setItem(k,t)}catch(e){}}return t}
const SK='dhRoom'+(new URLSearchParams(location.search).get('p')||'');
function saveSess(){try{localStorage.setItem(SK,JSON.stringify({code:CODE,ts:Date.now()}))}catch(e){}}
function loadSess(){try{return JSON.parse(localStorage.getItem(SK))}catch(e){return null}}
function clearSess(){try{localStorage.removeItem(SK)}catch(e){}}
/* If the page is hosted somewhere other than the game server, set window.DHAYAM_SERVER = 'https://your-app.onrender.com' before this script. */
function wsUrl(){const b=window.DHAYAM_SERVER;if(b)return b.replace(/^http/,'ws').replace(/\/$/,'')+'/ws';return(location.protocol=='https:'?'wss://':'ws://')+location.host+'/ws'}
function send(o){if(WS&&WS.readyState==1){WS.send(JSON.stringify(o));return true}return false}

/* ---- connection ---- */
function openWS(){const w=new WebSocket(wsUrl());WS=w;
 w.onopen=()=>{if(WS!==w)return;lastRx=Date.now();retry=0;startHb();if(CODE)send({t:'join',tok:tok(),name:myName(),code:CODE})};
 w.onmessage=e=>{if(WS!==w)return;lastRx=Date.now();let m;try{m=JSON.parse(e.data)}catch(x){return}onMsg(m)};
 w.onclose=()=>dropped(w);w.onerror=()=>{}}
function ensure(){return new Promise((res,rej)=>{
 if(WS&&WS.readyState==1)return res();if(!WS||WS.readyState>1)openWS();
 const w=WS,t=setTimeout(()=>{rej(new Error('timeout'));try{w.close()}catch(e){}},8000);
 w.addEventListener('open',()=>{clearTimeout(t);res()},{once:true});w.addEventListener('close',()=>{clearTimeout(t);rej(new Error('closed'))},{once:true})})}
function startHb(){clearInterval(hbT);hbT=setInterval(()=>{if(!WS)return;if(Date.now()-lastRx>40000)return dropped(WS);send({t:'ping'})},15000)}
function dropped(w){if(WS!==w)return;WS=null;w.onclose=null;w.onmessage=null;try{w.close()}catch(e){}clearInterval(hbT);if(!wantConn||!CODE)return;
 if(!lostAt)lostAt=Date.now();banner();
 if(Date.now()-lostAt>GRACE+45000)return giveUp('Connection lost for too long. The seat was released.');
 clearTimeout(rcT);rcT=setTimeout(()=>{ensure().catch(()=>{})},Math.min(4000,400*Math.pow(2,retry++)))}
function recheck(){if(!wantConn||!CODE)return;if(!WS||WS.readyState>1){clearTimeout(rcT);retry=0;ensure().catch(()=>{})}else if(Date.now()-lastRx>30000)dropped(WS);else send({t:'ping'})}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck()});window.addEventListener('online',recheck);

/* ---- messages from the server ---- */
function onMsg(m){switch(m.t){
 case'room':onRoom(m);break;
 case'state':applyState(m.st);break;
 case'roll':onRoll(m);break;
 case'err':onErr(m);break;
 case'pong':if(CODE)saveSess();break;
 case'closed':giveUp(m.msg);break;
 case'replaced':giveUp('This game was opened in another tab or device.');break}}
function onRoom(m){const first=!CODE||!RM;m.members.forEach(x=>x.dl=Date.now()+x.remain);RM=m;ME=m.you;CODE=m.code;ROOM=m.code;wantConn=true;lostAt=0;saveSess();$('#oe').textContent='';
 const me=m.members.find(x=>x.pid==ME);if(me&&me.gone)isSpec=true;
 if(m.started){if(S)isSpec=!S.pl.some(p=>p.uid===ME&&!p.gone)}
 else{$('#lc').textContent=m.code;if(!$('#lb').classList.contains('on'))go('lb');lobby(m)}
 banner()}
function onErr(m){
 if(m.notFound&&CODE&&!S){wantConn=false;CODE=null;ROOM=null;clearSess();flash('That room is no longer available.');$('#oe').textContent=m.msg;return}
 if(m.notFound&&CODE)return giveUp('That room is no longer available.');
 $((m.lobby||$('#lb').classList.contains('on'))?'#le':'#oe').textContent=m.msg}
function applyState(n){if(!n)return;if(rolling){PEND=n;return}
 if(!S){HELD=null;S=n;M='online';isSpec=!n.pl.some(p=>p.uid===ME&&!p.gone);begin();banner();return}
 if(n.v>S.v){HELD=null;S=n;draw();drive();banner()}}
/* dice: the server picked the numbers; every screen animates the same result, then the new state follows */
/* The dice keep showing the rolled faces (HELD) until the server's new state arrives, so the previous throw can never flash back.
   Rolls are queued, so two animations never run on top of each other. */
const RQ=[];
function onRoll(m){if(!S)return;if(rolling){RQ.push(m);return}THR=0;rolling=true;ROLLT=m.team;HELD=[m.a,m.b];DC[0]+=2;DC[1]+=3;draw();
 /* the old throw must not look like a current value while the new roll is starting: dim the dice until the spin really begins */
 const dv=[$('#d0'),$('#d1')],t0=dv.map(e=>e.querySelector('.pr').style.transform);dv.forEach(e=>e.style.opacity=.45);
 (function w(){if(!rolling)return;if(dv.some((e,i)=>e.querySelector('.pr').style.transform!==t0[i])){dv.forEach(e=>e.style.opacity=1);return}requestAnimationFrame(w)})();
 rollSync([-(m.a*90)-360*DC[0],-(m.b*90)-360*DC[1]],()=>{rolling=false;ROLLT=-1;
  if(RQ.length)return onRoll(RQ.shift());
  if(PEND){const n=PEND;PEND=null;applyState(n)}else draw()})}
function netThrow(){if(THR&&Date.now()-THR<2500)return;THR=Date.now();send({t:'throw'})}
function netMove(i,v){send({t:'move',i,v,sv:S.v})}

/* ---- banner: connection / disconnected-player notices ---- */
function flash(msg){flashMsg=msg;clearTimeout(flashT);flashT=setTimeout(()=>{flashMsg='';banner()},5000);banner()}
function banner(){const el=$('#dcn');if(!el)return;let t=flashMsg;
 if(!t&&wantConn&&(!WS||WS.readyState!=1))t=CODE&&RM?'⚠ Connection lost — reconnecting…':'⏳ Rejoining your room…';
 if(!t&&RM&&RM.started&&S&&!S.over){
  const me=RM.members.find(x=>x.pid==ME);
  if(me&&me.gone)t='You were removed after 4 minutes offline — you are now watching.';
  else{const off=RM.members.filter(x=>!x.online&&!x.gone&&x.team>=0&&S.pl.some(p=>p.uid===x.pid&&!p.gone));
   if(off.length){const x=off[0],s=Math.max(0,Math.ceil((x.dl-Date.now())/1000));t='⏳ '+x.name+' disconnected — waiting '+(s/60|0)+':'+String(s%60).padStart(2,'0')+' to rejoin'+(off.length>1?' (+'+(off.length-1)+' more)':'')}}}
 el.textContent=t;el.style.display=t?'block':'none'}
setInterval(banner,1000);
function giveUp(msg){wantConn=false;CODE=null;ROOM=null;clearSess();clearTimeout(rcT);clearInterval(hbT);clearTimeout(T);clearTimeout(OT);
 const w=WS;WS=null;if(w){w.onclose=null;try{w.close()}catch(e){}}RM=null;S=null;inGame=false;rolling=false;HELD=null;ROLLT=-1;RQ.length=0;PEND=null;lostAt=0;banner();online();$('#oe').textContent=msg||''}

/* ---- menus ---- */
function online(){M='online';myName();chips('#rn',N,v=>{N=v;online()});$('#oe').textContent='';go('ol')}
async function createRoom(){$('#oe').textContent='Connecting…';
 try{await ensure()}catch(e){$('#oe').textContent='Could not reach the game server. Check your connection and try again.';return}
 $('#oe').textContent='';send({t:'create',tok:tok(),name:myName(),n:N})}
async function joinRoom(){const code=$('#jc').value.trim().toUpperCase();if(!code)return;$('#oe').textContent='Connecting…';
 try{await ensure()}catch(e){$('#oe').textContent='Could not reach the game server. Check your connection and try again.';return}
 $('#oe').textContent='';send({t:'join',tok:tok(),name:myName(),code})}
function lobby(x){const ms=x.members,mine=ms.find(m=>m.pid==ME);HOSTID=x.host;isHost=HOSTID===ME;if(!mine)return;
 const team=k=>ms.filter(m=>m.team==k),specs=team(-1),t=mine.team,c=[team(0).length,team(1).length],sp=specs.length,MS=x.maxSpec;isSpec=t===-1;
 const nm=m=>`${m.name}${m.pid==ME?' (you)':''}${m.pid==HOSTID?' 👑':''}${m.online?'':' ⏳ offline'}`;
 $('#ls').innerHTML=[0,1].map(k=>{const L=team(k);return `<div class="tp" style="border-color:${COL[k]}"><b>${NM[k]} Team: ${L.length}/2</b>${L.map(m=>`<div>${nm(m)}</div>`).join('')||'<i style="opacity:.6">empty</i>'}${L.length==2?'<div style="font-size:12px;opacity:.8">🤝 teammates</div>':''}</div>`}).join('')
  +`<div class="tp" style="border-color:#bbb"><b>👁 Spectators: ${sp}/${MS}</b>${specs.map(m=>`<div>${nm(m)}</div>`).join('')||'<i style="opacity:.6">none</i>'}</div>`;
 [0,1].forEach(k=>{$(k?'#cB':'#cR').className='chip'+(t===k?' on':'')+(c[k]>=2&&t!==k?' dis':'');$(k?'#cB':'#cR').textContent=(k?'🔵 Blue':'🔴 Red')+' ('+c[k]+'/2)'});
 $('#cS').className='chip wide'+(t===-1?' on':'')+(sp>=MS&&t!==-1?' dis':'');$('#cS').textContent='👁 Spectate ('+sp+'/'+MS+')';
 const ready=(c[0]==1&&c[1]==1)||(c[0]==2&&c[1]==2),off=[...team(0),...team(1)].find(m=>!m.online);
 $('#lst').style.display=isHost?'':'none';$('#lst').disabled=!ready||!!off;
 $('#lw').textContent=ready?(off?off.name+' is offline — waiting for them to reconnect':(c[0]==2?'4-player team match ready':'2-player match ready')+(isHost?'':' — waiting for the host to start')):(isHost?'Need 1 Red + 1 Blue (2 players) or 2 Red + 2 Blue (4 players)':'Waiting for players and the host…')}
function pick(team){if(!RM||RM.started)return;$('#le').textContent='';send({t:'pick',team})}
function hostStart(){$('#le').textContent='';send({t:'start'})}
function leaveRoom(){HELD=null;ROLLT=-1;RQ.length=0;wantConn=false;CODE=null;clearSess();send({t:'leave'});clearTimeout(rcT);clearInterval(hbT);const w=WS;WS=null;RM=null;PEND=null;lostAt=0;
 if(w){w.onclose=null;setTimeout(()=>{try{w.close()}catch(e){}},400)}banner()}

/* resume automatically after a page reload / browser restart if we were in a room a moment ago */
setTimeout(()=>{const s=loadSess();if(s&&s.code&&Date.now()-s.ts<GRACE+60000){CODE=s.code;wantConn=true;M='online';banner();ensure().catch(()=>{})}},1800);
