# Braess Lab — Design Document

**Date:** 2026-07-28
**Authors:** Andy Lu (design), with Claude (facilitation)
**Companion to:** *Braess' Paradox in Uniform Affine Grid Networks*, Andy Lu and Steven J. Miller
**Repository (planned):** open-source on GitHub (public), MIT-licensed, static-hosted (GitHub Pages)

---

## 1. Purpose

Braess Lab is the interactive, open-source computational companion to the paper. It is a
client-only React/TypeScript single-page app that lets anyone explore Braess' paradox on the
*structured* networks the paper's theory actually covers, reproduces the paper's published
results as validated fixtures, and — the centerpiece — **uses computation to make progress on
the open problem the paper leaves unresolved: the true global maximum of the Braess Ratio.**

The guiding principle is honesty of scope. The app does exactly what the theory supports
(exact analysis of uniform-affine grids and small structured networks) and does **not** claim
to analyze real road networks. That restraint is deliberate and is stated plainly in the
README.

## 2. Goals and non-goals

**Goals**
- Faithfully implement the paper's math: closed-form spectral solver, orientation-constrained
  energy/QP, Braess classification.
- Reproduce the paper's published numbers as an automated test suite (regression fixtures).
- Provide an interactive grid sandbox with live re-solving as parameters change.
- Provide a free-form sandbox (arbitrary directed networks) via Frank–Wolfe, used partly to
  **cross-validate** the exact grid solver.
- Run a search that hunts the maximum Braess Ratio across grid sizes and chord placements, and
  **feed a conjecture for the global maximum back into the paper** (replacing the abstract's
  `VALUE` placeholder).
- Be a clean, well-documented, reproducible open-source artifact others can build on and cite.

**Non-goals (explicit, to prevent overclaim)**
- NOT a real-road planning or decision-support tool. Real networks are non-graded,
  non-uniform, nonlinear, multi-OD; general Braess detection is NP-hard (Roughgarden 2006).
- NOT a backend service. Everything runs client-side.
- NOT a general traffic-simulation platform (no time dynamics, no signals, no elastic demand).

## 3. The research payoff (coherence centerpiece)

This is what makes the app *advance* the research rather than merely illustrate it.

- **Target the open question.** The paper proves BR < 4/3 strictly (Thm 4.1) but leaves the
  *true supremum* undetermined (§ Future Directions; abstract `VALUE` placeholder). The
  search directly attacks it.
- **Prune with the paper's own theorem.** Theorem 4.2 proves the maximizing chord has zero
  latency (c = d = 0). The search therefore sweeps only chord *placements* on grids, not
  latency parameters — theory shrinking the search space.
- **Distinguish severity from prevalence.** Fig 3.1 / Table 1 maximize the *fraction* of
  Braess-capable chords (prevalence). The open question is the *maximum Braess Ratio*
  (severity). The app computes both but clearly separates them; prevalence reproduction is a
  regression fixture, severity-max is the new contribution.
- **Report the trend in m+n.** Output per-grid maxima and the trend as the grid grows, to
  support (a) a numerical conjecture for the supremum and (b) the "tighter upper bound
  decreasing in m+n reduces the global max to a finite check" idea from Future Directions.
- **Close the loop.** The search's exportable output (CSV/JSON + heatmap) becomes a figure and
  a conjectured value in the revised paper. Engineering → result → paper.

## 4. Architecture

```
Browser (client-only SPA)
├── src/core/        Pure TypeScript math engine — NO React, framework-agnostic, fully tested
├── src/ui/          React 19 components (sandboxes, gallery, research views)
├── src/workers/     Web Workers wrapping core search for non-blocking compute
└── src/fixtures/    Published paper numbers used as test oracles
```

- **Strict separation of engine and UI.** `src/core/` is pure functions over plain data
  structures (no React, no DOM). This is what makes it testable, reusable, and citable — the
  engine is the scientific artifact; the UI is the interface to it.
- **Stack:** Vite + React 19 + TypeScript; Vitest for tests; Web Workers for the search.
- **State:** UI-local state for sandboxes; the search streams results from a worker via
  message passing into a ranked table + heatmap.

## 5. Core engine module contracts (`src/core/`)

Each module is a pure, individually tested unit.

- **`gridSpectral.ts`** — grid Laplacian via Kronecker sum of path-graph Laplacians;
  eigendecomposition; pseudoinverse action `L⁺p`. Computes base voltage φ = L⁺·q(e_s − e_t),
  voltage drops `V_uv = φ_u − φ_v`, and effective resistances `R_st`, `R_uv`. O(|V|²).
- **`orientationEnergy.ts`** — the orientation-constrained energy E→(z) = min a‖x‖²
  s.t. Bx = q(e_s − e_t) − z(e_u − e_v), x ≥ 0. Detects flow-region breakpoints (first
  breakpoint z̄); returns E→ as a piecewise quadratic.
- **`activeSetQP.ts`** — nonnegativity-constrained quadratic solver backing
  `orientationEnergy` beyond the first flow region.
- **`sparseCG.ts`** — sparse Laplacian conjugate-gradient solver for the free-form path
  (arbitrary directed networks).
- **`equilibrium.ts`** — reduced Beckmann potential Z(z); minimize over [0, q]; return z*
  (via first-region formula, Cor 2.9, or QP beyond); edge-usage test (Cor 2.8, V_uv + bk > d).
- **`braess.ts`** — total costs C_old, C_new; Braess Ratio; classification via criterion
  (V_uv < 0 and k > 0) and exact cost comparison; per-edge Braess Ratio for free-form.
- **`frankWolfe.ts`** — Frank–Wolfe equilibrium for arbitrary directed affine networks
  (convergence tolerance configurable); used for the free-form sandbox and as an independent
  cross-check of the grid solver.
- **`gridSearch.ts`** — sweep grid sizes and zero-latency chord placements; compute max BR per
  grid; stream ranked results; **deterministic and seedless** (exhaustive/ordered, not random)
  so runs are exactly reproducible.

## 6. UI sections — spine vs. polish (YAGNI)

**Spine (build first — this is what makes it #1):**
- **Sandbox (Grid)** — uniform grid + one chord; sliders for a, b, c, d, q; live re-solve via
  the closed-form solver; show z*, BR, and whether Braess occurs.
- **Gallery** — presets reproducing the paper: the classic 4-node BR = 4/3 example and a
  flagship grid result. Each preset is also a test fixture.
- **Research** — worker-driven max-BR search with ranked, exportable table + heatmap and the
  m+n trend view. The loop from §3.

**Polish (add only if time allows):**
- Circuit instruments (ammeters/voltmeters/chord toggle), electrical-relaxation view, voltage
  lens, potential/energy curve panels, demand & price sweeps.
- Free-form sandbox (also serves as the FW cross-validation surface, so it has dual value).

## 7. Validation & testing strategy

This is the anti-decoration guarantee — rigor is the point.

- **Against the paper:** fixtures in `src/fixtures/` encode the paper's published prevalence
  numbers (Table 1) and worked severity examples; tests assert the engine reproduces them
  within tolerance.
- **Cross-solver agreement:** on grids, `frankWolfe` must match `gridSpectral`/`equilibrium`
  within tolerance — an independent numerical method confirming the exact math.
- **Theorem-as-invariant (property tests):** BR < 4/3 must hold on every generated case (a
  proven theorem — any violation is a guaranteed bug); shortcut chords (k ≤ 0) never induce
  Braess (Obs 3.1); zero-demand and zero-flow edge cases behave.
- **Classic anchor:** the 4-node example yields exactly BR = 4/3.
- **CI:** GitHub Actions runs `vitest` + typecheck + build on every push/PR.

## 8. Open-source setup (first-class)

- **License:** MIT (permissive; matches an academic companion tool). `LICENSE` at root.
- **README:** what it is, the honest scope statement (§2 non-goals), link to the paper, live
  demo link, screenshots/GIFs, quickstart, and a "how the engine maps to the paper" section.
- **CITATION.cff:** citation metadata pointing to the paper and the software, so the repo is
  citable (and shows up correctly on GitHub's "Cite this repository").
- **CONTRIBUTING.md + issue/PR templates:** lowers the bar for outside contributors; signals a
  real project.
- **Reproducibility:** the search is deterministic; exported result files carry the exact grid
  ranges and app version so any figure in the paper can be regenerated.
- **Deploy:** GitHub Pages via an Actions workflow building the Vite static bundle (Vercel as
  an alternative). Live demo URL in the README.
- **Attribution:** Andy Lu and Steven J. Miller credited; paper DOI/arXiv link once available.
- **Housekeeping:** semantic version tags; a CHANGELOG; `docs/` holds this design and a short
  "engine ↔ paper" mapping doc.

## 9. Milestones (phased)

1. **Engine core** — `gridSpectral`, `orientationEnergy`, `equilibrium`, `braess` + fixtures
   reproducing the paper. (Proves correctness before any UI.)
2. **Grid sandbox** — live solver UI.
3. **Research search + Gallery** — the loop; export; heatmap; trend. Produce the global-max
   conjecture for the paper.
4. **Open-source hardening** — README, LICENSE, CITATION.cff, CI, Pages deploy.
5. **Polish** — free-form + FW cross-validation; instruments/lenses as time allows.

## 10. Risks & mitigations

- **Scope creep** (many lenses) → protect the spine; polish is optional.
- **Numerical error in L⁺** (rounding near zero eigenvalues) → threshold small drops to zero
  (the paper uses 1e-12); test against published values.
- **Search cost blows up the browser** → Web Worker + zero-latency pruning (Thm 4.2) + bounded
  grid ranges with a clear "results limited to …" note (no silent truncation).
- **Overclaim drift** → the non-goals statement lives in README and UI "About"; free-form is
  labeled "structured-network exploration," never "real road analysis."

## 11. Open questions to resolve before implementation

- Exact grid range for the shipped search (bounded by browser compute) and how to present the
  trend toward the conjectured supremum.
- Whether free-form supports only affine latency (matches theory, enables cross-check) or also
  BPR (more general, but no exact oracle) — recommend affine-first.
- Final choice of the "flagship" gallery preset(s) to headline.
