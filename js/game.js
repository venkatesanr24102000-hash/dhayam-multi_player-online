/* Menus, setup screens and starting/leaving a game */
/* setup & flow */
function chips(el,cur,fn){$(el).innerHTML=[4,6,12].map(v=>`<div class="chip ${v==cur?'on':''}" data-v="${v}">${v}</div>`).join('');$(el).querySelectorAll('.chip').forEach(c=>c.onclick=()=>fn(+c.dataset.v))}
function setup(m){M=m;const nm=myName();$('#sut').textContent=m=='cpu'?'Play vs Computer':'Pass & Play';chips('#np',N,v=>{N=v;setup(M)});
 $('#nms').innerHTML=[0,1].map(i=>`<div style="display:flex;gap:8px;align-items:center"><b style="width:20px;height:20px;border-radius:50%;background:${COL[i]};border:2px solid #fff;flex:none"></b><input style="width:100%" id="n${i}" maxlength="12" value="${i==0?nm:(m=='cpu'?'Computer':'Player 2')}" ${m=='cpu'&&i?'disabled':''}></div>`).join('');go('su')}
function startLocal(){cfg={M,N};mk([0,1].map(i=>({name:$('#n'+i).value.trim()||NM[i],cpu:M=='cpu'&&i==1,team:i})),N);begin()}
function again(){M=cfg.M;mk(S.pl.map(p=>({name:p.name,cpu:p.cpu,team:p.team})),cfg.N);begin()}
function begin(){inGame=true;if(!$('#d0 .pr'))buildDice();lastEv=S.ev?S.ev.id:0;lastMv=S.mv?S.mv.id:0;LOCK=false;ANIM=null;clearTimeout(OT);buildBoard();go('gm');draw();drive()}
function leave(){if(M=='online'&&ROOM)leaveRoom();clearTimeout(T);clearTimeout(OT);inGame=false;if(UNSUB){UNSUB();UNSUB=null}ROOM=null;S=null;rolling=false;go('hm')}
