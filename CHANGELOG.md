# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-31

Initial public release.

### Added
- Pure math engine (`src/core/`): grid Laplacian spectral machinery and
  closed-form L⁺ quantities, orientation-constrained active-set QP, exact
  grid+chord equilibrium solver, Frank–Wolfe solver for arbitrary affine
  networks, and the maximum-Braess-ratio search.
- Grid sandbox with live re-solving, instruments (ammeter/voltmeter), voltage
  lens, electrical-relaxation view, energy/Ψ/voltage-area curves, and
  demand/price sweeps.
- Free-form sandbox with a leave-one-out Braess scan, solved by Frank–Wolfe.
- Gallery of presets illustrating the paper's results.
- Research tab: a Web Worker search that maximizes the honest Braess ratio over
  the grid intercept `b` per chord (`maxBRoverB`; `c = d = 0` by Thm. 4.2), with
  a ranked table, per-grid heatmap, a severity-vs-(m+n) trend chart, and CSV
  export.
- Test suite: reference solver values (an illustrative 4×10 configuration) to
  high precision, spectral↔CG and QP↔Frank–Wolfe cross-checks, and the
  structural theorems (shortcut immunity, linear-latency immunity, BR < 4/3 —
  Thm. 4.1).
- Open-source scaffolding: MIT `LICENSE`, `CITATION.cff`, `CONTRIBUTING.md`, and
  a "Scope" statement in the README and UI.
- GitHub Actions: CI (lint + tests + build on push and PRs) and automatic
  GitHub Pages deployment. Live demo at https://anlu9183.github.io/braess-lab/ .
  Vite `base` configured for Pages.

### Accessibility
- Light-mode muted text meets WCAG AA contrast (≥ 4.5:1); accessible names on
  the charts, the heatmap, and all sandbox controls; `role="dialog"` semantics
  on the latency dialog; plain-language ⓘ tooltips on the grid stat tiles.

### Notes
- Theorem/section references follow the finished paper's numbering: BR < 4/3 =
  Thm. 4.1; SE/NW capability = Thm. 2.12; travel-time/voltage criterion =
  Thm. 2.11; first-region voltage bound = Thm. 2.10; zero-latency maximizer =
  Thm. 4.2; edge usage = Cor. 2.8. The 4×10 case is an illustrative reference
  configuration (cross-checked against Frank–Wolfe), not a published worked
  example.

[Unreleased]: https://github.com/anlu9183/braess-lab/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anlu9183/braess-lab/releases/tag/v0.1.0
