// VERSION, BUILD and ASSETS are injected by offline-assets.mjs after next build.
const PREFIX = 'dailyinspection-shell-';
const CACHE = PREFIX + BUILD;
const REQUIRED = ['/', '/offline-assets.json', ...ASSETS];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      // Sequential writes prevent in-flight puts from recreating an incomplete cache after failure.
      for (const path of REQUIRED) {
        const response = await fetch(path, {cache:'reload'});
        if (!response.ok) throw new Error('Aset offline belum tersedia.');
        if (path === '/') {
          const html=await response.clone().text();
          if (!html.includes('<title>Inspeksi Geoteknik Harian</title>') || !html.includes('self.__next_f')) throw new Error('Shell aplikasi belum tersedia.');
        }
        await cache.put(path,response);
      }
    } catch (err) { await caches.delete(CACHE); throw err; }
  })());
});
// No skipWaiting: existing forms keep their matching shell until all old tabs close.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data !== 'OFFLINE_STATUS' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const ready = (await Promise.all(REQUIRED.map(path=>cache.match(path)))).every(Boolean);
    event.ports[0].postMessage({ready,build:BUILD,version:VERSION});
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const shell = request.mode === 'navigate' && url.pathname === '/';
  if (!shell && url.pathname !== '/offline-assets.json' && !ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(shell ? '/' : url.pathname) ?? fetch(request);
  })());
});
