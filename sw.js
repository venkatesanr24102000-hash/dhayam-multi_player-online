const C='dhayam-v4',F=["./", "index.html", "manifest.webmanifest", "css/style.css", "js/config.js", "js/board.js", "js/rules.js", "js/animation.js", "js/render.js", "js/game.js", "js/online.js", "assets/audio/dice_roll.wav", "assets/audio/capture.mp3", "assets/images/dice_0.png", "assets/images/dice_1.png", "assets/images/dice_2.png", "assets/images/dice_3.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/apple-touch-icon.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
/* network first, so a new deployment is picked up immediately; the cache is only the offline fallback */
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp)).catch(()=>{})}return res}).catch(()=>caches.match(r)))});
