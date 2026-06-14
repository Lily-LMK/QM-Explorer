# Kickoff — starting a fresh session on QM Collections Explorer

How to (re)start work on the project, plus two ready-to-paste kickoff prompts:
a **default** one for picking up where the roadmap left off, and a **full review**
one for a periodic deep health-check.

## How Lily works this project

- **Opus plans, Sonnet builds.** Opus (or Fable for the visual layer) does the
  architecture/planning in conversation and writes precise prompts; Sonnet executes them
  in the VS Code extension. Each backlog line is one focused commit.
- **`CLAUDE.md` auto-loads**, so any model already has the project orientation and the
  ALA constraints — the kickoff just focuses it on the current chapter.
- Source of truth: `CLAUDE.md` (constraints + patterns), `docs/ROADMAP.md` (the plan +
  what's done), `docs/BROWSE-REDESIGN-BRIEF.md` (Phase 3 creative spec).

## Before you start

```bash
cd ~/Documents/Claude/QM-Explorer
git checkout -b <chapter-branch>     # keep main (the live site) deployable
python3 -m http.server 8000          # serve; open http://localhost:8000
claude                               # or use the VS Code extension
```

In Claude: `/model` to pick the model (Fable for heavy creative/visual work). Hard-reload
(Cmd+Shift+R) to beat the service-worker cache. Run `http://localhost:8000/?selftest` and
confirm it's green before and after any change.

---

## Default kickoff — paste this for "continue the roadmap"

```
You are acting as senior product architect and technical reviewer for QM Collections
Explorer — a single-file, keyless, no-build static web app over the ALA biocache API.

Before writing or changing any code, read:
  • CLAUDE.md  (project constraints + code patterns — the #1 rules)
  • docs/ROADMAP.md  (where the project is, what's done, what's next)
  • docs/BROWSE-REDESIGN-BRIEF.md  (the Phase 3 creative spec)
  • the relevant index.html code paths for the next slice

Then play back to me, briefly and in plain language:
  1. The current state (what's live) and the single next item on the roadmap.
  2. The exact functions/regions you'd touch for that item, and any risks.
  3. How you'd verify it in-browser (incl. accessibility + reduced-motion where relevant).

Do NOT edit files yet. After your summary, propose a tight plan for the NEXT SLICE only
(not the whole phase), then wait for my go-ahead. When we agree, write a precise prompt
I can hand to Sonnet in VS Code — one focused commit, with explicit before/after anchors
and a verification checklist. Keep main deployable; push only when I ask.

Guardrails (non-negotiable):
  • No backend, proxy, API key, framework, or build system (static/keyless/no-build is
    decided). Offline mode is out of scope.
  • Never violate ALA constraints; never AND-join fq filters (separate fq params via
    appendFQ/fqQS).
  • Never re-apply isGenericVern to lookupVern's output; never set a restrictive fl= on
    biocache image queries.
  • Don't hide uncertainty or errors. Protect scientific accuracy, provenance,
    accessibility, and public usefulness. Treat this as a serious museum/public-data
    interface, not a demo.
```

---

## Full review kickoff — paste this for a periodic deep health-check

Use occasionally (e.g. at a phase boundary) when you want a whole-app re-audit rather
than the next slice. Heavier; re-derives a lot.

```
Act as senior product architect, creative director, and technical reviewer for the whole
QM Collections Explorer — not only the Browse redesign.

Before writing or changing any code, read: CLAUDE.md, README.md, docs/ROADMAP.md,
docs/BROWSE-REDESIGN-BRIEF.md, and index.html — focusing on the major architecture and
the Records, Taxa, Browse, Map, Analytics, modal, query-building, common-name, image,
map-loading, CSV/export, and spatial-enrichment code paths. Do not edit files yet.

Report back in this structure:

1. Project understanding — what it is today; what makes it valuable; what makes it
   fragile; what its strongest identity could become as a public museum interface.

2. Integrity & risk audit — ALA/biocache constraints that must not be violated; CORS-safe
   query rules; result-window/paging limits; static/keyless/no-build constraints; service
   worker/cache risks; places where errors may be misleading or hidden; brittle patterns.

3. Product architecture assessment — for each area (Records, Taxa, Browse, Map, Analytics,
   specimen modal, CSV/export, spatial enrichment, common-name resolution, image
   resolution & provenance, URL state/shareability, accessibility/keyboard, performance on
   large result sets): what works, what's weak, what to protect, what to improve, and what
   not to touch yet.

4. Strategic roadmap — confirm or revise the staged plan in docs/ROADMAP.md (data
   integrity → shared infrastructure → Browse flagship → map/export/perf → visual
   identity/polish). For each phase: goal, why it matters, files/functions likely touched,
   risks, manual browser verification, accessibility checks, reduced-motion checks where
   relevant, and a clean commit boundary.

5. Browse in context — what Browse should become, and what (if anything) still needs to
   exist before deep visual work. NOTE: the image cascade and rank-aware common names are
   already built and live — build on them, don't rebuild.

6. Recommended first/next implementation slice — the highest-leverage low-risk step now.

7. Prompts for Claude Code — one no-code integrity-audit prompt; one for the next
   implementation slice; one for reviewing that slice before commit.

Guardrails: no backend/proxy/API key/framework/build (argue explicitly if you ever think
one is warranted); never violate ALA constraints; never AND-join fq filters; never
re-filter lookupVern with isGenericVern; don't hide uncertainty or errors; protect
scientific accuracy, provenance, accessibility, and public usefulness. Serious
museum/public-data interface, not a demo.
```

---

## The loop after planning

1. Agree the plan for one slice.
2. Sonnet builds it; review the diff in the VS Code extension.
3. Verify in-browser: serve, hard-reload, run `?selftest` (green), click through the real
   UI; toggle OS reduced-motion and check keyboard nav for visual work.
4. Commit the increment (one focused message). Merge to `main` at a clean boundary.
5. Push only when Lily asks. `/clear` between slices to keep context sharp.

## Reminders

- Press **Esc** to interrupt the moment it heads the wrong way. Small commits = easy rollback.
- `?selftest` is the regression gate — keep it green and add probes as you add logic.
- The briefs + `CLAUDE.md` are the source of truth — point the model at them rather than
  re-explaining.
- `claude update` to update the CLI (never npm); `claude doctor` if something's off.
