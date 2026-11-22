/* Global constants, shared state and screen helper */
const $=s=>document.querySelector(s),COL=['#e53935','#1e40ff'],NM=['Red','Blue'];
const SAFE=new Set(['R1','B1','C7','S','R19','B19','R25','B25','R31','B31','C37','C44','F']);
const OPEN=/^[RB][1-6]$|^[RB](4[5-9]|5\d)$/;
let S,M='cpu',ME,NAME='Player',DB,ROOM,UNSUB,isHost=false,isSpec=false,inGame=false,rolling=false,T,OT,N=4,cfg,sel=0;
function go(id){document.querySelectorAll('.s').forEach(e=>e.classList.toggle('on',e.id==id))}
function myName(){NAME=$('#nm').value.trim()||'Player';try{localStorage.setItem('dhName',NAME)}catch(e){}return NAME}
setTimeout(()=>{try{$('#nm').value=localStorage.getItem('dhName')||''}catch(e){}go('hm')},1700);
