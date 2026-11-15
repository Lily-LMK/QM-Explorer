# CLAUDE.md — QM Collections Explorer

Project-level guidance, auto-loaded each session. This is the **specific truth for
this folder**; the workspace file at `~/Documents/Claude/CLAUDE.md` holds the broader
working philosophy (Explore → Plan → Code → Commit, biodiversity context, Lily's
profile). Read both. Last updated 15 November 2026.

For where the project is and what is next, read "Current chapter" below, then
`project-notes/HANDOVER.md` if it is present (private notes, git-ignored). The June 2026
planning documents in `docs/` (`ROADMAP.md`, `BROWSE-REDESIGN-BRIEF.md`, `BROWSE-8C-PLAN.md`,
`KICKOFF.md`) are kept for the Browse work that is folded into the redesign stage.

## What this is

A single-file, **no-build, keyless static web app** for exploring Queensland Museum's
natural-history collections via the Atlas of Living Australia (ALA), enriched with
GBIF, iNaturalist, Wikipedia, and Queensland Government / Geoscience Australia spatial
services. Deployed on GitHub Pages: <https://lily-lmk.github.io/QM-Explorer>.

- `index.html` — the entire app (~7,100 lines, ~400 KB: HTML + CSS + JS inline). No framework,
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
   new paging loop must too, including the CSV export. (Also: `geospatial_kosher:true` ≠ plottable —
   about 14% have no coordinate. "Has a coordinate" is `latitude:[* TO *]`; the map labels the
   rest honestly, never as "sensitive" without evidence.)
7. **`fl=` changes the shape of the answer.** With `fl=`, most descriptive fields (locality,
   preparations, sex, lifeStage, identifiedBy, habitat, authorship…) come back inside
   `otherProperties`, and the image addresses (`imageUrl`, `largeImageUrl`…) are dropped.
   So the Records search sends no `fl=` (the photo grid needs the images), and the CSV export
   fetches the descriptive fields separately (`fillDescriptiveFields`, `ALA_FL`).
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
- **Native Title (NNTT_Custodial_AGOL):** layer 0 = registered bodies corporate
  (`Corporation_Name`), 5 = determination outcomes, 8 = applications. `nnttPointAll` reads
  every feature at a point; `nnttInterpret` decides what to show (Lily's rules, 14–15
  November 2026: "application under way"; nothing for "does not exist"/"extinguished"; the
  determination takes precedence over an application). The built-in custodians list
  (`_qldTraditionalOwners`, 34 approximate rectangles) is marked "(approximate)" and hidden
  where the outcome is negative (`_curatedAllowed`; one exception by uuid, S3568). The record
  window shows only a short group name (`_ntShortName`) and a brief outcome ("Recognised
  (non-exclusive)", "Application under way"); full Tribunal names, IDs, dates, bodies corporate
  and sources belong in Copy Sources (`specSources`), not in Country & Context.
- **CSV:** both exports end with `retrievalDate` and `query`. Elevation is ALA `el674`.
- **Service worker:** never caches `index.html` (network-only), so a deploy reaches visitors at
  once. Propagates real network/CORS failures (does NOT manufacture a
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
2. Repairs — batch 1 released 15 November 2026 (`main` eaead22, then f1cd846 for the shorter
   Native Title display): elevation (`el674`),
   Native Title layers, "has a coordinate", standard CSV columns, stable sort on export.
   Still to do (batch 2), all in the live code:
   - Exporting while on page 2 or later repeats that page and misses page 1 (read from the
     code, not yet tested).
   - Opening the site sends about 320 requests; iNaturalist refuses some, so common names go
     missing, and tile and window can disagree. Remove the rule that strips a final "s".
   - A new search leaves the old result on screen while GBIF answers.
   - The map's background loader keeps running after leaving the Map.
   - No "holotypes only" choice: offer each type status, built from the facet.
   - ALA layer ids `cl1048`, `cl1049`, `cl10923` are older editions; newer are `cl11015`,
     `cl11016` (IBRA 7.1), `cl11014` (LGA 2025), `cl11019` (CAPAD 2024). Check against the
     plug-in's set first.
   - Wording: "1 records", "<1%", the 5,000-record message.
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
4. Shared registration numbers and duplicate records — investigated 14–15 November 2026.
   Released 15 November 2026: `data/qm-register-supplement.json` (1,028 specimens ALA hides
   because they share a registration number: the 1,022-record release candidate plus six
   T3136/T6182 records shown as "Curator review pending"). v3 (15 November 2026) brings it to
   1,094: 60 Molluscs specimens hidden by shared numbers, and six Molluscs holotypes ALA holds
   under no QM collection, marked `addedBecause: "not in ALA"` (worded so in the record window
   and Copy Sources). Entomology and Molluscs are fully inventoried. Records has a Source filter
   (All sources / ALA Biocache / QM Register); ALA's results come first and the additions
   follow, keyed `reg:<register identifier>`. Where coordinates are withheld, locality and
   location remarks are withheld too. `imagedInRegister` is a yes/no flag (no image links).
   The file is built in `project-notes/scripts/supplement-pilot/`; before rebuilding, re-run the
   ALA check there so no specimen is shown twice. The Map places additions that have a
   coordinate (withheld ones have none in the file). Taxa, Browse and polygon searches still
   show ALA records only. CSV: ALA rows' `query` is a working ALA address; register rows'
   `query` is plain text with no web address; both are captured when the export starts.
5. Collecting regions as a filter and map colour choice; author and current name from the AFD.
6. Redesign in the Queensland Museum Design System — review, mock-up for Lily, then code.
   The unfinished Browse work (8c-b, 8c-d, 8c-e in `docs/BROWSE-8C-PLAN.md`, then motion
   #9 and virtualising large ranks #10) is folded into this stage.

Also pending: the report to ALA. `docs/ALA-API-bug-report.md` (the CORS fault) has not been
sent. To add before sending: wrong-group name matches, the leading-X family fault, older copies
of corrected records, the ~125,000 records counted as georeferenced with no coordinate, and the
3 QM records not tied to the institution.

## Supplied names: what ALA carries (measured 14 November 2026)

- `raw_scientificName` is the name the museum supplied; `scientificName` is ALA's match.
  `matchType` says how they relate: exactMatch 769,587; higherMatch 132,762;
  canonicalMatch 6,289; fuzzyMatch 5,976 (of 914,614 `in15` records).
- The museum's own classification is there too, and can be filtered and faceted:
  `raw_kingdom`, `raw_phylum`, `raw_class`, `raw_order`, `raw_family`, `raw_genus`,
  `raw_taxonRank`. In a search they come back only when asked for with `fl=`, inside
  `otherProperties`. Tested with curl only.
- `raw_catalogNumber` with `fl=`: missing in a curl test on 14 November 2026, present in a
  browser test on 15 November 2026. Check before relying on it.
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

`main` is at f1cd846 (stage 2 batch 1 and the shorter Native Title display, released and
checked on GitHub Pages 15 November 2026). All five views, the searches, both CSV exports and every outside service work, with
the faults listed under stage 2. Live from the June work: the ALA fixes (`pageSize` cap, 5,000 window with the
map quadtree, separate `fq` params, service-worker hardening); the `?selftest` harness;
the museum-first image cascade; `deriveHoldingsStats`; Browse 8a/8b/8c-a with common
names for all tiles and the Acanthocephala/Ciliophora/Nucleocytoviricota homonym fixes;
the Records gallery redesign (specimen-drawer placeholders shared with Browse,
simplified tiles by default, Has-Media switch to the photo grid, pinned density toggle);
and the Map integrity pass (stable-sort paging, honest "no mapped coordinate" label).
Build on these; do not rebuild them.

`docs/ROADMAP.md` and `docs/KICKOFF.md` date from June 2026 and describe the Phase 3 plan as
it stood then; the Browse briefs are kept for stage 6. Where they differ from this file, this
file is current.
