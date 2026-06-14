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
- **Cohesion first** — *no separate visual language for Browse.* Keep the app's existing
  palette, **Barlow** type, and sharp 2px geometry. The "awwwards" lift comes from
  **layout, hierarchy, imagery, spacing, and interaction craft**, not a new skin.
- **Type specimens are a headline stat** (tiles *and* focus), using the existing **red**
  accent; QM provenance keeps the existing **green** badge.
- Claude drives the layout craft.

> **Course correction (June 2026):** a first attempt (8c-1) gave Browse its own warm
> serif/bone palette scoped to `#v-guide`. It read as *two different products* and was
> reverted (commit `022b98a`). Lesson baked in above: elevate **within** the existing
> language; never let one view diverge.

## Design approach — craft within the existing language

Use only the existing tokens: `--bg #f2f1ed`, `--panel #fff`, `--ink #111`, `--muted`,
`--hair #ddd`, accents `--green/--green-d` (QM provenance) and `--red #c5211e` (type
specimens / alerts), `--font 'Barlow'`, 2px radii, hairline borders, `--tr` transitions.
Elevation comes from **composition**, not new colour or type:

- **Imagery-forward** — let the cascade images carry the page; larger, cleaner image
  areas; consistent aspect; the existing skeleton-shimmer for loading.
- **Stronger hierarchy & rhythm** — clear rank eyebrow (reuse the existing `.gtr`
  uppercase-tracked label style), prominent name (Barlow heavy, italic for genus/species),
  muted vernacular, then the stat line. Generous, consistent spacing.
- **Curated grid** — a few **feature tiles** (top groups by record count / most types)
  span larger for an editorial, cabinet-of-curiosities rhythm; DOM/tab order stays logical.
- **Refined interaction** — subtle hover/focus using the existing `--tr` (image settle /
  hairline emphasis), **disabled under `prefers-reduced-motion`**; always a visible focus
  ring; tiles keyboard-operable.

**Group card (existing language):**
```
┌───────────────────────────┐
│                           │  ← cascade image; QM badge (green) if QM-imaged
│        [ image ]          │
├───────────────────────────┤
│ FAMILY                    │  ← rank eyebrow (.gtr — Barlow uppercase, tracked)
│ Portunidae                │  ← name (Barlow heavy; italic for genus/species)
│ swimming crabs            │  ← rank-appropriate vernacular (lookupVern)
│ 5,124 records    ◆ 10 types│  ← record count + TYPE badge (red) when >0
└───────────────────────────┘
```

**Focus / detail ("opened drawer", same language):**
- Hero image (cascade) + name · vernacular · conservation.
- **Headline stat strip:** Records · **TYPE SPECIMENS (red)** · Imaged % · Years —
  from the existing `deriveHoldingsStats(H)`.
- **Holdings narrative (8b)** beneath the description (current placement Lily approved).
- Child taxa as navigable chips/plates (drill continues to species).
- QM specimen thumbnail gallery; BIE/Wikipedia blurb.
- One-tap jumps: **View Records / Map / Analytics** for this group (reuse existing filter
  + hash wiring). Must preserve **8a** (`guideFocus` URL state) and **8b**.

## Sub-slices (one commit each; verify in-browser → ff `main` → push to live)

8c-1 is **void** (the divergent-skin attempt, reverted). The real work is compositional:

| # | Commit | What | Risk |
|---|--------|------|------|
| 8c-a | `Browse: imagery-forward group cards + hierarchy` | Refine tile markup/CSS within the existing language: larger image area, rank eyebrow (`.gtr`), clearer name/vernacular/stat hierarchy, spacing/rhythm. Keyboard-operable, reduced-motion-safe hover, visible focus ring. No new colour/font. | Med |
| 8c-b | `Browse: curated feature-tile grid` | A few larger feature tiles (top groups / most types) for editorial rhythm; responsive; DOM/tab order preserved; graceful on large ranks (keep today's cap + note). | Med |
| 8c-c | `Browse: type-specimen headline on tiles` | One CORS-safe faceted query (rank field faceted, filtered to type specimens) → map group→typeCount; lazy **red** badge on tiles with types (honest: only when >0). Cached; no bursts. | Med |
| 8c-d | `Browse: redesigned group focus ("opened drawer")` | Hero + headline stat strip (types in red) + narrative (8b) + child plates + specimen gallery + blurb + cross-view jumps. Builds on `deriveHoldingsStats`; **keeps 8a + 8b**. No new colour/font. | Med-High |
| 8c-e | `Browse: a11y, responsive & reduced-motion pass` | Keyboard nav, focus visibility, ARIA labels (group + key stats), AA contrast audit (existing tokens already pass — confirm), laptop/mobile breakpoints, `prefers-reduced-motion` verification; `?selftest` probes for any new pure helpers (tile-emphasis selector, type-facet parser). | Low-Med |

Accessibility is **baked into each slice**, not deferred; 8c-e is the audit/cleanup gate
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
