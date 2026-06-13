# QM Collections Explorer — Planning Brief (next chapter)

A self-contained brief so the next session (Fable, or Claude) starts with full
context instead of cold. Written June 2026, just after a round of fixes for ALA API
changes.

## What the tool is

A single-file, no-build, browser app (`index.html`, ~6,200 lines, all CSS/JS/HTML
inline) for exploring Queensland Museum's natural-history collections via the Atlas
of Living Australia (ALA) biocache API, enriched with GBIF, iNaturalist, Wikipedia,
and Queensland Government / Geoscience Australia spatial services. Five views:
**Records, Taxa, Browse, Map, Analytics**, plus CSV export. Deployed on GitHub Pages
(`lily-lmk.github.io/QM-Explorer`). `sw.js` is an optional service worker for
caching/offline groundwork. See `README.md` for the full architecture.

All ALA queries are scoped to QM via `institution_uid:in15` (`S.alaInst`).

## Current state (post-fixes)

Loading, filtering, and enriching all work. Recent commits fixed three ALA breaking
changes (see "Constraints" below). The map now loads whole collections via spatial
quadtree partitioning. Known good as of commit `e10b27a`.

## ALA constraints to design around (these are now baked into the code)

1. **`pageSize` ≤ 100** — larger returns HTTP 503. Constant `ALA_MAX_PAGE=100`.
2. **5000-record result window** — `startIndex + pageSize ≤ 5000`; no record past
   index 5000 is served. Constant `ALA_MAX_RESULTS=5000`.
3. **No working deep-paging cursor** — the old `id:{lastId TO *}` cursor is dead
   (ALA stopped returning a queryable `id`); `cursorMark` unsupported. To exceed
   5000 we **partition** the query (the map uses a lat/long quadtree:
   `bgLoadAllPages` in `index.html`).
4. **CORS header dropped on AND-joined `fq`** — always send filters as **separate
   `fq` params** (helpers `appendFQ` / `fqQS`). Never `join(' AND ')`.
5. **Bulk download endpoint requires auth** (`/ws/occurrences/index/download` → 403)
   — not usable from a keyless static client as-is.

Memory note for these lives in the assistant's memory as
`ala-biocache-pagesize-cap`. ALA has made several changes in quick succession, so
treat the API as volatile and keep error handling honest (the service worker now
surfaces real failures instead of synthetic 503s).

## Candidate improvements (with trade-offs)

### A. A small proxy / serverless edge function — DECLINED (June 2026)
Considered a tiny Cloudflare Worker holding an ALA API key to use the bulk-download
endpoint (which would bypass the 100/page and 5000-record limits and make big maps /
full CSV instant). **Lily chose to keep the app purely static and keyless and accept
slower large downloads** — they load incrementally and her typical work is
collection-scale, not all-of-QM. So: no API key, no proxy. Keep all fetching
client-side. Revisit only if instant full loads of 100k+ datasets ever become a real
need. (Left here so it isn't re-proposed.)

### B. Large-map performance (if staying keyless)
The quadtree works but makes many 100-record requests (e.g. ~45k records ≈ 45s).
Options: tune `CONCURRENCY` (currently 4) and the redraw cadence; add a
"load visible area only" mode (quadtree the current viewport bbox on pan/zoom);
persist loaded tiles in IndexedDB so re-visits are instant. Lower ceiling than A but
no new infrastructure.

### C. Offline mode (SW + IndexedDB)
The service worker is already the foundation. Goal: browse previously-loaded records
without a connection — useful for fieldwork at Mount Nebo / remote sites. Needs a
record store (IndexedDB), a "saved areas/searches" concept, and UI for what's
available offline. Independent of A/B.

### D. Resilience & observability
Now that the SW surfaces real errors, add a small "data source status" affordance:
distinguish network/CORS failure vs real ALA error vs empty result in the UI, and a
retry. Cheap, and pays off given ALA's volatility.

### E. Smaller polish
- CSV export currently caps at 5000 (ALA limit) unless partitioned like the map —
  worth applying the same partition approach to export if full exports matter.
- Polygon mode also caps at the 5000 window for dense areas; quadtree could be
  extended to it.

## Decisions made

- **Keyless, purely static, accept slower large downloads** (option A declined).
- **Next creative priority: the Browse redesign** — see
  `docs/BROWSE-REDESIGN-BRIEF.md`. To be led by the Fable model.

## Open questions for the planner / Lily

1. Is **offline/fieldwork** mode a near-term priority or someday-maybe?
2. Any appetite to split the single file into modules yet, or keep it single-file?
   (The Browse redesign may push toward at least an inline module boundary.)

## Key code pointers (`index.html`)

- `alaBaseFQ(f)` — builds the filter clause array.
- `appendFQ(u, arr)` / `fqQS(arr)` — CORS-safe fq construction (use everywhere).
- `bgLoadAllPages(f, loadId)` — the map's quadtree loader (count tiles, split,
  offset-page leaves, dedupe, concurrency, retry).
- `doSearch()` — standard + polygon search paths; `bgPolyScan` — polygon master scan.
- Constants near the top: `ALA_MAX_PAGE`, `ALA_MAX_RESULTS`, `MAP_POINT_CAP`.
- `sw.js` — caching + (now honest) error propagation.
