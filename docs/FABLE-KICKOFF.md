# Fable kickoff — Browse redesign

How to start the Browse-redesign work with the Fable model in Claude Code, plus a
ready-to-paste first message.

## Before you start

```bash
cd ~/Documents/Claude/QM-Explorer
git checkout -b browse-redesign      # keep main (the live site) safe
claude                               # start Claude Code
```

In Claude:
- `/model` → choose **Fable** (strong for the creative/visual work here).
- Press **Shift+Tab** to enter **Plan mode** before any building.
- Paste the kickoff message below.

`CLAUDE.md` auto-loads, so Fable already has the project orientation and the ALA
constraints — the message just focuses it on this chapter and the right sequence.

## Paste this as the first message

```
You are leading the Browse redesign for QM Collections Explorer.

Before writing ANY code:
1. Read CLAUDE.md, docs/PLANNING-BRIEF.md, and docs/BROWSE-REDESIGN-BRIEF.md in full.
2. Read the existing Browse code in index.html: renderGuide, the guideFocus detail
   path, the tilesNeedingImgs image loop, and _fillTreeVern (the working, lazy
   common-name resolver pattern). Note alaBaseFQ / appendFQ / fqQS and the vernacular
   functions (lookupVern, batchFetchVernaculars, _vernCache, _localVern).
3. Play back to me, in plain language: what Browse does today, its problems
   (including the family-tile mislabel bug — e.g. Chelidae shown as "Fitzroy River
   Turtle"), the hard ALA constraints I must respect (SEPARATE fq params — never
   AND-join; pageSize<=100; 5000 result window; keyless/static, no API key), and the
   house guardrails (WCAG AA, prefers-reduced-motion, single static file, scientific
   accuracy + provenance/attribution).

Do NOT edit files yet. After your summary, switch to Plan mode and propose a PHASED
implementation plan in the brief's order:
  (a) the rank-appropriate image-resolution cascade (QM specimen -> ALA-wide ->
      iNaturalist/Wikipedia -> elegant placeholder; robust to image LOAD failures,
      cached, with provenance);
  (b) the per-group "holdings" data (specimen counts, richness, type specimens,
      imaging coverage) from existing facet/count queries;
  (c) the experience design (GSAP/Three.js) built on a reduced-motion baseline that
      is excellent on its own.
For each phase list the files/functions you'll touch, how you'll verify it in the
browser (a11y + reduced-motion included), and the risks.

Also propose ONE shared, rank-aware resolver for common names that the Taxa tree,
Browse, and ideally the record cards can all use, so names are consistent everywhere.

We'll review and refine the plan together before you build anything. Then build one
phase at a time and pause for verification after each.
```

## The loop after planning

1. Review/refine the plan; approve it.
2. Build **one phase**; review the diff in the VS Code extension.
3. Verify in the browser (Live Preview or `python3 -m http.server 8000`) — click
   through Browse; toggle OS reduced-motion; check keyboard nav. Hard-reload to beat
   the service-worker cache.
4. Commit the increment: `git add -A && git commit -m "Browse: <phase> ..."`.
5. `/clear` between phases to keep context sharp.
6. When a phase is solid: `git push -u origin browse-redesign`.

## Reminders

- Press **Esc** to interrupt the moment it heads the wrong way.
- Small commits = easy rollback.
- The briefs and CLAUDE.md are the source of truth — point Fable at them rather than
  re-explaining.
- `claude update` to update the CLI (never npm); `claude doctor` if something's off.
