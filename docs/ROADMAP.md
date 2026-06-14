# QM Collections Explorer — Stabilisation & Redesign Roadmap

Durable plan for the current chapter, so any session (Sonnet implementing, Opus
planning, or a future you) can re-enter without rebuilding context. Written
June 2026, after a no-code integrity audit and the addition of the `?selftest`
harness.

**Arc:** audit → harness → real fixes → shared foundation → Browse redesign.
Fixes first. Every backlog line is one shippable commit. The `?selftest` harness
re-runs after each as the regression gate. The Browse redesign is the destination,
earned by making the foundation correct first — not by polishing visuals over bugs.

---

## How to verify (every commit)

1. Serve: `python3 -m http.server 8000`
2. Hard-reload first (the SW caches aggressively): **Cmd+Shift+R**
3. Run the harness: open `http://localhost:8000/?selftest` — must be all green
   (**0 failed**; the assertion count grows as fixes add probes) before committing.
4. For visual/async work (Phases 2–3) the harness can't help — click through the
   real UI against named taxa (Chelidae, Portunidae, Formicidae).

## Hard invariants (never bend)

- **CORS-safe `fq`:** every biocache filter is its own `fq` param via
  `appendFQ` / `fqQS`. Never AND-join filter clauses across one `fq`. (Solr `AND`
  *inside* a single parenthesised clause — e.g. the `hasType=false` exclusion — is
  fine; the harness checks the distinction.)
- **`pageSize ≤ 100`** (`ALA_MAX_PAGE`); **result window ≤ 5000** (`ALA_MAX_RESULTS`).
- **Keyless, purely static, single file, no build, no backend.** Deps via CDN only.
- **Never mislabel:** a blank common name beats a wrong-rank one. Provenance +
  attribution on every external image.
- **Honest states:** distinguish failure from empty; never a broken image/dash.

---

## Done & live (Phases 0–2 foundation)

Shipped to `main`, in order:

- **Phase 0** — `?selftest` harness: synchronous invariant checks (constants, CORS-`fq`
  rules, `isGenericVern`, `singularize`, CSV encoding). Runs only on `?selftest`; normal
  load unaffected. Re-run it green before every commit.
- **Phase 1 (stabilise)** — `fetchQualityCounts` CORS fix; `lookupSubfamilyVern` repaired
  (the genus→subfamily/tribe climb now returns + caches); Browse vernaculars made
  rank-correct; two `_localVern` hotfixes (Taxa tree trusts curated names; better
  Lepidoptera family names).
- **Phase 2 #6** — the museum-first image cascade (detail in the Phase 2 table below).

Two durable lessons from this work (also in **Don't** and `CLAUDE.md`): never re-filter
`lookupVern`'s output with `isGenericVern`; never set a restrictive `fl=` on biocache
image queries.

## Phase 2 — Foundation for the redesign

| # | Commit message | Risk | What / why |
|---|---|---|---|
| 6 | `Add image-resolution cascade module` + `Browse: resolve tile images via museum-first cascade` | Medium | **Done** (live, 2 commits). `resolveGroupImage(name, rank, opts)` resolves one image per group **museum-first**: QM specimen → another institution's preserved specimen (`basis_of_record:"PreservedSpecimen"`, `-institution_uid:in15`) → iNaturalist → Wikipedia → BIE → generated placeholder. Preloads each URL (`_imgPreload`) and falls through on load failure; cached in `_groupImgCache`; carries provenance + attribution. `renderGuide` keeps the batch QM pass, then resolves QM-empty tiles **lazily** via `_queueGuideImg` + `{skipQM:true}`. **Lesson:** a restrictive `fl=` param silently drops biocache image URLs — don't set `fl` on these image queries. |
| 7 | `Extract reusable holdings-stats helper` | Low | **← NEXT.** Most of it already exists in `renderGuideFocus` (counts, types, imaging %, collectors, year range, states). Light consolidation into a reusable function so the Phase 3 redesign can render the per-group "holdings story" cleanly. |

## Phase 3 — Browse redesign (the destination)

See `docs/BROWSE-REDESIGN-BRIEF.md` for the full creative spec.

| # | Commit message | Risk | What / why |
|---|---|---|---|
| 8 | `Browse: reduced-motion baseline + holdings narrative + URL state` | Med-High | New layout that is excellent *with motion off*; image cascade integrated; per-group holdings story; `guideFocus` added to the URL hash (shareable deep links). |
| 9 | `Browse: motion + 3D enhancement layer` | High | GSAP / optional Three.js *on top* of the baseline. Honour `prefers-reduced-motion`; clean WebGL teardown on tab switch; bounded cost. |
| 10 | `Browse: virtualise large ranks` | Medium | Perf for ranks with hundreds of groups (some exceed `FLIM=500`). |

## Later — future options (not scheduled; folded in from the old planning brief)

Real possibilities for after the Browse chapter. None are committed; listed so they
aren't re-proposed cold or forgotten.

- **Data-source status affordance** (was the deferred Phase-1 item #5): a small, honest
  indicator distinguishing network/CORS failure vs real ALA error vs genuine empty
  result, with a retry. Cheap, and pays off given ALA's volatility. The image cascade
  already does the placeholder side of this; this is the rest of the app.
- **Large-map performance** (keyless): the quadtree works but fires many 100-record
  requests (~45k records ≈ 45s). Options: tune `CONCURRENCY` (currently 4) + redraw
  cadence; a "load visible area only" mode (quadtree the current viewport on pan/zoom);
  persist loaded tiles in IndexedDB for instant re-visits.
- **Full CSV / dense-polygon export**: both cap at the 5000 window. The map's quadtree
  partitioning could be extended to export and to polygon mode if full exports matter.
- **Single file vs. modules** (open question): everything is inline in `index.html`
  (~6,200 lines). Still maintainable, but the Phase 3 redesign may justify at least an
  inline module boundary. Decide when the friction is real, not pre-emptively.

## Decided — do not re-litigate

- **Keyless, purely static, no build, no backend.** A tiny proxy/Worker holding an ALA
  key (to use the auth'd bulk-download endpoint and bypass the 100/page + 5000 limits)
  was **declined June 2026** — we accept slower incremental large loads. Revisit only if
  instant full loads of 100k+ datasets ever become a real need.
- **Offline/fieldwork mode** — out of scope (decided not necessary).

---

## Workflow

- One commit per backlog line. Don't bundle.
- Keep `main` deployable (it's the live GitHub Pages site). Work on a chapter
  branch; merge at phase boundaries, not per commit. Push only when asked.
- After each phase, update `CLAUDE.md` ("Current chapter" / "Recent state") so the
  repo stays self-documenting.

## Don't

- Don't touch `alaBaseFQ`, the map quadtree (`bgLoadAllPages`), or `normRec_A` —
  load-bearing and correct.
- Don't re-apply `isGenericVern` to `lookupVern`'s output (it already filters API
  results and trusts `_localVern` — re-filtering blanks correct names).
- Don't set a restrictive `fl=` on biocache image queries (it drops the image URLs).
- Don't reopen keyless/static/no-build/no-backend, or offline mode (both decided).
- Offline/fieldwork mode is **out of scope** (decided not necessary).
