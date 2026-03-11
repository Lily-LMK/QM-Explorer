/* QM Collections Explorer — Service Worker
   Caches static CDN assets and API responses for faster repeat access.
   
   Strategy:
   - Static CDN (Leaflet, fonts): cache-first, indefinite (versioned URLs)
   - API data (ALA, GBIF, Wikipedia, BIE): stale-while-revalidate, 1 hour
   - Specimen images (ALA images): cache-first, 24 hours
   - Everything else: network-only (no caching)
*/

const CACHE_STATIC = 'qm-static-v1';
const CACHE_API = 'qm-api-v1';
const CACHE_IMG = 'qm-img-v1';

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

/* Cache-first: return cached version, fall back to network */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Network error', { status: 503 });
  }
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
    /* On network failure, return stale cache if available */
    if (cached) return cached;
    return new Response('Network error', { status: 503 });
  }
}

/* Stale-while-revalidate: return cached immediately, fetch in background */
async function staleWhileRevalidate(request, cacheName, maxAge, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  /* Always kick off a network fetch to update the cache */
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
  }).catch(() => null);

  if (cached) {
    /* Return cached response immediately; network update runs in background */
    return cached;
  }

  /* No cache — must wait for network */
  const response = await networkUpdate;
  return response || new Response('Network error', { status: 503 });
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
