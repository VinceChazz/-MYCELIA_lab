/* Offline shell. API data is NOT cached here: IndexedDB tracks its provenance and age. */
const CACHE = 'rtp-shell-__BUILD_ID__'; // replaced with the asset hash by the production build
const FALLBACK = ['/', '/manifest.webmanifest', '/favicon.svg', '/images/farm-hero.jpg'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let assets = FALLBACK;
    try {
      const response = await fetch('/precache.json', { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json();
        if (Array.isArray(manifest.assets)) assets = [...new Set([...FALLBACK, ...manifest.assets])];
      }
    } catch { /* serve the basic shell if the manifest cannot be fetched */ }
    // Don't activate with a partial shell: include lazy modules so every screen works offline.
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy=response.clone(); void caches.open(CACHE).then(cache => cache.put('/', copy)); }
      return response;
    }).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) { const copy=response.clone(); void caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
