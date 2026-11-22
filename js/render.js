/* Drawing the players bar, coins, dice values and the win screen */
/* render */
function draw(){if(!S||!$('#cn'))return;playEv();const cur=act();
 $('#pl').innerHTML=S.seats.map((s,i)=>{const ap=act();return `<div class="pc ${i==S.turn&&!S.over?'t':''}"><b style="background:${COL[i]}"></b><span>${S.pl.filter(p=>p.team==i).map(p=>p.name+(p.gone?' (left)':'')).join(' & ')} – ${S.t[i].filter(x=>x==80).length}/${S.n}</span></div>`}).join('');
 const mine=S.phase=='move'&&human(),v=S.pool[sel],cnt={};let h='';
 [0,1].forEach(p=>S.t[p].forEach((k,i)=>{const an=ANIM&&ANIM.find(a=>a.p==p&&a.i==i),fr=an&&an.fr||0,q=pos(p,an?an.k:k,i),q2=fr?pos(p,an.k+1,i):q,x=q[0]+(q2[0]-q[0])*fr+(an?an.jx:0),y=q[1]+(q2[1]-q[1])*fr+(an?an.jy-(an.hop||0):0),r=(q[2]+(q2[2]-q[2])*fr)*(an?(an.sc||1.25):1),key=q[0]+','+q[1],n=cnt[key]=(cnt[key]||0)+1;
  const first=k!=0||S.t[p].indexOf(0)==i,m=mine&&p==S.turn&&v!=null&&first&&ok(p,i,v);
  {const cx=x+(n-1)*7,cy=y-(n-1)*7,cl=m||(mine&&p==S.turn);h+=`<circle ${cl?`data-p="${p}" data-i="${i}"`:''} class="${m?'m':''}" cx="${cx}" cy="${cy}" r="${r}" fill="url(#g${p})" stroke="${m||an?'#fff':p?'#0d3c80':'#6a0f0f'}" stroke-width="${m?6:4}" style="${cl?'cursor:pointer':''}"/><ellipse cx="${cx-r*.3}" cy="${cy-r*.38}" rx="${r*.3}" ry="${r*.17}" fill="#fff" opacity=".65" pointer-events="none"/>`}}));
 $('#cn').innerHTML=h;
 [0,1].forEach(i=>face($('#d'+i),S.dice[i]));
 $('#pool').innerHTML=S.pool.map((x,i)=>`<div class="pv ${i==sel&&S.phase=='move'?'on':''}" data-i="${i}">${x}</div>`).join('');
 document.querySelectorAll('.pv').forEach(e=>e.onclick=()=>{sel=+e.dataset.i;draw()});
 const you=human();
 $('#st').textContent=S.over?'Game over!':LOCK?'💥 Captured!':S.phase=='throw'?(you?(S.bt?'💥 Capture bonus! Throw again':S.dn?S.dn+' only gives another throw — you need a 1 first':S.pool.length?'Extra throw! Tap the sticks':'Your turn — tap the sticks'):cur.name+' is throwing…'):S.phase=='skip'?(S.aon?'No complete legal move — turn passes':'No legal move — turn passes'):(you?(S.t[S.turn].includes(0)&&S.pool.includes(1)?'You have a 1 — bring a coin out first':'Choose a value, then tap a coin'):cur.name+' is moving…');
 if(isSpec)$('#st').textContent='👁 Spectating — '+$('#st').textContent;
 $('#st').style.color=cur.cpu||true?(S.turn?'#90caf9':'#ff8a80'):'#fff'}
function showWin(){$('#wt').textContent=S.seats[S.win].name+' wins!';const o=[S.win,1-S.win];
 $('#rks').innerHTML=o.map((k,i)=>`<div class="rk"><span>${i?'🥈':'🥇'}</span><b style="background:${COL[k]}"></b>${S.seats[k].name} — ${S.t[k].filter(x=>x==80).length}/${S.n} home</div>`).join('');
 $('#pa').style.display=M=='online'?'none':'';go('wn')}

