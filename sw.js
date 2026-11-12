// Offline cache. Every game listed in games/registry.js is pre-cached on install, so games never opened still work offline.
// Strategy: serve from cache instantly, refresh the cached copy in the background (updates arrive on the next launch).
// No VERSION bump needed per change; bump it only to force a clean cache (e.g. after removing files).
importScripts('games/registry.js');
const VERSION = 'games-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'shell.js', 'shared/input.js', 'games/registry.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];
const FILES = SHELL.concat(...(self.GAMES || []).map((g) => ['icon.svg', ...g.files].map((f) => 'games/' + g.id + '/' + f)));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const refresh = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(refresh.catch(() => {})); return hit; }
    return refresh.catch(() => (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
  }));
});
