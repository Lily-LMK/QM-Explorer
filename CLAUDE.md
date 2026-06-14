# CLAUDE.md — QM Collections Explorer

Project-level guidance, auto-loaded each session. This is the **specific truth for
this folder**; the workspace file at `~/Documents/Claude/CLAUDE.md` holds the broader
working philosophy (Explore → Plan → Code → Commit, biodiversity context, Lily's
profile). Read both. For deep planning, also read `docs/PLANNING-BRIEF.md` and the
current-chapter brief `docs/BROWSE-REDESIGN-BRIEF.md`.

## What this is

A single-file, **no-build, keyless static web app** for exploring Queensland Museum's
natural-history collections via the Atlas of Living Australia (ALA), enriched with
GBIF, iNaturalist, Wikipedia, and Queensland Government / Geoscience Australia spatial
services. Deployed on GitHub Pages: <https://lily-lmk.github.io/QM-Explorer>.

- `index.html` — the entire app (~6,300 lines: HTML + CSS + JS inline). No framework,
  no build step. External deps (Leaflet, fonts) load via CDN.
- `sw.js` — optional service worker: caches CDN assets + API responses. App runs
  without it.
- `README.md` — architecture, data sources, deployment, caching.
- `docs/` — planning briefs and the ALA bug report (see "Current chapter").

Five views: **Records, Taxa, Browse, Map, Analytics**, plus CSV export. All ALA
queries are scoped to QM via `institution_uid:in15` (state field `S.alaInst`).

## How to run / verify

There is no build. Serve the folder over http (NOT `file://`, or the service worker
and some fetches misbehave):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

…or use the VS Code **Live Preview** extension (right-click `index.html` → Show
Preview). Verify by clicking through the real UI and watching the browser console +
network tab. **Dev note:** `sw.js` caches aggressively — if a change doesn't show,
hard-reload (Cmd+Shift+R) or DevTools → Application → Service Workers → "Update on
reload". After changing `sw.js`, bump the cache version (`qm-*-vN`) so old caches purge.

## ALA API constraints — READ BEFORE TOUCHING ANY ALA QUERY

These were discovered in June 2026 when the app started producing errors — they may be
long-standing API behaviours the app was inadvertently violating, or recent infrastructure
changes on ALA's side; the root cause is unknown. Violating them produces a browser error
that often surfaces as a misleading **"ALA 503"**.
`biocache-ws.ala.org.au/ws/occurrences/search` is the main endpoint.

1. **`pageSize` ≤ 100.** Larger → real HTTP 503. Use the constant `ALA_MAX_PAGE`.
   (`flimit`, the facet limit, is exempt.)
2. **Result window = 5000.** ALA serves nothing past index 5000
   (`startIndex + pageSize ≤ 5000`). Constant `ALA_MAX_RESULTS`.
3. **No deep-paging cursor.** The old `id:{lastId TO *}` cursor is dead (ALA stopped
   returning a queryable `id`); `cursorMark` is unsupported. To exceed 5000 you must
   **partition** the query — the Map uses a lat/long **quadtree** (`bgLoadAllPages`):
   count a tile, and if >5000 split into 4, else offset-page it, dedupe by uuid.
4. **CORS — the big one. NEVER AND-join filters into one `fq`.** ALA drops the
   `Access-Control-Allow-Origin` header when a single `fq` contains
   `A AND B AND …`; the browser then blocks the response (looks like "ALA 503").
   **Always send each clause as a SEPARATE `fq` param** via the helpers
   **`appendFQ(urlParams, clausesArray)`** or **`fqQS(clausesArray)`**. `curl` never
   sees this (it ignores CORS), so test in a real browser.
5. **Bulk download endpoint needs auth** (`/ws/occurrences/index/download` → 403) —
   not usable from this keyless app.
6. **Decision (do not re-litigate): keyless & purely static.** No API key, no proxy;
   we accept slower large downloads (they load incrementally). Only revisit if instant
   full loads of 100k+ datasets ever become a real need.

When a browser ALA call fails but `curl` succeeds, suspect the missing CORS header,
not a real outage.

## Key code patterns & pointers (`index.html`)

- **State:** one mutable object `S` holds all app state (`S.res`, `S.total`, `S.view`,
  `S.facets`, `S.allPts`, `S.mapPoly`, …).
- **Query building:** `alaBaseFQ(f)` returns an **array** of fq clauses. Turn it into a
  request with `appendFQ(u, alaBaseFQ(f))` — never `.join(' AND ')`.
- **Constants (top of script):** `ALA_MAX_PAGE=100`, `ALA_MAX_RESULTS=5000`,
  `MAP_POINT_CAP=50000`, `INIT_PAGE`, `FLIM`.
- **Search:** `doSearch()` (standard + polygon paths). Map deep-load: `bgLoadAllPages`
  (quadtree, retry/backoff, bounded concurrency, uuid dedupe). Polygon: `bgPolyScan`.
- **Common names (vernaculars):** `lookupVern` (GBIF + iNaturalist, thorough),
  `lookupVernFast` (rank-aware, cheaper), `_localVern` (curated dictionary), cached in
  `_vernCache`. Records/cards use `batchFetchVernaculars` / `fetchVernacular`. The Taxa
  tree uses `_fillTreeVern` with **lazy** resolution (IntersectionObserver +
  `_queueTreeVern` throttle) so big expansions don't hammer the APIs — reuse this
  pattern. **`lookupVern` is the shared resolver: it trusts `_localVern` and already
  applies `isGenericVern` to API results internally — never re-filter its output, or
  you blank correct curated names (the auto-populate at ~:4793 poisons family names
  into `_genericVernSet`).** `lookupSubfamilyVern` (genus→subfamily/tribe climb) now
  works (returns + caches).
- **Service worker:** propagates real network/CORS failures (does NOT manufacture a
  synthetic 503); passes real upstream HTTP errors through with their true status.

## Conventions / house rules

- **CORS-safe `fq` always** (separate params). This is the #1 rule.
- **Responsible API use:** cache (in-page + SW), throttle, and lazy-load (resolve only
  what's visible). Public services are fragile — don't burst hundreds of requests.
- **Scientific integrity:** separate evidence from inference; preserve identifiers
  (catalogue numbers, uuids, taxonConceptID); show provenance/attribution; make common
  names **rank-appropriate** (a family tile shows the family's name, not a random
  species'); a blank beats a mislabel.
- **Accessibility (WCAG 2.1 AA):** keyboard nav, visible focus, labels, modal focus
  trap, honour `prefers-reduced-motion`. Accessibility is part of quality.
- **Single static file, no build.** Add libraries via CDN (like Leaflet). Keep it
  self-contained and deployable to GitHub Pages.
- **Honest UI states:** clear loading / empty / error states; don't disguise failures.

## Git workflow

- Branch for any non-trivial change (`git checkout -b <feature>`); keep `main`
  deployable (it's the live site).
- Small, focused commits with clear messages; verify in the browser before committing.
- Push only when Lily asks.

## Current chapter

**Redesign the Browse view** — full spec in `docs/BROWSE-REDESIGN-BRIEF.md`, sequenced
in `docs/ROADMAP.md`. Phase 1 (stabilise) is **done and live**. Now in **Phase 2
(foundation)**: the rank-appropriate **image-resolution cascade** (QM specimen →
ALA-wide/BIE → iNaturalist/Wikipedia → elegant placeholder; robust to `<img>` load
failures, cached, with provenance + attribution), then the holdings-stats helper.
Phase 3 is the awwwards-level experience (GSAP/Three.js on a reduced-motion baseline).
Build in the roadmap's order, one commit at a time, verifying each in-browser.

Also pending (non-code): send `docs/ALA-API-bug-report.md` to the ALA team.

## Recent state (June 2026)

Fixed a wave of ALA breaking changes and shipped them live: `pageSize` cap, the
5000-window + map quadtree, the app-wide CORS `fq` fix, service-worker hardening, and
Taxa-tree common names (lazy). **Phase 1 stabilisation now also live:** `?selftest`
harness, the `fetchQualityCounts` CORS fix, `lookupSubfamilyVern` repaired, Browse
vernaculars made rank-correct, plus two hotfixes (Taxa tree trusts `_localVern`;
better Lepidoptera family names). Records cards, the specimen modal, Taxa, **and Browse
common names** are all correct now. Remaining Browse weakness is **images** (blank/
dashed tiles) — the Phase 2 cascade is the fix.
