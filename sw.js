const CACHE = 'portfolio-v1-3';
const FILES = ['./', './index.html', './firebase-config.js', './firebase-sync.js',
  './portfolio-merge.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const ASSETS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('portfolio-v') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sdk = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/13.4.0/');
  if (!ASSETS.has(url.href) && !sdk) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const response = await cache.match(request);
      if (response) return response;
      throw error;
    }
  })());
});
