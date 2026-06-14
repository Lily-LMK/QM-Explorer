# Phase 3 · Slice 8c — Browse redesign (reduced-motion baseline)

Implementation plan for the **8c** slice of the Browse redesign. Read first:
`docs/BROWSE-REDESIGN-BRIEF.md` (creative spec), `docs/ROADMAP.md` (Phase 3 order),
`CLAUDE.md` (ALA + code constraints). 8c is the **excellent reduced-motion baseline**;
GSAP/Three.js motion is a *later* slice (#9), virtualisation is #10.

## Context

Phase 3 #8 was split into slices. **8a** (guideFocus in the URL hash — shareable deep
links) and **8b** (per-group holdings narrative via `holdingsSentence`) are done and
**live on `main`**. 8c is the visual redesign itself: turn Browse from functional tiles
into a *living taxonomic atlas / cabinet of curiosities* that teaches how QM holds each
group — beautiful enough for a design portfolio, fully usable with motion off.

Decisions locked with Lily:
- **Open at Family**; drill all the way to **species** (via focus child taxa).
- **Fresh visual language** defined for Browse (harmonised with the app's light theme).
- **Type specimens are a headline stat** (tiles *and* focus).
- Claude drives the layout craft.

## Design language (fresh — "specimen plate / archival cabinet")

Light, warm, editorial — a herbarium-sheet / museum-plate feel that elevates the
existing light theme rather than fighting it. Imagery-forward. Type specimens proud.

**Browse-scoped tokens** (defined on the guide view container only, so nothing leaks
into Records/Taxa/Map/Analytics):

```
--b-bg:      #EFE9DD   /* warm bone ground            */
--b-surface: #FAF7F0   /* plate / card                */
--b-ink:     #211C14   /* warm near-black text        */
--b-muted:   #6F6555   /* secondary text              */
--b-line:    #DCD3C2   /* hairline / plate edge       */
--b-type:    var(--red)        /* #c5211e — TYPE-specimen accent (the headline) */
--b-qm:      var(--green-d)     /* QM provenance badge (existing, keep)         */
```
All text/background pairs must clear **WCAG AA** (verify in 8c-5).

**Type system:** a display serif — **Fraunces** (variable, optical sizing; characterful,
portfolio-grade) — for taxon names and section headings; the existing UI sans for labels,
stats, and chrome. Load via Google Fonts CDN (`fonts.googleapis.com` / `fonts.gstatic.com`
are already SW `STATIC_HOSTS`, cache-first — no `sw.js` change, no cache-version bump).
Use `font-display:swap` + a `Georgia, serif` fallback so there's no FOIT/jank.

**Group card ("specimen plate"):**
```
┌───────────────────────────┐
│                           │  ← cascade image (4/5), plate-edge inner border
│        [ image ]          │     QM-provenance badge if QM-imaged (kept)
│                           │
├───────────────────────────┤
│ FAMILY                    │  ← rank eyebrow (sans, tracked)
│ Portunidae                │  ← serif name (italic for genus/species)
│ swimming crabs            │  ← rank-appropriate vernacular (lookupVern)
│ 5,124 records   ▲ 10 types│  ← record count + TYPE BADGE (accent) when >0
└───────────────────────────┘
```
Composition: a refined responsive grid where a few **feature plates** (top groups by
record count, or most type specimens) span larger — curated, not uniform — while DOM/tab
order stays logical. Hover/focus: gentle image zoom + plate lift (transform/opacity),
**disabled under `prefers-reduced-motion`**; always a visible focus ring.

**Focus / detail ("opened drawer"):**
- Full-bleed hero image (cascade) + name · vernacular · conservation.
- **Holdings narrative (8b)** as the prominent lead sentence.
- **Headline stat strip:** Records · **TYPE SPECIMENS (hero, accent)** · Imaged % · Years
  — all from the existing `deriveHoldingsStats(H)`.
- Child taxa as elegant navigable plates/list (drill continues to species).
- QM specimen thumbnail gallery; BIE/Wikipedia blurb.
- One-tap jumps: **View Records / Map / Analytics** for this group (reuse existing
  filter + hash wiring). Must preserve **8a** (`guideFocus` URL state) and **8b**.

## Sub-slices (one commit each; verify in-browser → ff `main` → push to live)

| # | Commit | What | Risk |
|---|--------|------|------|
| 8c-1 | `Browse: fresh design tokens + display type (scoped)` | Browse-scoped CSS custom properties + Fraunces via CDN; apply lightly to existing markup (names→serif, bg/surface). No structural change. Default rank confirmed = Family. | Low |
| 8c-2 | `Browse: specimen-plate group cards + curated grid` | New tile markup/CSS: imagery-forward plate, rank eyebrow, serif name, vernacular, record count, QM badge; feature-tile composition; reduced-motion-safe hover/focus; tiles keyboard-operable (button semantics, Enter/Space, focus ring). | Med |
| 8c-3 | `Browse: type-specimen headline on tiles` | One CORS-safe faceted query (rank field faceted, filtered to type specimens) → map group→typeCount; lazy accent badge on tiles with types (honest: only when >0). Cached; no request bursts. | Med |
| 8c-4 | `Browse: redesigned group focus ("opened drawer")` | Hero + narrative lead + headline stat strip (types as hero) + child plates + specimen gallery + blurb + cross-view jumps. Builds on 8b/`deriveHoldingsStats`; **keeps 8a URL state + 8b narrative**. | Med-High |
| 8c-5 | `Browse: a11y, responsive & reduced-motion pass` | Keyboard nav, focus visibility, ARIA labels (group + key stats), AA contrast audit, laptop/mobile breakpoints, `prefers-reduced-motion` verification; `?selftest` probes for any new pure helpers (tile-emphasis selector, type-facet parser). | Low-Med |

Accessibility is **baked into each slice**, not deferred; 8c-5 is the audit/cleanup gate
before the #9 motion layer.

## Reuse (do not rebuild)

- Images: `resolveGroupImage` + lazy `_queueGuideImg` + IntersectionObserver + provenance.
- Names: `lookupVern` / `_fillTreeVern` pattern (rank-appropriate; never re-filter with
  `isGenericVern`).
- Stats: `deriveHoldingsStats(facets, opts)` + `holdingsSentence(H)` (8b).
- Queries: `alaBaseFQ` → `appendFQ`/`fqQS` (separate fq params — the #1 rule); `ALA_MAX_PAGE`,
  facet `flimit`. 8c-3's type query is one faceted call, CORS-safe, cached.
- State/URL: `S.guideFocus`, `pushURLState`/`restoreFromURL`/`hashchange` (8a), `switchView`.
- Cross-view: existing "View Records" wiring + `setFilterSilent`.

## Constraints (non-negotiable)

- Single static file, no build; deps via CDN (font like Leaflet). No backend/key/proxy.
- CORS-safe `fq` always (separate params). `pageSize ≤ 100`, result window ≤ 5000.
- Never re-apply `isGenericVern` to `lookupVern` output; never set restrictive `fl=` on
  biocache image queries.
- Honest states (loading/empty/error); provenance + attribution on every external image;
  a blank beats a mislabel; QM specimens visually distinct from external photos.
- WCAG 2.1 AA; honour `prefers-reduced-motion` (no motion in 8c at all — that's #9).
- Scope all new CSS to the guide view; **don't regress** Records/Taxa/Map/Analytics, the
  shared `S` state, filters, or the URL hash (8a) and narrative (8b).

## Risks & mitigations

- **Web font** = network/CDN dependency → host already SW-cached; `swap` + serif fallback.
- **CSS bleed** into other views → scope every new rule under the guide container.
- **8c-3 extra query** → single faceted call, cached, no bursts.
- **Large ranks** (>`FLIM=500` groups) → 8c keeps today's cap + "showing top N" note;
  true virtualisation is **#10**. Feature-tile spans must not break with many tiles.
- **Regressing 8a/8b** in the focus rewrite → explicit verification each slice.

## Verification (every 8c slice)

1. `python3 -m http.server 8000`; hard-reload (Cmd+Shift+R).
2. `/?selftest` → all green (new pure helpers get probes).
3. Click through **Chelidae**, **Portunidae**, **Formicidae** across Family → Genus →
   Species; images resolve (museum-first, provenance shown); names rank-appropriate.
4. **Keyboard-only**: tab to tiles, Enter/Space drills, visible focus throughout.
5. **Reduced motion**: enable OS "reduce motion" → no animation, still beautiful & usable.
6. **Deep link (8a)** still works; **narrative (8b)** still renders.
7. Laptop + narrow widths; other four views unaffected.
8. Deploy: ff `main` → `git push origin main`; confirm on the live Pages site.
