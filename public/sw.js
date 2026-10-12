const CACHE_NAME = 'ekirum-cache-v4';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/fonts/albert-sans-latin.woff2',
  '/fonts/albert-sans-latin-ext.woff2',
  '/fonts/albert-sans-italic-latin.woff2',
  '/fonts/albert-sans-italic-latin-ext.woff2',
  '/fonts/cormorant-garamond-latin.woff2',
  '/fonts/cormorant-garamond-latin-ext.woff2',
  '/fonts/cormorant-garamond-italic-latin.woff2',
  '/fonts/cormorant-garamond-italic-latin-ext.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch((err) => {
      console.warn('SW precache skipped:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and http/https schemes
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache valid responses for offline use
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback to cache if network is unreachable
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // If navigation request fails, fallback to index.html if cached
        if (event.request.mode === 'navigate') {
          const fallback =
            (await caches.match('/index.html')) ||
            (await caches.match('/')) ||
            (await caches.match(self.registration.scope));
          if (fallback) return fallback;
        }
        return Promise.reject('Offline and asset not cached');
      })
  );
});
