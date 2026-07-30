# Braess Lab

Interactive companion webapp to *“Braess' Paradox in Uniform Affine Grid Networks”*
(Andy Lu and Steven J. Miller). Everything runs in the browser — no backend.

```bash
npm install
npm run dev     # local dev server
npm test        # regression tests against the paper's §3.4 numbers
npm run build   # static build in dist/ (deployable to GitHub Pages / Vercel)
```

## What it does

**Sandbox (Grid)** — a uniform affine grid G(m,n) with latency ℓ(x) = a·x + b on
every road and one user-placed chord u→v with latency c·x + d. The User
Equilibrium re-solves live as you drag sliders, using the paper's machinery:
spectral closed-form Laplacian pseudoinverse quantities (R_st, R_uv, V_uv, the
first breakpoint z̄), and the orientation-constrained active-set QP beyond it.
Multisim-style instruments: hover a road for an ammeter (flow, latency), a node
for a voltmeter (potential), flip the switch drawn on the chord to toggle it in
and out of the circuit. The “Electrical relaxation” view shows the unconstrained
resistor current and highlights roads it would run backwards — the exact reason
BR_rel overstates the honest Braess ratio. A voltage lens colors nodes by V_uv
to visualize why only SE/NW chords can harm (Cor. 2.15). Curve panels plot
E→(z) vs E(z) with the orientation penalty shaded, the reduced Beckmann
potential Ψ(z), and the voltage-area criterion of Thm. 2.14. Demand and
chord-price sweeps demonstrate the edge-usage threshold V_uv + bk = d (Cor. 2.8).

**Sandbox (Free-form)** — build arbitrary directed networks (add/drag nodes,
draw edges, set per-edge a, b); solved with Frank–Wolfe on the Beckmann
potential. Select any edge for a Braess check: the equilibrium is re-solved
without it and BR(e) reported. Ships with the classic 4-node Braess network.

**Gallery** — presets reproducing the paper: the classic example (BR = 4/3),
the 4×10 flagship of §3.4 (z̄ ≈ 0.046, z* ≈ 0.3798, BR ≈ 1.0003262 vs
BR_rel ≈ 1.0202259), the edge-usage threshold, the voltage lens, linear-latency
immunity (Lemma 2.2), and safe shortcuts (Cor. 2.15 + Lemma 2.1).

**Research** — the “companion computation” the paper defers: a Web Worker
searches all grids m ≤ n ≤ N for the chord maximizing the *honest*
orientation-constrained Braess ratio, pruned by Cor. 2.15, Thm. 2.12 and
BR ≤ BR_rel (candidates tried in descending BR_rel order, so per-grid maxima
are exact up to the solve budget). Chord parameters follow §3.2 (c = d = 0,
b* = (q·R_uv − V_uv)/k). Results stream into a ranked table (click a row to
open it in the sandbox), a per-grid best-BR heatmap, and CSV export.

## Numerical core (`src/core/`)

| module | contents |
|---|---|
| `grid.ts` | Kronecker spectral eigenbasis of the grid Laplacian; closed-form L⁺ quadratic forms and potential fields; first-region data and breakpoint z̄ |
| `laplacian.ts` | sparse weighted-Laplacian CG solve (Jacobi-preconditioned, nullspace-projected) |
| `qp.ts` | orientation-constrained energy min ‖x‖² s.t. Bx = p, x ≥ 0 — primal active-set (Lawson–Hanson style), the paper's §3.3 continuation at fixed z |
| `equilibrium.ts` | exact grid+chord equilibrium (golden-section on the strictly convex reduced Beckmann Ψ(z)); Frank–Wolfe for arbitrary affine networks; unconstrained electrical flow |
| `braess.ts` | chord classification, BR_rel (§3.2), full chord analysis incl. System Optimum / Price of Anarchy |
| `search.ts` | the corrected-maximum search over grids |

The test suite (`npm test`) asserts the paper's §3.4 values to their published
precision, cross-checks the spectral formulas against the CG solver and the
exact QP solver against Frank–Wolfe, and verifies the structural theorems
(shortcut immunity, linear-latency immunity, BR < 4/3).

## Notes and caveats

- The exact solver covers a uniform grid plus **one** chord (the paper's
  setting). Free-form mode has no such restriction but uses Frank–Wolfe
  (sublinear convergence; the solver-gap tile reports the relative gap).
- The research search evaluates the honest BR at the relaxation-optimal
  intercept b*. Maximizing over b per chord (a 1-D outer search) is the natural
  next refinement, as is extending past N = 16.
