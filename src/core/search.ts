// The corrected-maximum search (the paper's deferred companion computation),
// as a pure function so it runs identically in the Web Worker and in tests.
//
// For every grid m <= n <= maxN, enumerate chords that can possibly harm
// (SE/NW, k > 0, Vuv < 0 — Cor. 2.15 / Thm. 2.12), score them by the cheap
// spectral relaxation BR_rel, and evaluate the honest orientation-constrained
// BR in descending BR_rel order. Since BR <= BR_rel, the scan stops once
// BR_rel cannot beat the grid's honest best: per-grid maxima are exact up to
// the solve budget. Chord parameters follow §3.2: c = d = 0,
// b* = (q Ruv - Vuv)/k.

import { GridSpectral } from './grid';
import { solveGridChord } from './equilibrium';
import { chordCanHarm, relaxedBraessRatio } from './braess';
import type { GridSummary, SearchRow } from '../workers/protocol';

export interface SearchOptions {
  maxN: number;
  perGridBudget: number;
  isCancelled?: () => boolean;
  onGridDone?: (
    done: number,
    total: number,
    label: string,
    rows: SearchRow[],
    grids: GridSummary[],
    bestBR: number,
    honestSolves: number,
  ) => void;
}

export interface SearchResult {
  rows: SearchRow[];
  grids: GridSummary[];
  bestBR: number;
  honestSolves: number;
  cancelled: boolean;
}

export function runSearch(opts: SearchOptions): SearchResult {
  const { maxN, perGridBudget } = opts;
  const isCancelled = opts.isCancelled ?? (() => false);

  const gridList: Array<[number, number]> = [];
  for (let m = 1; m <= maxN; m++) {
    for (let n = m; n <= maxN; n++) gridList.push([m, n]);
  }

  const rows: SearchRow[] = [];
  const grids: GridSummary[] = [];
  let bestBR = 1;
  let honestSolves = 0;
  let cancelled = false;

  for (let gi = 0; gi < gridList.length; gi++) {
    if (isCancelled()) {
      cancelled = true;
      break;
    }
    const [m, n] = gridList[gi];
    const gs = new GridSpectral(m, n);
    const s = { i: 0, j: 0 };
    const t = { i: m, j: n };
    const Rst = gs.quad(s, t, s, t);

    interface Cand {
      u: { i: number; j: number };
      v: { i: number; j: number };
      k: number;
      Vuv: number;
      Ruv: number;
      BRrel: number;
    }
    const cands: Cand[] = [];
    for (let ui = 0; ui <= m; ui++) {
      for (let uj = 0; uj <= n; uj++) {
        for (let vi = 0; vi <= m; vi++) {
          for (let vj = 0; vj <= n; vj++) {
            const u = { i: ui, j: uj };
            const v = { i: vi, j: vj };
            if (!chordCanHarm(u, v)) continue;
            const Vuv = gs.quad(s, t, u, v); // q = 1, a = 1
            if (Vuv >= 0) continue;
            const k = vi + vj - ui - uj;
            const Ruv = gs.quad(u, v, u, v);
            const BRrel = relaxedBraessRatio({ m, n, q: 1 }, Rst, Ruv, Vuv, k);
            if (BRrel > 1 + 1e-12) cands.push({ u, v, k, Vuv, Ruv, BRrel });
          }
        }
      }
    }
    cands.sort((a, b) => b.BRrel - a.BRrel);

    let gridBest = 1;
    let solves = 0;
    for (const c of cands) {
      if (isCancelled()) break;
      // Honest BR <= BR_rel: nothing further down the sorted list can beat
      // the grid's current honest best.
      if (c.BRrel <= gridBest + 1e-13) break;
      if (solves >= perGridBudget) break;
      const bStar = (c.Ruv - c.Vuv) / c.k;
      const sol = solveGridChord({ m, n, a: 1, b: bStar, q: 1 }, { u: c.u, v: c.v, c: 0, d: 0 }, gs);
      solves++;
      honestSolves++;
      if (sol.BR > gridBest) gridBest = sol.BR;
      if (sol.BR > 1 + 1e-12) {
        rows.push({
          m,
          n,
          u: c.u,
          v: c.v,
          k: c.k,
          Vuv: c.Vuv,
          Ruv: c.Ruv,
          BRrel: c.BRrel,
          BR: sol.BR,
          zStar: sol.zStar,
          zbar: sol.fr.zbar,
          bStar,
        });
      }
    }
    bestBR = Math.max(bestBR, gridBest);
    grids.push({ m, n, bestBR: gridBest, solves, candidates: cands.length });

    rows.sort((a, b) => b.BR - a.BR);
    rows.length = Math.min(rows.length, 200);
    opts.onGridDone?.(gi + 1, gridList.length, `${m}×${n}`, rows.slice(0, 30), [...grids], bestBR, honestSolves);
  }

  return { rows, grids, bestBR, honestSolves, cancelled };
}
