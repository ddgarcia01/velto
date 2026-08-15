/* Umbral — service worker.
   Guarda el caparazón para que la app abra sin conexión.
   Al publicar una versión nueva, subí el número de CACHE. */
const CACHE = 'umbral-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req).then(hit => {
    const red = fetch(req).then(res => {
      if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
      return res;
    }).catch(() => hit);
    return hit || red;
  }));
});
