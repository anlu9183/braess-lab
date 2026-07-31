// The corrected-maximum search (the paper's deferred companion computation),
// as a pure function so it runs identically in the Web Worker and in tests.
//
// For every grid m <= n <= maxN, enumerate chords that can possibly harm
// (SE/NW, k > 0, Vuv < 0 — Thm. 2.12 / Thm. 2.11), score them by the cheap
// spectral relaxation BR_rel, and evaluate the honest orientation-constrained
// BR in descending BR_rel order. Since BR <= BR_rel, the scan stops once
// BR_rel cannot beat the grid's honest best: per-grid maxima are exact up to
// the solve budget.
//
// Chord latency is c = d = 0 (Thm. 4.2). For each chord the honest BR is
// maximized over the remaining free parameter, the grid intercept b, by a
// 1-D inner search (maxBRoverB) — so the reported per-grid value is the true
// maximum honest Braess ratio, not merely its value at the relaxation-optimal
// intercept.

import { GridSpectral, type GridCoord } from './grid';
import { solveGridChord } from './equilibrium';
import { chordCanHarm, relaxedBraessRatio } from './braess';
import type { GridSummary, SearchRow } from '../workers/protocol';

export interface ChordBROverB {
  bOpt: number; // BR-maximizing grid intercept b (with c = d = 0)
  BR: number; // honest Braess ratio at bOpt
  zStar: number;
  zbar: number;
  solves: number; // number of solveGridChord evaluations spent
}

/**
 * Maximize the honest Braess ratio over the grid intercept b (with c = d = 0,
 * Thm. 4.2) for a fixed grid and chord endpoints.
 *
 * BR(b) = 1 below the edge-usage threshold b = -Vuv/k (Cor. 2.8), rises as the
 * chord starts attracting flow, peaks, and decays as b grows (the added edge
 * becomes negligible against the base intercept). A coarse scan brackets the
 * peak and golden section refines it; the running best is tracked directly, so
 * a mildly non-unimodal BR(b) cannot make the result worse than the samples.
 */
export function maxBRoverB(
  m: number,
  n: number,
  u: GridCoord,
  v: GridCoord,
  Vuv: number,
  Ruv: number,
  k: number,
  gs: GridSpectral,
  opts: { coarse?: number; refine?: number } = {},
): ChordBROverB {
  const coarse = opts.coarse ?? 10;
  const refine = opts.refine ?? 20;
  let solves = 0;

  const evalAt = (b: number) => {
    const sol = solveGridChord({ m, n, a: 1, b, q: 1 }, { u, v, c: 0, d: 0 }, gs);
    solves++;
    return sol;
  };

  const thr = -Vuv / k; // usage threshold (d = 0); > 0 since Vuv < 0, k > 0
  const bStar = (Ruv - Vuv) / k; // relaxation-optimal intercept (maximizes BR_rel)
  const lo = thr * (1 + 1e-6);
  const hi = Math.max(bStar * 4, bStar + 4, thr * 8);

  let bestB = bStar;
  let best = evalAt(bStar);
  const track = (b: number) => {
    const sol = evalAt(b);
    if (sol.BR > best.BR) {
      best = sol;
      bestB = b;
    }
    return sol.BR;
  };

  // Coarse bracket.
  for (let i = 0; i <= coarse; i++) track(lo + (i / coarse) * (hi - lo));

  // Golden-section refine around the best coarse sample.
  const step = (hi - lo) / coarse;
  let a = Math.max(lo, bestB - step);
  let c = Math.min(hi, bestB + step);
  const invPhi = (Math.sqrt(5) - 1) / 2;
  let x1 = c - invPhi * (c - a);
  let x2 = a + invPhi * (c - a);
  let f1 = track(x1);
  let f2 = track(x2);
  for (let it = 0; it < refine && c - a > 1e-10; it++) {
    if (f1 >= f2) {
      c = x2;
      x2 = x1;
      f2 = f1;
      x1 = c - invPhi * (c - a);
      f1 = track(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + invPhi * (c - a);
      f2 = track(x2);
    }
  }

  return { bOpt: bestB, BR: best.BR, zStar: best.zStar, zbar: best.fr.zbar, solves };
}

export interface SearchOptions {
  maxN: number;
  perGridBudget: number; // max candidate chords fully b-optimized per grid
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
    let chordsOptimized = 0;
    for (const c of cands) {
      if (isCancelled()) break;
      // BR_rel upper-bounds the honest BR for EVERY b, so once it cannot beat
      // the grid's current honest best, nothing further down the list can.
      if (c.BRrel <= gridBest + 1e-13) break;
      if (chordsOptimized >= perGridBudget) break;
      const opt = maxBRoverB(m, n, c.u, c.v, c.Vuv, c.Ruv, c.k, gs);
      chordsOptimized++;
      honestSolves += opt.solves;
      if (opt.BR > gridBest) gridBest = opt.BR;
      if (opt.BR > 1 + 1e-12) {
        rows.push({
          m,
          n,
          u: c.u,
          v: c.v,
          k: c.k,
          Vuv: c.Vuv,
          Ruv: c.Ruv,
          BRrel: c.BRrel,
          BR: opt.BR,
          zStar: opt.zStar,
          zbar: opt.zbar,
          bOpt: opt.bOpt,
        });
      }
    }
    bestBR = Math.max(bestBR, gridBest);
    grids.push({ m, n, bestBR: gridBest, solves: chordsOptimized, candidates: cands.length });

    rows.sort((a, b) => b.BR - a.BR);
    rows.length = Math.min(rows.length, 200);
    opts.onGridDone?.(gi + 1, gridList.length, `${m}×${n}`, rows.slice(0, 30), [...grids], bestBR, honestSolves);
  }

  return { rows, grids, bestBR, honestSolves, cancelled };
}
