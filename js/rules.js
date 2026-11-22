/* Dhayam rules: move legality, captures, turns, throws, computer player */
/* rules */
function trial(p,i,v,st){st=st||S;const t=st.t[p],k=t[i],base=t.includes(0);let k2;
 if(base&&st.pool.includes(1)){if(!(k==0&&v==1))return null;k2=1}
 else if(k==0){if(!(v==1||(v==5&&st.en[p])))return null;k2=1}
 else{k2=k+v;if(k2>80||(!st.cp[p]&&k2>54))return null}
 if(k2==80)return{k2,oc:[]};
 const s=sid(p,k2),oc=st.t[1-p].map((x,j)=>x>0&&x<80&&sid(1-p,x)==s?j:-1).filter(j=>j>=0);
 if(s=='F')return{k2,s,oc:oc.slice(0,1),both:oc.length>0};
 if(SAFE.has(s))return oc.length?null:{k2,s,oc:[]};
 if(OPEN.test(s))return{k2,s,oc:[]};
 return{k2,s,oc}}
function clone(st){return{t:[st.t[0].slice(),st.t[1].slice()],en:st.en.slice(),cp:st.cp.slice(),aon:st.aon,pool:st.pool.slice()}}
function step(st,p,i,v){const r=trial(p,i,v,st);if(!r)return null;const n=clone(st),t=n.t[p];if(t[i]==0)n.en[p]=true;t[i]=r.k2;
 if(r.both){n.t[1-p][r.oc[0]]=0;t[i]=0}else if(r.oc.length){r.oc.forEach(j=>n.t[1-p][j]=0);n.cp[p]=true}
 n.pool.splice(n.pool.indexOf(v),1);return n}
function valid(st,p){const m={};for(const k of st.t[p]){if(k<1||k>=80)continue;const s=sid(p,k);if(SAFE.has(s)||OPEN.test(s))continue;if(m[s])return false;m[s]=1}return true}
function can(st,p){const key=JSON.stringify([st.t[p].slice().sort((a,b)=>a-b),st.t[1-p].slice().sort((a,b)=>a-b),st.en,st.cp,st.aon,st.pool.slice().sort()]);
 if(MEMO.has(key))return MEMO.get(key);if(++BUD>30000)return true;
 let res=false,any=false;const seen=new Set();
 for(const v of new Set(st.pool)){for(let i=0;i<st.t[p].length;i++){const sk=st.t[p][i]+'_'+v;if(seen.has(sk))continue;seen.add(sk);
  const n=step(st,p,i,v);if(!n)continue;any=true;if(can(n,p)){res=true;break}}if(res)break}
 if(!any)res=valid(st,p);MEMO.set(key,res);return res}
function ok(p,i,v){if(!trial(p,i,v))return false;BUD=0;return can(step(S,p,i,v),p)}
function legal(p,v){const t=S.t[p],r=[];let b=false;t.forEach((k,i)=>{if(k==0){if(b)return;b=true}if(ok(p,i,v))r.push(i)});return r}
function anyLegal(){return S.pool.some(v=>legal(S.turn,v).length)}
function act(){return S.pl[S.order[S.tp]]}
/* who may THROW: only the active player */
function canAct(){if(!S||S.over||LOCK)return false;const a=act();return a.cpu?(M!='online'||isHost):(M=='online'?a.uid===ME:true)}
/* who may MOVE coins: any non-spectator member of the team whose turn it is */
function human(){if(!S||S.over||LOCK)return false;if(M!='online')return !act().cpu;return S.pl.some(p=>p.team==S.turn&&p.uid===ME&&!p.gone)}
function nextPlayer(){const n=S.order.length;for(let k=0;k<n;k++){S.tp=(S.tp+1)%n;if(!S.pl[S.order[S.tp]].gone)break}S.turn=S.pl[S.order[S.tp]].team}
function mk(pl,n,order){order=order||pl.map((_,i)=>i);const seats=[0,1].map(t=>({name:pl.filter(p=>p.team==t).map(p=>p.name).join(' & '),cpu:pl.some(p=>p.team==t&&p.cpu)}));S={pl,order,tp:0,seats,n,t:[0,1].map(()=>Array(n).fill(0)),turn:pl[order[0]].team,phase:'throw',pool:[],dice:[null,null],en:[false,false],cp:[false,false],over:false,win:-1,v:1}}
function doThrow(){if(!S||S.phase!='throw'||rolling||!canAct())return;if(M=='online')return netThrow();rolling=true;const a=Math.random()*4|0,b=Math.random()*4|0;
 DC[0]+=2;DC[1]+=3;rollSync([-(a*90)-360*DC[0],-(b*90)-360*DC[1]],()=>{rolling=false;applyThrow(a,b)})}
function applyThrow(a,b){const v=a+b==0?12:a+b;S.dice=[a,b];sel=0;S.bt=0;S.dn=0;const p=S.turn;if(!S.en[p]&&!S.pool.includes(1)&&v!=1){if(v==5||v==6||v==12){S.dn=v;S.phase='throw';return commit()}}else S.pool.push(v);S.aon=S.t[p].some(k=>k>=62&&k<80);
 if([1,5,6,12].includes(v)){S.phase='throw';return commit()}
 S.phase='move';if(S.t[S.turn].includes(0)&&S.pool.includes(1))sel=S.pool.indexOf(1);if(!anyLegal()){S.phase='skip';commit();const x=S.v;setTimeout(()=>{if(S.v==x){endTurn();commit()}},1100);return}commit()}
function endTurn(){MEMO.clear();if(S.bn>0){S.bn--;S.bt=1}else{nextPlayer();S.bt=0;S.cb=0}S.phase='throw';S.pool=[];sel=0}
function mv(i,v){const p=S.turn;if(!ok(p,i,v))return;const r=trial(p,i,v);const t=S.t[p];S.mv={id:(S.mv?S.mv.id:0)+1,p,i,from:t[i],to:r.k2};if(t[i]==0)S.en[p]=true;t[i]=r.k2;
 const ev=[];if(r.both){ev.push([1-p,r.oc[0],S.t[1-p][r.oc[0]]],[p,i,r.k2]);S.t[1-p][r.oc[0]]=0;t[i]=0}else if(r.oc.length){r.oc.forEach(j=>{ev.push([1-p,j,S.t[1-p][j]]);S.t[1-p][j]=0});S.cp[p]=true;if(!S.cb){S.cb=1;S.bn=1}}
 if(ev.length)S.ev={id:(S.ev?S.ev.id:0)+1,c:ev};
 S.pool.splice(S.pool.indexOf(v),1);sel=0;
 if(t.every(x=>x==80)||(!S.cp[1-p]&&t.every(x=>x>=61))){S.over=true;S.win=p}else if(!S.pool.length||!anyLegal())endTurn();commit()}
function tapCoin(p,i){if(!S||S.phase!='move'||p!=S.turn||!human())return;
 let v=S.pool[sel];if(v==null||!ok(p,i,v))v=S.pool.find(x=>ok(p,i,x));if(v!=null){if(M=='online')return netMove(i,v);mv(i,v)}}
function cpuPlay(){const p=S.turn;let best=null,bs=-1e9;
 S.pool.forEach(v=>S.t[p].forEach((k,i)=>{if(!ok(p,i,v))return;const r=trial(p,i,v);let s=Math.random()*3+r.k2*.2+(r.oc.length?100:0)+(r.k2==80?80:0)+(k==0?40:0)+(SAFE.has(r.s)?6:0)-(r.both?60:0);if(s>bs){bs=s;best=[i,v]}}));
 if(best)mv(best[0],best[1]);else{endTurn();commit()}}
function commit(){S.v++;draw();push();drive()}
function drive(){clearTimeout(T);if(!S||LOCK)return;if(S.over){if(inGame){inGame=false;OT=setTimeout(showWin,1400)}return}
 const c=act();if(c.cpu&&(M!='online'||isHost)){if(S.phase=='throw')T=setTimeout(doThrow,900);else if(S.phase=='move')T=setTimeout(cpuPlay,1000)}}
