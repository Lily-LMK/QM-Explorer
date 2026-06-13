/* QM Collections Explorer — Service Worker
   Caches static CDN assets and API responses for faster repeat access.

   Strategy:
   - Static CDN (Leaflet, fonts): cache-first, indefinite (versioned URLs)
   - API data (ALA, GBIF, Wikipedia, BIE): stale-while-revalidate, 1 hour
   - Specimen images (ALA images): cache-first, 24 hours
   - Everything else: network-only (no caching)

   IMPORTANT — error handling: when a network fetch genuinely fails (a CORS block,
   DNS/network error, or a rejected request), this SW lets the error PROPAGATE as a
   real network failure. It must NOT manufacture a synthetic Response (e.g. a fake
   503), because the page can't tell that apart from a real upstream HTTP error.
   A previous version returned `new Response('Network error',{status:503})` here,
   which made an ALA CORS bug look like "ALA 503" and was very hard to diagnose.
   Real upstream HTTP errors (a genuine 500/503 from ALA) still pass through with
   their true status, because fetch() resolves for those — only rejections propagate.
*/

const CACHE_STATIC = 'qm-static-v2';
const CACHE_API = 'qm-api-v2';
const CACHE_IMG = 'qm-img-v2';

const API_MAX_AGE = 60 * 60 * 1000;       // 1 hour
const IMG_MAX_AGE = 24 * 60 * 60 * 1000;  // 24 hours
const API_MAX_ENTRIES = 500;
const IMG_MAX_ENTRIES = 600;

/* ── Static CDN assets to precache on install ── */
const PRECACHE = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
];

/* ── URL patterns ── */
const STATIC_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const API_PATTERNS = [
  /biocache-ws\.ala\.org\.au/,
  /bie-ws\.ala\.org\.au/,
  /api\.gbif\.org\/v1\/species/,
  /api\.inaturalist\.org\/v1\/taxa/,
  /en\.wikipedia\.org\/api/,
  /en\.wikipedia\.org\/w\/api/,
  /spatial\.ala\.org\.au\/ws\/intersect/,
];

const IMG_PATTERNS = [
  /images\.ala\.org\.au/,
  /tile\.openstreetmap\.org/,
  /tile\.opentopomap\.org/,
];

/* ── Install: precache static assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(PRECACHE).catch(err => {
        console.warn('[SW] Precache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old cache versions ── */
self.addEventListener('activate', event => {
  const keep = new Set([CACHE_STATIC, CACHE_API, CACHE_IMG]);
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: route requests to appropriate strategy ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  /* Only handle GET requests */
  if (event.request.method !== 'GET') return;

  /* Static CDN: cache-first */
  if (STATIC_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(cacheFirst(event.request, CACHE_STATIC));
    return;
  }

  /* Specimen images: cache-first with TTL */
  if (IMG_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(cacheFirstTTL(event.request, CACHE_IMG, IMG_MAX_AGE, IMG_MAX_ENTRIES));
    return;
  }

  /* API data: stale-while-revalidate with TTL */
  if (API_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_API, API_MAX_AGE, API_MAX_ENTRIES));
    return;
  }

  /* Everything else: network-only (no caching) */
});

/* ═══ Strategies ═══ */

/* Cache-first: return cached version, fall back to network.
   A network failure propagates (no synthetic response). */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/* Cache-first with TTL: return cached if fresh, otherwise fetch */
async function cacheFirstTTL(request, cacheName, maxAge, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    const cachedTime = cached.headers.get('x-sw-cached');
    if (cachedTime && (Date.now() - parseInt(cachedTime)) < maxAge) {
      return cached;
    }
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      /* Clone and add timestamp header */
      const headers = new Headers(response.headers);
      headers.set('x-sw-cached', Date.now().toString());
      const stamped = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
      cache.put(request, stamped);
      trimCache(cacheName, maxEntries);
    }
    return response;
  } catch (err) {
    /* On network failure, fall back to stale cache if we have one; else propagate. */
    if (cached) return cached;
    throw err;
  }
}

/* Stale-while-revalidate: return cached immediately, fetch in background */
async function staleWhileRevalidate(request, cacheName, maxAge, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  /* Always kick off a network fetch to update the cache. Do NOT swallow the
     rejection here — only the background path below should ignore failures. */
  const networkUpdate = fetch(request).then(async response => {
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('x-sw-cached', Date.now().toString());
      const body = await response.clone().blob();
      const stamped = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
      await cache.put(request, stamped);
      trimCache(cacheName, maxEntries);
    }
    return response;
  });

  if (cached) {
    /* Serve cache immediately; let the network update run in the background and
       swallow only its errors (the page already has a usable response). */
    networkUpdate.catch(() => {});
    return cached;
  }

  /* No cache — await the network. A genuine network/CORS failure rejects here and
     propagates as a real network error (not a misleading 503); a real upstream
     HTTP error resolves and passes through with its true status. */
  return await networkUpdate;
}

/* Trim cache to max entries (FIFO by insertion order) */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    const excess = keys.length - max;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  }
}
