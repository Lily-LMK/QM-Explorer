# CLAUDE.md — QM Collections Explorer

Project-level guidance, auto-loaded each session. This is the **specific truth for
this folder**; the workspace file at `~/Documents/Claude/CLAUDE.md` holds the broader
working philosophy (Explore → Plan → Code → Commit, biodiversity context, Lily's
profile). Read both. For where the project is and what's next, read `docs/ROADMAP.md`;
the Phase 3 creative spec is `docs/BROWSE-REDESIGN-BRIEF.md`. To start a fresh session,
`docs/KICKOFF.md` has a ready-to-paste kickoff prompt.

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
   **Offset paging MUST send a stable sort** (`sort=id&dir=asc`). ALA's default order is
   unstable across `startIndex`, so paging silently skips/duplicates ~8–16% of rows; the
   map quadtree (`pageTile`), the Records pager, and `bgPolyScan` all sort by id, and any
   new paging loop must too. (Also: `geospatial_kosher:true` ≠ plottable — ~4% return no
   coordinate; the map labels those honestly, never as "sensitive" without evidence.)
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
- **Group images (Browse):** `resolveGroupImage(name, rank, opts)` resolves one
  representative image per taxonomic group through a **museum-first cascade** — QM
  specimen → another institution's preserved specimen (`basis_of_record:"PreservedSpecimen"`,
  `-institution_uid:in15`) → iNaturalist → Wikipedia → BIE → generated SVG placeholder.
  It **preloads each URL** (`_imgPreload`) and falls through on load failure, so the
  returned candidate is guaranteed to display; result cached in `_groupImgCache` (stores
  the in-flight promise; evicts placeholders/failures so a blip doesn't lock a group).
  `renderGuide` fills QM images via the existing batch pass, then for QM-empty tiles
  calls `resolveGroupImage(...,{skipQM:true})` **lazily** through `_queueGuideImg`
  (mirrors the Taxa tree's throttle). Every image carries provenance + attribution.
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

**Phase 3 — Browse redesign, plus a Records/Map polish detour.** Full plan in
`docs/ROADMAP.md`, creative spec in `docs/BROWSE-REDESIGN-BRIEF.md`, Browse slice plan in
`docs/BROWSE-8C-PLAN.md`. Work happens on `phase3-browse` and deploys to live `main` per
verified slice (maintenance mode — push often). Governing decision: **elevate within the
app's existing design language** (palette, Barlow, sharp geometry) — no separate skin (an
8c-1 divergent palette/serif was reverted). Phases 0–2 foundation (image cascade #6,
`deriveHoldingsStats` #7) and Browse 8a/8b/8c-a remain live.

**Done & live since the last doc sync:**
- **Browse 8c** — common names now resolve for **all ~200 tiles** via a bounded pool
  (`_queueGuideVern`; dropped the old `slice(0,50)` + sequential `lookupVern`). Homonym
  fixes via `_localVern` + rank-aware iNat: **Acanthocephala** (thorny-headed worms, not
  the bug genus), **Ciliophora**, **Nucleocytoviricota**.
- **Records gallery redesign** — every tile fills its 4:3 frame: real photo where it
  exists, else the shared **museum "specimen-drawer" placeholder** (muted seeded tone +
  serif genus monogram + engraved contours + hairline frame + family eyebrow — redesigned
  inside `imgPlaceholderCandidate`, so it lifts **Records and Browse** together). Images
  full-bleed (`object-fit:cover`); the rich **Gallery is the default** (auto-switch-to-List
  removed; List is opt-in); the redundant ‹ › record-stepper arrows removed; the density
  toggle **pinned** on scroll (sticky `.gal-bar`, `top:-14px` to clear the scroll padding).
- **Map data integrity** — fixed a marker **undercount**: `bgLoadAllPages`/`pageTile` (and
  the Records pager) offset-paged with no sort, so ALA's unstable default order silently
  skipped ~8–16% of records. Both now use `sort=id&dir=asc` (matching `bgPolyScan`).
  And **honest labelling** in `updateMapInfo`: the residual (records ALA counts but returns
  no coordinate for) shows as "*N of M have no mapped coordinate*", replacing the old
  unverified "sensitive taxa" claim.

**Next session:** **8c-b** (curated feature-tile grid) → **8c-d** (redesigned group focus
"drawer") → **8c-e** (a11y / responsive / reduced-motion pass) — see `docs/BROWSE-8C-PLAN.md`;
then **#9** (motion layer) and **#10** (virtualise large ranks). Build on the live
placeholders, all-tile vernaculars, and `deriveHoldingsStats` — don't rebuild them.

Also pending (non-code): send `docs/ALA-API-bug-report.md` to the ALA team.

## Recent state (June 2026)

All ALA breaking-change fixes are live (`pageSize` cap, 5000-window + map quadtree,
app-wide CORS `fq` fix, service-worker hardening). **Phases 0–2 complete** (`?selftest`
harness; stabilisation fixes; museum-first image cascade; `deriveHoldingsStats` #7).
**Phase 3 is live and well advanced:** Browse 8a/8b/8c-a + all-tile vernaculars + the
Acanthocephala/Ciliophora/Nucleocytoviricota homonym fixes; the **Records gallery
redesign** (museum specimen-drawer placeholders shared with Browse, full-bleed images,
Gallery-default, pinned toggle, sticky-bar fix); and the **Map integrity pass** (stable-sort
paging fixes the marker undercount; honest "no mapped coordinate" labelling). Records, the
specimen modal, Taxa, Browse (names **and** images), and the Map count are all correct.
Remaining Browse work: **8c-b** (feature tiles), **8c-d** (focus drawer), **8c-e** (a11y
pass); then **#9** (motion) and **#10** (virtualise large ranks).
