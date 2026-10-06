// Offline cache for the web app.
const CACHE = 'leonida-v4';
const ASSETS = [
  './', './index.html', './css/style.css', './manifest.webmanifest', './icons/icon.svg',
  './js/vendor/three.min.js', './js/data.js', './js/world.js', './js/audio.js', './js/radio.js', './js/entities.js', './js/game.js', './js/render.js', './js/ui.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first so updates show up, cache as fallback when offline.
// 'no-cache' makes the browser revalidate with the server instead of reusing a stale HTTP-cached copy.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request.mode === 'navigate' ? e.request.url : e.request, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
