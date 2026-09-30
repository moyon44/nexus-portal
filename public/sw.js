/* Nexus Portal service worker: makes the portal installable and keeps the
 * last loaded page for offline use. Only page navigations are handled
 * (network first, cached copy when offline); scripts, the API and Vite's
 * dev server go straight to the network. */
const CACHE = 'nexus-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
        }
        return res;
      })
      .catch(() => caches.match('/').then((r) => r || Response.error())),
  );
});
