# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
