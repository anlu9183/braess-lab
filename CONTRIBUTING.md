# Contributing to Braess Lab

Thanks for your interest! Braess Lab is the open-source computational companion
to *Braess' Paradox in Uniform Affine Grid Networks* (Andy Lu and Steven J.
Miller). Contributions of all sizes are welcome — bug reports, tests, new
gallery presets, UI polish, and extensions to the search.

## Scope

Please keep changes consistent with the project's honest scope: it analyzes
**idealized, structured networks** (uniform affine grids plus one chord, and
small free-form affine networks), not real road systems. See the "Scope" note
in the [README](README.md).

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # Vitest suite (reproduces the paper's §3.4 numbers)
npm run build    # type-check + production build in dist/
npm run lint     # oxlint
```

Requires Node 20+.

## Architecture

The math engine (`src/core/`) is **pure TypeScript with no React or DOM
dependencies** — it is the scientific artifact and must stay framework-agnostic
and fully tested. The UI (`src/components/`, `src/state/`) is the interface to
it, and the search runs in a Web Worker (`src/workers/`). Please preserve this
separation: put solver/math logic in `src/core/` with tests, and keep
rendering concerns in the components.

## Pull requests

1. Fork and branch from `main`.
2. Add or update tests in `src/core/__tests__/` for any engine change. New
   numerical results should be checked against the paper and/or cross-validated
   with the Frank–Wolfe solver.
3. Make sure `npm test`, `npm run build`, and `npm run lint` all pass.
4. Keep the diff focused and describe *what* changed and *why* it is correct
   (cite the relevant lemma/theorem where applicable).

## Reporting bugs

Open an issue with a minimal reproduction: grid size, chord endpoints, latency
parameters (a, b, c, d), and demand q — or a share link from the sandbox.
Numerical discrepancies against the paper are especially valuable.
