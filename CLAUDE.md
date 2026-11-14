# CLAUDE.md — QM Collections Explorer

Project-level guidance, auto-loaded each session. This is the **specific truth for
this folder**; the workspace file at `~/Documents/Claude/CLAUDE.md` holds the broader
working philosophy (Explore → Plan → Code → Commit, biodiversity context, Lily's
profile). Read both. Last updated 14 November 2026.

For where the project is and what is next, read "Current chapter" below, then
`project-notes/HANDOVER.md` if it is present (private notes, git-ignored). The June 2026
planning documents in `docs/` (`ROADMAP.md`, `BROWSE-REDESIGN-BRIEF.md`, `BROWSE-8C-PLAN.md`,
`KICKOFF.md`) are kept for the Browse work that is folded into the redesign stage.

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
- `docs/` — June 2026 planning briefs and the ALA bug report (see "Current chapter").

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
   new paging loop must too. (Also: `geospatial_kosher:true` ≠ plottable — about 14% return no
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

## Current chapter (November 2026)

**Read-only audits first, then repairs, then supplied names, then the redesign.** Lily's
decisions and the live status are in `project-notes/HANDOVER.md` (private, git-ignored;
present only in Lily's working copy). If that folder is absent, ask before assuming.

The project has two goals:
1. Make Queensland Museum specimen records more complete, more accurate and easier to
   find in QM Explorer.
2. Help Queensland Museum and ALA correct the records people meet through ALA itself.
   ALA remains the primary public source. An upstream issue stays open until the
   correction is verified in ALA.

**How work proceeds:** look and report first; nothing on the site changes until Lily has
agreed to what a report proposes. Work on a branch; Lily reviews before `main`. Say
"databased records", and give the query and the retrieval date (with the year) for every
count. Where ALA, the AFD and the museum's register disagree, show each with its source.
The Explorer never calls the museum's register; anything from it arrives as a reviewed file.

**Stages:**
1. Health check — done 14 November 2026. No code changed.
2. Repairs — waiting on Lily agreeing the list. Known faults, all still in the live code:
   - Enriched CSV column `elevationDEM_m` is filled from ALA layer `el887` (a radiation
     layer). The elevation layer is `el674`.
   - NNTT layers are mixed up: 0 = Registered Native Title Bodies Corporate,
     5 = Determination Outcomes, 8 = Schedule of Applications. The code treats 8 as
     determinations and 0 as applications.
   - `geospatial_kosher:true` (910,248) overstates what has a coordinate (latitude
     present: 784,857 of 914,614, retrieved 14 November 2026). It feeds the "mappable"
     filter and the Analytics "Georeferenced" tile.
   - Standard CSV: locality and twelve other columns are always empty.
   - Opening the site sends about 320 requests; iNaturalist refuses some, so common
     names go missing.
   - ALA layer ids `cl1048`, `cl1049`, `cl10923` are older editions; newer are `cl11015`,
     `cl11016` (IBRA 7.1), `cl11014` (LGA 2025), `cl11019` (CAPAD 2024).
3. Supplied names — measured 14 November 2026; build not started. Decisions:
   - Lead with the Queensland Museum supplied name when ALA's match is broader, and show
     both sources when they differ.
   - Filters and counts are driven by the museum's data (the `raw_` fields below), with
     ALA's match as the second source.
   - Working names are shown exactly as supplied ("Pheidole QM2" says "Pheidole QM2").
   - Names marked as manuscript or unpublished are held for review and not shown.
   - Primary types are holotype, neotype, type, lectotype and syntype.
   - First build step: confirm in a real browser that ALA returns the `raw_` fields with
     the CORS header.
4. Shared registration numbers and duplicate records — next investigation (read-only).
5. Collecting regions as a filter and map colour choice; author and current name from the AFD.
6. Redesign in the Queensland Museum Design System — review, mock-up for Lily, then code.
   The unfinished Browse work (8c-b, 8c-d, 8c-e in `docs/BROWSE-8C-PLAN.md`, then motion
   #9 and virtualising large ranks #10) is folded into this stage.

Also pending: the report to ALA. `docs/ALA-API-bug-report.md` has not been sent, and the
supplied-names audit adds wrong-group matches and the leading-X family fault to it.

## Supplied names: what ALA carries (measured 14 November 2026)

- `raw_scientificName` is the name the museum supplied; `scientificName` is ALA's match.
  `matchType` says how they relate: exactMatch 769,587; higherMatch 132,762;
  canonicalMatch 6,289; fuzzyMatch 5,976 (of 914,614 `in15` records).
- The museum's own classification is there too, and can be filtered and faceted:
  `raw_kingdom`, `raw_phylum`, `raw_class`, `raw_order`, `raw_family`, `raw_genus`,
  `raw_taxonRank`. In a search they come back only when asked for with `fl=`, inside
  `otherProperties`. Tested with curl only.
- **`raw_catalogNumber` is not returned when a search uses `fl=`.** Fetch it without `fl`.
- Supplied values are not uniform (bird families arrive in capitals; some informal names
  are lower case), so normalise before grouping.
- ALA's match can be in the wrong group altogether: 446 records sit in a different
  class, phylum or kingdom from the supplied name (*Patella* limpets under a fungus
  genus, *Acmaea* under *Maratus*). Never present ALA's match as the museum's name.
- ALA drops a leading X from family names: Xanthidae is filed as "Anthidae",
  Xeniidae as "Eniidae", Xenophoridae as "Enophoridae". `family:Xanthidae` returns 0;
  `raw_family:Xanthidae` finds them.
- ALA name matching (`api.ala.org.au/namematching/api/search`) can be called keyless
  from a page, and returns the same match as biocache; it does not repair wrong matches.
- ALA can hold an older copy of a record the museum has since corrected, sometimes
  under another collection. Do not assume one registration number is one ALA record.

## State of the live site

The live site is unchanged since June 2026 (`main` at 6c859d0). All five views, the
searches, both CSV exports and every outside service work, with the faults listed under
stage 2. Live from the June work: the ALA fixes (`pageSize` cap, 5,000 window with the
map quadtree, separate `fq` params, service-worker hardening); the `?selftest` harness;
the museum-first image cascade; `deriveHoldingsStats`; Browse 8a/8b/8c-a with common
names for all tiles and the Acanthocephala/Ciliophora/Nucleocytoviricota homonym fixes;
the Records gallery redesign (specimen-drawer placeholders shared with Browse,
simplified tiles by default, Has-Media switch to the photo grid, pinned density toggle);
and the Map integrity pass (stable-sort paging, honest "no mapped coordinate" label).
Build on these; do not rebuild them.

`README.md`, `docs/ROADMAP.md` and `docs/KICKOFF.md` date from June 2026 and describe the
Phase 3 plan as it stood then. Where they differ from this file, this file is current.
