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
3. Run the harness: open `http://localhost:8000/?selftest` — must be green
   (24/24, plus any new assertions) before committing.
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

## Audit correction (important)

`lookupSubfamilyVern` (~index.html:4950) is **not dead code to delete — it's a
broken function to fix.** It is called in `fetchVernacular` at ~:5067 and ~:5082
(modal re-enrich path) but always returns `null` because its computed
`{name, rank}` results (~:4978–4983, ~:5011–5016) are assigned and never returned.
The *working* copy of the same logic is inlined in `batchFetchVernaculars` at
~:5285–5338 (cards path). So the genus→subfamily/tribe common-name climb works for
cards but is silently broken for the modal. **Fix it to return + cache its
results** (a real functionality gain). The duplication with 5285–5338 is a
follow-up consolidation candidate, not urgent.

---

## Phase 1 — Stabilise (smooth functioning + integrity)

Risk ramps low → medium. Branch: `stabilise` (off `main`).

| # | Commit message | Risk | What / why |
|---|---|---|---|
| 1 | `Add no-build ?selftest harness for core invariants` | — | **Done** (commit 643a456). 24 synchronous assertions: constants, CORS-fq invariants, `isGenericVern`, `singularize`, CSV encoding. Runs only on `?selftest`; normal load unaffected. |
| 2 | `Fix CORS violation in fetchQualityCounts typed-count query` | Low | The Analytics typed-specimen count AND-joins two clauses into one `fq` (~:964) → ALA drops the CORS header → count silently fails in browsers (curl sees it fine). Split into separate clauses via `appendFQ`. |
| 3 | `Fix lookupSubfamilyVern to return + cache its results` | Low | See audit correction above. Modal gains working subfamily/tribe resolution (e.g. "dung beetle" for genera GBIF can't name directly). Additive. |
| 4 | `Fix Browse rank-blind vernacular — use shared resolver` | Medium | The live mislabel bug: Chelidae shown as "Fitzroy River Turtle". `renderGuide` (~:2156–2160 sync, ~:2243–2266 async) and `fetchGuideInfo` (~:2403–2412) take a representative species' name regardless of tile rank and skip `isGenericVern`. Reuse Taxa's working `_fillTreeVern` lazy/throttled/cached infra. Resolves the `_vernCache` keying inconsistency for free. |
| 5 | `Surface data-source failures vs empty results` | Medium | *(integrity, deferrable)* Enrichment / Browse-image / map-tile failures currently look identical to "no data". Surface a small, non-alarming indicator on genuine network/CORS rejection. Scope tightly — surface, don't re-architect. Do after #4 or defer to reach the Browse foundation sooner. |

Items 2–4 are the clear wins (three real, user-visible problems). Item 5 is the
one genuinely optional item.

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
