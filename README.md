# Braess Lab

Interactive companion webapp to *“Braess' Paradox in Uniform Affine Grid Networks”*
(Andy Lu and Steven J. Miller). Everything runs in the browser — no backend.

## Quickstart

**Prerequisites:** [Node.js](https://nodejs.org/) **20 or newer** (the toolchain
uses Vite 8 / Vitest 4) and npm.

```bash
npm install          # install dependencies

npm run dev          # start the dev server, then open http://localhost:5173

npm test             # run the test suite (solver regression + Frank–Wolfe cross-checks)

npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally to check it
npm run lint         # static analysis with oxlint
```

Only `npm run dev` is needed to explore the app locally; the others are for
testing, producing a deployable static bundle (`dist/`, hostable on GitHub
Pages / Vercel / any static host), and checking that build before shipping.

## Scope (please read)

Braess Lab is deliberately, honestly scoped. It does **exactly** what the
paper's theory supports and nothing more:

- ✅ Exact analysis of **uniform affine grids plus one chord** — the setting the
  paper covers — via closed-form spectral math.
- ✅ Exploration of **small, structured, directed affine networks** in the
  free-form sandbox (solved numerically by Frank–Wolfe).

It is **not**, and does not claim to be:

- ❌ A real-road planning or decision-support tool. Real networks are
  non-graded, non-uniform, nonlinear, and multi-origin/destination; general
  Braess detection is NP-hard (Roughgarden 2006).
- ❌ A backend service — everything runs client-side in your browser.
- ❌ A general traffic simulator — no time dynamics, signals, or elastic demand.

The free-form sandbox is structured-network *exploration*, never real-road
analysis.

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
to visualize why only SE/NW chords can harm (Thm. 2.12). Curve panels plot
E→(z) vs E(z) with the orientation penalty shaded, the reduced Beckmann
potential Ψ(z), and the travel-time / voltage criterion of Thm. 2.11. Demand and
chord-price sweeps demonstrate the edge-usage threshold V_uv + bk = d (Cor. 2.8).

**Sandbox (Free-form)** — build arbitrary directed networks (add/drag nodes,
draw edges, set per-edge a, b); solved with Frank–Wolfe on the Beckmann
potential. Select any edge for a Braess check: the equilibrium is re-solved
without it and BR(e) reported. Ships with the classic 4-node Braess network.

**Gallery** — presets illustrating the theory: the classic Braess example
(BR = 4/3, from the paper), an illustrative 4×10 grid case (z̄ ≈ 0.046,
z* ≈ 0.3798, BR ≈ 1.0003262 vs BR_rel ≈ 1.0202259 — a reference solver
configuration), the edge-usage threshold, the voltage lens, linear-latency
immunity (Lemma 2.2), and safe shortcuts (Thm. 2.12 + Lemma 2.1).

**Research** — the “companion computation” the paper defers (§5 Future
Directions leaves the supremum of the Braess ratio, the maximizing chord
location, and the maximizing grid dimensions open): a Web Worker searches all
grids m ≤ n ≤ N for the chord maximizing the *honest* orientation-constrained
Braess ratio, pruned by the SE/NW capability restriction (Thm. 2.12),
V_uv < 0 (Thm. 2.11), and BR ≤ BR_rel (candidates tried in descending BR_rel
order, so per-grid maxima are exact up to the solve budget). Chord parameters
use the ratio-maximizing zero-latency chord (c = d = 0, Thm. 4.2) with
b* = (q·R_uv − V_uv)/k. Results stream into a ranked table (click a row to
open it in the sandbox), a per-grid best-BR heatmap, and CSV export.

## Numerical core (`src/core/`)

| module | contents |
|---|---|
| `grid.ts` | Kronecker spectral eigenbasis of the grid Laplacian; closed-form L⁺ quadratic forms and potential fields; first-region data and breakpoint z̄ |
| `laplacian.ts` | sparse weighted-Laplacian CG solve (Jacobi-preconditioned, nullspace-projected) |
| `qp.ts` | orientation-constrained energy min ‖x‖² s.t. Bx = p, x ≥ 0 — primal active-set (Lawson–Hanson style), the paper's directed-energy continuation at fixed z (Thm. 2.7) |
| `equilibrium.ts` | exact grid+chord equilibrium (golden-section on the strictly convex reduced Beckmann Ψ(z)); Frank–Wolfe for arbitrary affine networks; unconstrained electrical flow |
| `braess.ts` | chord classification, BR_rel (the relaxation upper bound, Thm. 2.11), full chord analysis incl. System Optimum / Price of Anarchy |
| `search.ts` | the corrected-maximum search over grids |

The test suite (`npm test`) asserts the reference solver values (an illustrative
4×10 configuration) to high precision, cross-checks the spectral formulas
against the CG solver and the exact QP solver against Frank–Wolfe, and verifies
the structural theorems (shortcut immunity, linear-latency immunity, BR < 4/3 —
Thm. 4.1).

## Notes and caveats

- The exact solver covers a uniform grid plus **one** chord (the paper's
  setting). Free-form mode has no such restriction but uses Frank–Wolfe
  (sublinear convergence; the solver-gap tile reports the relative gap).
- The research search evaluates the honest BR at the relaxation-optimal
  intercept b*. Maximizing over b per chord (a 1-D outer search) is the natural
  next refinement, as is extending past N = 16.
