/* Umbral — service worker.
   La página se pide primero a la red (así una versión nueva llega en la primera apertura) y,
   sin conexión o si la red tarda más de 3 s, se sirve la copia guardada. Íconos y manifiesto:
   primero la copia, y se refrescan en segundo plano.
   Al publicar una versión nueva, subí el número de CACHE. */
const CACHE = 'umbral-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const guardar = (req, res) => { if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return res; };
const conTiempo = (p, ms) => new Promise((ok, mal) => { const t = setTimeout(() => mal(new Error('lento')), ms); p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); mal(e); }); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const esPagina = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (esPagina) {
    e.respondWith(conTiempo(fetch(req, { cache: 'no-cache' }), 3000).then(r => guardar(req, r))
      .catch(() => caches.match(req).then(h => h || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const red = fetch(req).then(r => guardar(req, r)).catch(() => hit);
    return hit || red;
  }));
});
