/* Vikash Rice Mill — Service Worker (offline support)
   Site update karne par CACHE_VERSION badal dein (v1 -> v2) taaki naya version aa jaye. */
const CACHE_VERSION = 'v1';
const CORE_CACHE = 'vrm-core-' + CACHE_VERSION;
const RUNTIME_CACHE = 'vrm-runtime-' + CACHE_VERSION;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('vrm-') && k !== CORE_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isCacheable(res) {
  return res && (res.ok || res.type === 'opaque');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* Page open karna: pehle cache (instant, offline), peeche se update */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CORE_CACHE);
      const cached = (await cache.match('./index.html')) || (await cache.match('./'));
      const refresh = fetch(req).then((res) => {
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(refresh); return cached; }
      const net = await refresh;
      return net || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }

  /* Same-origin files (icons, manifest): cache-first */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        if (isCacheable(res)) { const c = res.clone(); caches.open(CORE_CACHE).then((ca) => ca.put(req, c)); }
        return res;
      }))
    );
    return;
  }

  /* Google Fonts (CSS + font files): ek baar online load hote hi cache ho jayenge */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const fetching = fetch(req).then((res) => {
          if (isCacheable(res)) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (hit) { event.waitUntil(fetching); return hit; }
        return (await fetching) || Response.error();
      })
    );
  }
});
