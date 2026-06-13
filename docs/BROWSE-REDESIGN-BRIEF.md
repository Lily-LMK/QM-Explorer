# Browse redesign brief — a captivating way to explore QM's collections

**For:** the Fable model (creative + technical lead on this chapter)
**From:** Lily Kumpe (QM collection imager / naturalist) + Claude (codebase context)
**Read first:** `docs/PLANNING-BRIEF.md` (tool overview + the ALA constraints you must
respect). This brief is the detailed spec for one feature: the **Browse** view.

---

## The vision (Lily's words, distilled)

> Rethink Browse so it's a *truly exploratory and useful* way to learn about the
> taxonomic groups and how they're held in the museum. Modernise the gallery so it's
> **awwwards-worthy — a winning feature from a UX designer's portfolio**. GSAP and/or
> Three.js are welcome to make it visually captivating.

Two intertwined goals: (1) **substance** — genuinely teach the visitor how QM holds
each group; (2) **craft** — an interface beautiful and alive enough to stand in a
design portfolio. Neither at the expense of the other.

## What Browse is today (and what's wrong)

- Internally the view is `guide` (`renderGuide()` in `index.html`); the tab says
  "Browse". It shows tiles for taxonomic groups at a rank level (kingdom → phylum →
  … → genus), and drilling in (`S.guideFocus`) opens a group detail with facets, an
  image, and a BIE/Wikipedia blurb.
- **Image problems (the big one):**
  - Tiles pull a representative image only from **QM's own imaged specimens**
    (biocache, `institution_uid:in15`, `multimedia:"Image"`; see the guide-image loop
    around the `tilesNeedingImgs` code). Groups QM hasn't imaged get a bare "—".
  - Even when a URL exists, ALA image URLs sometimes fail to load (stale UUIDs /
    image service hiccups) → the `onerror` handler drops to "—".
  - Net effect: lots of empty/broken tiles, which kills the sense of discovery.
- Visually it's functional tiles, not an experience.

## Core engineering requirement: a robust image-resolution cascade

Every group must resolve to a *good, correct* image, or a *beautiful* placeholder —
**never a broken dash**. Resolve per group in this priority order, falling through on
both "no URL" and "URL failed to load":

1. **QM's own collection (first choice).** A QM-imaged specimen of that group —
   biocache scoped to `institution_uid:in15` + `multimedia:"Image"`, matched to the
   group via its rank field (e.g. `family:"Portunidae"`). Provenance label: **"QM
   specimen"**. This is the heart of Lily's intent — show what *we* hold.
2. **ALA-wide (second choice).** If QM hasn't imaged the group, an image from ALA
   broadly — a biocache image **without** the institution filter, or the group's BIE
   taxon image (`bie-ws.ala.org.au/ws/search`). Label the source + original holder.
3. **Naturalist / encyclopedic fallback (optional, often the most beautiful).**
   iNaturalist taxa API (`api.inaturalist.org/v1/taxa` → `default_photo`) or the
   Wikipedia REST summary lead image (`en.wikipedia.org/api/rest_v1/page/summary/…`).
   These tend to be gorgeous live photos. **Must carry attribution + licence.**
4. **Generated placeholder (last resort).** Not a dash — an elegant, on-brand motif
   (e.g. a stylised silhouette or generative pattern seeded by the group name) so an
   un-imaged group still looks intentional and inviting.

Engineering notes:
- Handle **load failures**, not just missing URLs: on `<img onerror>`, advance to the
  next source rather than giving up.
- **Cache** resolved choices (in-page Map + the service worker) so re-browsing is
  instant and you don't re-hit the cascade.
- **CORS-safe fetching is mandatory:** build every `fq` with separate params via
  `appendFQ`/`fqQS` — never `join(' AND ')` (see PLANNING-BRIEF constraints). Keep
  `pageSize ≤ 100`.
- **Scientific correctness:** an ALA-wide or iNat image for a group must actually be
  that taxon (query by the group's scientific name/rank). Prefer a representative /
  most-recorded exemplar within the group. Never mislabel.
- **Provenance & attribution** are non-negotiable (QM data-integrity ethos): every
  image shows where it came from, and external CC images credit the photographer +
  licence. QM specimens must be visually distinguishable from external photos.

## Common names must be RANK-APPROPRIATE (fix a current Browse bug)

Today's Browse stamps a *single representative species' common name* onto a whole
group tile — e.g. the family **Chelidae** is labelled "Fitzroy River Turtle" (one
species of many), Cheloniidae → "Green Sea Turtle", Testudinidae → "Asian Tortoise".
That is misleading and scientifically sloppy.

The redesign must resolve the common name **at the tile's own rank**: a family tile
shows the *family's* common name (e.g. Chelidae → "Austro-American side-necked
turtles"), a genus tile the genus's, a species tile the species's. Show nothing
rather than a wrong-rank name — a blank is honest; a mislabel is not.

Good news: the Taxa tree was just fixed to do exactly this, via the shared resolver
`lookupVern` (GBIF + iNaturalist) + the curated `_localVern` dictionary, cached in
`_vernCache`, resolved lazily (IntersectionObserver, throttled) so large groups don't
hammer the APIs. **Build ONE shared rank-aware resolver** that both the Taxa tree and
Browse use (and ideally the cards too), so names are consistent everywhere. See
`_fillTreeVern` for the working pattern to generalise. Note `lookupVern` rejects
kingdom/phylum-level matches; very high ranks rely on `_localVern`.

## The "useful exploration" layer (substance)

Make each group communicate *how QM holds it*. All of this is already derivable from
facet/count queries the app does elsewhere (reuse `alaBaseFQ`, the facet patterns,
`fetchRichnessCounts`, `fetchQualityCounts`). Per group, surface things like:

- **Holdings:** specimen count in QM; which QM collection(s) hold it (Entomology,
  etc.).
- **Richness:** families / genera / species counts within the group.
- **Type specimens:** how many holotypes / paratypes etc. QM holds — scientifically
  significant and a point of pride. Worth foregrounding.
- **Imaging coverage:** % of the group imaged (especially resonant — Lily is the
  imager; this surfaces gaps and progress).
- **Time & people:** collection year range; notable collectors.
- **Place:** geographic spread (cross-link to the Map view for the group).

A group card might read: *"Portunidae — 5,124 QM specimens across 22 genera,
including 10 type specimens · 1% imaged · collected 1861–2024."* That sentence alone
makes Browse genuinely educational.

**Coherence with the rest of the app:** drilling into a group should feel connected —
e.g. set the active filters and offer one-tap jumps to Records / Map / Analytics for
that group, and reflect state in the URL hash (the app already does hash state).

## Design direction (craft) — inspiration, not prescription

Give the designer room, but some coherent directions:

- **A living taxonomic atlas / cabinet of curiosities.** Drilling from kingdom →
  genus should feel *continuous and spatial*, not like page reloads — shared-element
  / FLIP transitions (GSAP is great for this), where a tile expands into the group's
  story. Choreograph entrances so data and imagery reveal with intent.
- **Imagery-forward, breathing layout.** A mosaic/masonry that feels curated; hover
  or focus reveals the museum story; subtle parallax/depth.
- **Optional Three.js, used with restraint.** A tactile, depth-rich treatment could
  elevate it — e.g. specimen cards floating in shallow 3D, a "drawer" metaphor that
  slides open, or a particle field whose density encodes abundance. Reach for it only
  where it *adds meaning*, not as decoration.
- **Motion with purpose:** guide the eye, express data (counts, coverage), reward
  curiosity. Beautiful, not busy.

## Guardrails (do not skip — these are house rules)

- **Accessibility (WCAG 2.1 AA, per project CLAUDE.md):** full keyboard navigation,
  visible focus, semantic structure, labels. **Honour `prefers-reduced-motion`** —
  all GSAP/Three.js motion must gracefully reduce or disable; the experience must be
  fully usable (and still lovely) with motion off.
- **Performance:** lazy-load images; virtualise/paginate large grids (some ranks have
  hundreds of groups); no jank; keep Three.js cost bounded and teardown clean on tab
  switch. Test on an ordinary laptop.
- **Self-contained:** keep it a single static file. Load GSAP / Three.js via CDN the
  same way Leaflet is loaded. No build step.
- **Graceful degradation & honest states:** clear loading / empty / error states;
  never a broken image; the service worker now surfaces real errors (don't reintroduce
  fake ones).
- **Don't regress the other views** — Browse shares state (`S`), filters, and the URL
  hash with Records/Taxa/Map/Analytics.

## Suggested approach for the implementer

1. Build the **image-resolution cascade** as a standalone, cached, well-tested module
   first (it's the foundation and the current pain point). Verify the QM→ALA→iNat/Wiki
   →placeholder fallback and the onerror cascade against real groups.
2. Layer the **per-group "holdings" data** using existing facet/count patterns.
3. Then the **experience design** — start from the reduced-motion baseline (must be
   great on its own), and add GSAP/Three.js enhancement on top.
4. Verify in-browser across ranks; check a11y (keyboard + reduced motion) and
   performance on a large rank.

## Key code pointers (`index.html`)

- `renderGuide()` and the `guideFocus` detail path — current Browse.
- The guide-image loop (search `tilesNeedingImgs`) — current QM-only image fetch to
  replace with the cascade.
- `alaBaseFQ`, `appendFQ`, `fqQS` — CORS-safe query building (use these).
- `fetchRichnessCounts`, `fetchQualityCounts`, `extractFacets_A` — reuse for the
  holdings/coverage stats.
- Existing iNaturalist / Wikipedia / BIE enrichment in the specimen-detail modal —
  reuse those fetch patterns for the image fallbacks.
- Constants: `ALA_MAX_PAGE`, `ALA_MAX_RESULTS`.

## Open questions for Lily

1. At what rank does Browse open by default (kingdom, or straight to something richer
   like class/order)? How deep should drill-down go — to species?
2. For the QM-image fallback, any preference for *which* specimen represents a group
   (most recent image? a type specimen? highest-quality)?
3. How prominent should type-specimen holdings be — a headline stat, or detail?
4. Any house visual language / palette to carry from the current app, or is this a
   chance to define a fresh look for Browse specifically?
