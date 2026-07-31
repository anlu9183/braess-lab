# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Research search now maximizes the honest Braess ratio over the grid intercept
  `b` per chord (a 1-D inner search, `maxBRoverB`; `c = d = 0` fixed by Thm. 4.2),
  so each grid's reported value is its true maximum honest ratio rather than the
  value at the relaxation-optimal `b*`. The `BR ≤ BR_rel` pruning stays valid
  (BR_rel bounds the honest ratio over all `b`), verified by tests.
- Research tab: a severity-vs-(m+n) trend chart plotting the best honest BR − 1
  against grid size, addressing §5's open question of the maximizing grid
  dimensions and the supremum.

### Changed
- Search results/CSV report `bOpt` (the BR-maximizing intercept) in place of the
  old fixed `bStar` column; the "honest solves / grid" input is now "chords /
  grid" (each chord runs the inner b-search).
- Synced all theorem/section references to the finished paper's numbering
  (built against an earlier draft): BR < 4/3 is now **Thm. 4.1**; the SE/NW
  directional/Braess-capability restriction is **Thm. 2.12**; the travel-time /
  voltage criterion is **Thm. 2.11**; the first-region voltage bound is
  **Thm. 2.10**; zero-latency maximizer stays **Thm. 4.2**; edge-usage stays
  **Cor. 2.8**. Removed stale references (Cor. 2.15, Thm. 2.14, Lemma 2.13,
  Thm. 3.1, Observation 2.4, §3.2/§3.3/§3.4).
- Reframed the 4×10 case as an *illustrative reference configuration*
  (cross-checked against Frank–Wolfe) rather than a published "§3.4 flagship,"
  since the finished paper contains no such worked example. Numbers and tests
  are unchanged; only the framing/labels were corrected.
- Research tab now points to §5 (Future Directions), which leaves the Braess-
  ratio supremum, the maximizing chord location, and the maximizing grid
  dimensions open.

## [0.1.0] - 2026-07-30

Initial public release.

### Added
- Pure math engine (`src/core/`): grid Laplacian spectral machinery and
  closed-form L⁺ quantities, orientation-constrained active-set QP, exact
  grid+chord equilibrium solver, Frank–Wolfe solver for arbitrary affine
  networks, and the corrected-maximum Braess-ratio search.
- Grid sandbox with live re-solving, instruments (ammeter/voltmeter), voltage
  lens, electrical-relaxation view, energy/Ψ/voltage-area curves, and
  demand/price sweeps.
- Free-form sandbox with a leave-one-out Braess scan, solved by Frank–Wolfe.
- Gallery of presets reproducing the paper's results.
- Research tab: Web Worker–driven max-Braess-ratio search with ranked table,
  per-grid heatmap, and CSV export.
- Test suite reproducing the paper's §3.4 numbers, cross-checking the spectral
  solver against Frank–Wolfe, and verifying the structural theorems.
- Open-source scaffolding: MIT `LICENSE`, `CITATION.cff`, `CONTRIBUTING.md`,
  and a "Scope" statement in the README and UI.
- Vite `base` path configured for GitHub Pages deployment.

[Unreleased]: https://github.com/anlu9183/braess-lab/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anlu9183/braess-lab/releases/tag/v0.1.0
