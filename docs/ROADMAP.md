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

## Audit correction (RESOLVED in #3)

`lookupSubfamilyVern` (~index.html:4950) was **not dead code — a broken function**
that always returned `null` because its computed `{name, rank}` results were assigned
and never returned. Fixed in item #3: both branches now build, cache, and return.
*Remaining follow-up (not urgent):* the duplicate working copy inlined in
`batchFetchVernaculars` (~:5285–5338) could be consolidated to call
`lookupSubfamilyVern` now that it works.

---

## Phase 1 — Stabilise (smooth functioning + integrity)

Risk ramps low → medium. Branch: `stabilise` (off `main`).

| # | Commit message | Risk | What / why |
|---|---|---|---|
| 1 | `Add no-build ?selftest harness for core invariants` | — | **Done** (commit 643a456). 24 synchronous assertions: constants, CORS-fq invariants, `isGenericVern`, `singularize`, CSV encoding. Runs only on `?selftest`; normal load unaffected. |
| 2 | `Fix CORS violation in fetchQualityCounts typed-count query` | Low | **Done** (live). The Analytics typed-specimen count AND-joined two clauses into one `fq` (~:964) → ALA dropped the CORS header → count silently failed in browsers (curl saw it fine). Split into separate clauses via `appendFQ`. |
| 3 | `Fix lookupSubfamilyVern to return + cache its results` | Low | **Done** (live). See audit correction below. Both the iNat and GBIF branches now build the result, write it to `_subTribeCache`, and return it — so the modal's genus→subfamily/tribe climb works (e.g. "dung beetle" for genera GBIF can't name directly). |
| 4 | `Fix Browse rank-blind vernacular — use shared resolver` | Medium | **Done** (live). Was the live mislabel at every rank (Chelidae → "Fitzroy River Turtle"). Removed the rank-blind record-vern harvest in `renderGuide`; routed both the tile fallback and `fetchGuideInfo` through `lookupVern` keyed by `cleanTaxonTerm`. **KEY LESSON:** the caller must **not** re-apply `isGenericVern` to `lookupVern`'s output — `lookupVern` already filters API results internally and trusts `_localVern`, whose names the auto-populate routine (~:4793) poisons into `_genericVernSet`. Re-filtering blanks correct names (the regression we hit + hotfixed). |
| 5 | `Surface data-source failures vs empty results` | Medium | **Deferred — folded into #6.** The honest-state work it called for (distinguish "no image" from "load failed" → elegant placeholder, never a dash) is exactly what the image cascade must do. No standalone commit. |

**Phase 1 complete — all four fixes are live on `main`, plus two hotfixes:**
1. *Taxa tree: trust curated `_localVern` names* — `_fillTreeVern` was running curated
   dictionary hits through `isGenericVern` (via `show()`), which the auto-populate
   routine poisons. Now `el.textContent=singularize(dict)` directly. `_localVern` is
   the highest-trust source; `isGenericVern` is for *API* results only.
2. *Lepidoptera family names* — replaced generic `'moth'`/`'butterfly'` `_localVern`
   entries for 10 families with rank-appropriate names (owlet/geometer/snout moth,
   gossamer-winged/white butterfly, …).

## Phase 2 — Foundation for the redesign

| # | Commit message | Risk | What / why |
|---|---|---|---|
| 6 | `Add image-resolution cascade module` | Medium | QM specimen → ALA-wide/BIE → iNat/Wikipedia → elegant placeholder. Robust to image **load** failures (onerror fallthrough), cached (in-page + SW), carries **provenance + attribution/licence**. Build + verify standalone before Browse consumes it. Reuse `fetchFullAlaRecord`'s URL-shape handling and the modal's iNat/Wiki/BIE fetch patterns. |
| 7 | `Extract reusable holdings-stats helper` | Low | Most of it already exists in `renderGuideFocus` (counts, types, imaging %, collectors, year range, states). Light consolidation so the redesign reuses it cleanly. |

## Phase 3 — Browse redesign (the destination)

See `docs/BROWSE-REDESIGN-BRIEF.md` for the full creative spec.

| # | Commit message | Risk | What / why |
|---|---|---|---|
| 8 | `Browse: reduced-motion baseline + holdings narrative + URL state` | Med-High | New layout that is excellent *with motion off*; image cascade integrated; per-group holdings story; `guideFocus` added to the URL hash (shareable deep links). |
| 9 | `Browse: motion + 3D enhancement layer` | High | GSAP / optional Three.js *on top* of the baseline. Honour `prefers-reduced-motion`; clean WebGL teardown on tab switch; bounded cost. |
| 10 | `Browse: virtualise large ranks` | Medium | Perf for ranks with hundreds of groups (some exceed `FLIM=500`). |

---

## Workflow

- One commit per backlog line. Don't bundle.
- Keep `main` deployable (it's the live GitHub Pages site). Work on a chapter
  branch; merge at phase boundaries, not per commit. Push only when asked.
- After each phase, update `CLAUDE.md` ("Current chapter" / "Recent state") so the
  repo stays self-documenting.

## Don't

- Don't delete `lookupSubfamilyVern` — fix it.
- Don't touch `alaBaseFQ`, the map quadtree (`bgLoadAllPages`), or `normRec_A` —
  load-bearing and correct.
- Don't start visual work (Phase 3) until the resolver (#4) and cascade (#6) are in
  and verified.
- Don't reopen keyless/static/no-build/no-backend (decided June 2026).
- Offline/fieldwork mode is **out of scope** (decided not necessary).
