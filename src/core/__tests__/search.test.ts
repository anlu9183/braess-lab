// The corrected-maximum search: structural invariants on a small sweep.

import { describe, expect, it } from 'vitest';
import { runSearch, maxBRoverB } from '../search';
import { GridSpectral } from '../grid';
import { solveGridChord } from '../equilibrium';

describe('corrected-maximum search (N <= 6)', () => {
  const result = runSearch({ maxN: 6, perGridBudget: 60 });

  it('completes all 21 grids', () => {
    expect(result.grids.length).toBe(21);
    expect(result.cancelled).toBe(false);
  });

  it('every honest BR respects BR <= BR_rel < 4/3', () => {
    for (const r of result.rows) {
      expect(r.BR).toBeLessThanOrEqual(r.BRrel + 1e-9);
      expect(r.BRrel).toBeLessThan(4 / 3);
      expect(r.Vuv).toBeLessThan(0);
      expect(r.k).toBeGreaterThan(0);
    }
  });

  it('rows are sorted by honest BR descending', () => {
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i - 1].BR).toBeGreaterThanOrEqual(result.rows[i].BR);
    }
  });

  it('bestBR matches the top row / grid summaries', () => {
    const gridMax = Math.max(...result.grids.map((g) => g.bestBR));
    expect(result.bestBR).toBeCloseTo(gridMax, 12);
    if (result.rows.length > 0) {
      expect(result.bestBR).toBeCloseTo(result.rows[0].BR, 12);
    }
  });

  it('every row carries the BR-optimal intercept bOpt above its usage threshold', () => {
    for (const r of result.rows) {
      // Chord is used iff b·k > -Vuv (Cor. 2.8, d = 0); a Braess row must exceed it.
      expect(r.bOpt * r.k).toBeGreaterThan(-r.Vuv);
    }
  });
});

describe('max-over-b inner search', () => {
  // The 4x10 reference chord is Braess-capable.
  const m = 4;
  const n = 10;
  const gs = new GridSpectral(m, n);
  const u = { i: 0, j: 6 };
  const v = { i: 4, j: 4 };
  const Vuv = gs.quad({ i: 0, j: 0 }, { i: m, j: n }, u, v);
  const Ruv = gs.quad(u, v, u, v);
  const k = v.i + v.j - (u.i + u.j);

  it('beats (or ties) the honest BR at the relaxation-optimal intercept b*', () => {
    const bStar = (Ruv - Vuv) / k;
    const brAtStar = solveGridChord({ m, n, a: 1, b: bStar, q: 1 }, { u, v, c: 0, d: 0 }, gs).BR;
    const opt = maxBRoverB(m, n, u, v, Vuv, Ruv, k, gs);
    expect(opt.BR).toBeGreaterThanOrEqual(brAtStar - 1e-9);
    expect(opt.BR).toBeLessThan(4 / 3);
    expect(opt.bOpt).toBeGreaterThan(0);
    expect(opt.solves).toBeGreaterThan(1);
  });

  it('the optimizer recomputes to the same BR at its own bOpt', () => {
    const opt = maxBRoverB(m, n, u, v, Vuv, Ruv, k, gs);
    const check = solveGridChord({ m, n, a: 1, b: opt.bOpt, q: 1 }, { u, v, c: 0, d: 0 }, gs);
    expect(check.BR).toBeCloseTo(opt.BR, 10);
  });
});
