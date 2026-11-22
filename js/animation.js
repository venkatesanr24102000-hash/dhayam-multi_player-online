/* Coin walking, capture animation + scream sound, dice rolling animation + sound */
let LOCK=false,ANIM=null,lastEv=0,lastMv=0,BUD=0;const MEMO=new Map();
const ENV=[0.00,0.00,0.00,0.04,0.09,0.15,0.15,0.07,0.02,0.15,0.27,0.61,0.90,0.69,0.90,0.49,0.11,0.04,0.10,0.16,0.08,0.04,0.01,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.02,0.07,0.16,0.07,0.07,0.19,0.33,0.53,0.52,0.08,0.13,0.04,0.00,0.00,0.00,0.01,0.01,0.02,0.08,0.07,0.34,0.61,0.91,0.81,0.88,0.35,0.07,0.08,0.18,0.14,0.08,0.04,0.05,0.05,0.05,0.05,0.04,0.04,0.03,0.09,0.15,0.11,0.03,0.17,0.29,0.60,0.84,0.82,1.00,0.99,0.70,0.66,0.49,0.19,0.06,0.06,0.11,0.08,0.01,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.04,0.41,0.67,0.39,0.26,0.45,0.59,0.74,0.66,0.66,0.57,0.54,0.56,0.54,0.49,0.57,0.55,0.52,0.53,0.53,0.51,0.54,0.52,0.53,0.53,0.53,0.54,0.53,0.56,0.51,0.48,0.56,0.53,0.51,0.56],DUR=7.43,FL=.12;let CUM=[0];ENV.forEach(v=>CUM.push(CUM[CUM.length-1]+v+FL));
function cumAt(x){const m=ENV.length,z=Math.min(1,Math.max(0,x))*m,i=Math.min(m-1,z|0);return CUM[i]+(CUM[i+1]-CUM[i])*(z-i)}
function envAt(x){return ENV[Math.min(ENV.length-1,Math.max(0,x*ENV.length|0))]}
document.addEventListener('pointerdown',()=>{['#scr','#dsnd'].forEach(id=>{const a=$(id);a.muted=true;a.play().then(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>{a.muted=false})})},{once:true});
function walk(m){const ev=S.ev&&S.ev.id>lastEv?S.ev.c.filter(c=>!(c[0]==m.p&&c[1]==m.i)):[],me={p:m.p,i:m.i,k:m.from,fr:0,hop:0,jx:0,jy:0,sc:1.15},ST=m.to-m.from,SD=230,t0=performance.now();
 ANIM=[me,...ev.map(([p,i,k])=>({p,i,k,jx:0,jy:0,sc:1}))];LOCK=true;
 function f(now){const e=now-t0;if(e>=ST*SD){ANIM=null;LOCK=false;draw();drive();return}
  const n=Math.floor(e/SD),u=(e-n*SD)/SD,mvp=Math.min(1,u/.78);me.k=m.from+n;me.fr=mvp<.5?2*mvp*mvp:1-2*(1-mvp)*(1-mvp);me.hop=mvp<1?Math.sin(Math.PI*mvp)*22:0;me.sc=1.15+(mvp>=1?.12*Math.sin(Math.PI*(u-.78)/.22):0);draw();requestAnimationFrame(f)}
 requestAnimationFrame(f)}
function playEv(){if(!S||LOCK)return;if(S.mv&&S.mv.id>lastMv){lastMv=S.mv.id;return walk(S.mv)}capEv()}
function capEv(){if(!S||!S.ev||S.ev.id<=lastEv)return;lastEv=S.ev.id;
 const items=S.ev.c.map(([p,i,k])=>({p,i,k,k0:k,jx:0,jy:0})),a=$('#scr'),bd=$('#bd'),D=DUR*1000,hold=450,c0=cumAt(hold/D),c1=cumAt(1);
 LOCK=true;ANIM=items;try{a.currentTime=0;const pr=a.play();if(pr)pr.catch(()=>{})}catch(e){}
 const t0=performance.now();
 function f(now){const e=now-t0,x=e/D,pg=Math.min(1,Math.max(0,(cumAt(x)-c0)/(c1-c0))),L=e<hold?0:envAt(x);
  items.forEach(it=>{const kt=Math.round(it.k0*(1-pg)),cap=e>=D?8:2;let c=0;while(it.k>kt&&c<cap){it.k--;c++}it.jx=(Math.random()-.5)*L*28;it.jy=(Math.random()-.5)*L*28});
  draw();
  if(e<D||items.some(it=>it.k>0))requestAnimationFrame(f);else{ANIM=null;LOCK=false;bd.style.transform='';try{a.pause()}catch(e){}draw();drive()}}
 requestAnimationFrame(f)}
const FACE=['assets/images/dice_0.png','assets/images/dice_1.png','assets/images/dice_2.png','assets/images/dice_3.png'];
let DC=[0,0],HELD=null,ROLLT=-1;
function buildDice(){[0,1].forEach(i=>{$('#d'+i).innerHTML='<div class="pr">'+[0,1,2,3].map(n=>`<div class="fc" style="background-image:url(${FACE[n]});transform:rotateX(${n*90}deg) translateZ(14px)"></div>`).join('')+'</div>'})}
function face(el,n){if(rolling)return;if(HELD&&M=='online')n=HELD[+el.id.slice(1)];const pr=el.querySelector('.pr');if(!pr)return;const i=+el.id.slice(1),g=-(n||0)*90-360*DC[i];ANG[i]=g;el.style.opacity=n==null?.45:1;pr.style.transform='rotateX('+g+'deg)'}
const DENV=[0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.02,0.08,0.18,0.20,0.66,0.80,1.00,0.67,0.66,0.69,0.61,0.62,0.65,0.76,0.63,0.50,0.36,0.39,0.50,0.56,0.44,0.18,0.04,0.01,0.01],DENVS=[0.02,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.04,0.08,0.10,0.32,0.42,0.52,0.60,0.70,0.81,0.83,0.89,1.00,0.87,0.81,0.79,0.74,0.70,0.71,0.72,0.63,0.50,0.41,0.36,0.29,0.15,0.06,0.00],DDUR=0.580,ANG=[0,0];let DCUM=[0];DENV.forEach(v=>DCUM.push(DCUM[DCUM.length-1]+v+.06));
function dAt(A,x){const m=A.length,z=Math.min(1,Math.max(0,x))*m,i=Math.min(m-1,z|0),j=Math.min(m-1,i+1);return A[i]+(A[j]-A[i])*(z-i)}
function dCum(x){const m=DENV.length,z=Math.min(1,Math.max(0,x))*m,i=Math.min(m-1,z|0);return DCUM[i]+(DCUM[i+1]-DCUM[i])*(z-i)}
function rollSync(to,done){const q=$('#dsnd'),els=[$('#d0'),$('#d1')],prs=els.map(e=>e.querySelector('.pr')),from=ANG.slice(),w0=performance.now();let T0=null,p=0,lift=0,stopped=false;
 const begin=()=>{if(T0===null)T0=performance.now()};
 try{q.muted=false;q.volume=1;q.onplaying=begin;q.onended=()=>{stopped=true};q.currentTime=0;const pr=q.play();if(pr)pr.catch(()=>{})}catch(e){}
 function f(){const now=performance.now();
  if(T0===null){if(now-w0>250)begin();else{requestAnimationFrame(f);return}}
  const el=Math.max(0,(now-T0)/1000),x=Math.min(1,el/DDUR);
  if(q.ended||el>DDUR+.12)stopped=true;
  let tl=0;
  if(!stopped){const u=x*x*(3-2*x);p=Math.max(p,1-Math.pow(1-u,3));const s=x<.7?Math.sin(Math.PI*x/.7):0.2*Math.sin(Math.PI*(x-.7)/.3);tl=(x<.7?30:30)*s*s*(x<.7?1:1)}else{p+=(1-p)*.22}
  lift=stopped?lift*.75:tl;
  els.forEach((e,i)=>{prs[i].style.transform='rotateX('+(from[i]+(to[i]-from[i])*p)+'deg)';e.style.transform='translateY('+(-lift*(i?.85:1))+'px)'});
  if(p>.998&&lift<.4&&(stopped||x>=1)){els.forEach((e,i)=>{prs[i].style.transform='rotateX('+to[i]+'deg)';e.style.transform='';ANG[i]=to[i]});done();return}
  requestAnimationFrame(f)}
 requestAnimationFrame(f)}
