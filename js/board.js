/* Board geometry (square coordinates) and SVG board drawing */
/* geometry */
function rN(n){if(n<=6)return[80+80*(n-1),1520];if(n<=12)return[560,1520-80*(n-7)];if(n==13)return[560,1040];if(n<=19)return[480-80*(n-14),1040];if(n<=31)return[80,960-80*(n-20)];if(n<=36)return[80+80*(n-31),80];return[560,80]}
function rD(n){if(n<=49)return[626+52*(n-45),586+52*(n-45)];if(n==50)return[891,821];return[891,751-62*(n-51)]}
function sq(p,n){let r;if(n<=37)r=rN(n);else if(n==38)r=[640,960];else if(n<=44)r=[560,960-80*(n-39)];else r=rD(n);
 return p&&!(n>=39&&n<=44)&&!(n<=37&&r[0]==560)?[1120-r[0],r[1]]:r}
function pos(p,k,i){const n=S.n;
 if(k==0){const q=slot(p,i,n);return[q[0],q[1],23]}
 if(k==80){return[560+(p?1:-1)*(30+(i%3)*34),340-((i/3|0)-1.5)*34,15]}
 let q;if(k<=37)q=sq(p,k);else if(k<=60)q=sq(1-p,36-(k-38));else if(k==61)q=sq(p,38);else q=sq(p,k-23);return[q[0],q[1],24]}
function sid(p,k){const L='RB';
 if(k<=37)return k==7||k==37||(k>=8&&k<=12)?'C'+k:k==13?'S':L[p]+k;
 if(k<=60)return L[1-p]+(36-(k-38));
 if(k==61)return 'S';if(k<=67)return 'C'+(k-23);if(k==79)return 'F';return L[p]+(k-23)}
function slot(p,i,n){const c=[[280,1280],[840,1280]][p];let R,a;
 if(n<=6){R=n==4?62:72;a=i/n*2*Math.PI-Math.PI/2}
 else if(i<8){R=96;a=i/8*2*Math.PI-Math.PI/2}else{R=40;a=(i-8)/4*2*Math.PI-Math.PI/4}
 return[c[0]+R*Math.cos(a),c[1]+R*Math.sin(a)]}
const STAR='M0,-30L8,-10L29,-9L13,5L18,26L0,15L-18,26L-13,5L-29,-9L-8,-10Z';
function shape(p,n,x,y){let pts;
 if(n>=45&&n<=49){const j=n-45,x0=600+52*j,x1=x0+52,f=a=>p?1120-a:a;pts=[[x0,x0-80],[x1,x1-80],[x1,x1],[x0,x0]].map(q=>[f(q[0]),q[1]])}
 else{let w=80,h=80;if(n>=50){w=62;h=n==50?78:62}pts=[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]]}
 const P=pts.map(q=>[x+(q[0]-x)*.92,y+(q[1]-y)*.92].join(',')).join(' ');
 return `<polygon points="${P}" fill="#f9d77e" stroke="#e2a93b" stroke-width="4" stroke-linejoin="round"/>`}
function buildBoard(){let h='',seen={};const xs=new Set([1,7,13,19,25,31,37,38,44,50,56]);
 const add=(p,n,c)=>{const [x,y]=sq(p,n),key=x+','+y;if(seen[key])return;seen[key]=1;
  const com=(n>=39&&n<=44)||(n<=37&&[7,8,9,10,11,12,13,37].includes(n)),col=com?'#7b1fa2':c,st=xs.has(n),big=n<45;
  h+=shape(p,n,x,y);
  if(st)h+=`<path d="${STAR}" transform="translate(${x},${y}) scale(${n>=50?.75:1})" fill="#ffb300" stroke="#e08a00" stroke-width="2" stroke-linejoin="round"/>`;
  h+=`<text x="${st?x-(big?26:16):x}" y="${st?y-(big?20:14):y+(big?8:6)}" font-size="${st?16:big?24:n>=50?18:16}" font-weight="700" text-anchor="middle" fill="${col}" opacity=".85">${n}</text>`};
 for(let n=1;n<=56;n++){add(0,n,'#c62828');add(1,n,'#1565c0')}
 h+=`<circle cx="560" cy="340" r="118" fill="#f9d77e" stroke="#e2a93b" stroke-width="5"/><ellipse cx="515" cy="315" rx="13" ry="20" fill="#e0a020"/><ellipse cx="605" cy="315" rx="13" ry="20" fill="#e0a020"/><path d="M485 370Q560 435 635 370" fill="none" stroke="#e0a020" stroke-width="10" stroke-linecap="round"/>`;
 [0,1].forEach(p=>{const c=[280,840][p];h+=`<circle cx="${c}" cy="1280" r="137" fill="${p?'#3f87e0':'#e8505b'}" stroke="${p?'#1f5fb8':'#b02a35'}" stroke-width="8"/>`;
  for(let i=0;i<S.n;i++){const [x,y]=slot(p,i,S.n);h+=`<circle cx="${x}" cy="${y}" r="29" fill="#2a1a1a" stroke="${p?'#164a94':'#8c1f28'}" stroke-width="4" opacity=".75"/>`}});
 $('#bd').innerHTML=`<svg viewBox="0 0 1120 1600"><defs><radialGradient id="g0" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb4ab"/><stop offset=".45" stop-color="#e53935"/><stop offset="1" stop-color="#7f1010"/></radialGradient><radialGradient id="g1" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#b8f4ff"/><stop offset=".45" stop-color="#22a6e8"/><stop offset="1" stop-color="#0b3a85"/></radialGradient><linearGradient id="wd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ee9a40"/><stop offset="1" stop-color="#d9772a"/></linearGradient></defs><rect width="1120" height="1600" rx="30" fill="url(#wd)"/><path d="M60 700C300 640 500 760 1060 700M80 1000C400 940 700 1040 1040 980" stroke="#f3b36a" stroke-width="10" fill="none" opacity=".4"/><rect x="14" y="14" width="1092" height="1572" rx="26" fill="none" stroke="#5e86b5" stroke-width="10"/>${h}<g id="cn"></g></svg>`;
 $('#bd').onclick=e=>{const c=e.target.closest('[data-i]');if(c)tapCoin(+c.dataset.p,+c.dataset.i)}}
