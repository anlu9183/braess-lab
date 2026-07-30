// Regression tests against the paper's numbers.
//
// The flagship configuration (§3.4): 4x10 grid, s=(0,0), t=(4,10), every grid
// edge l(x) = x + 0.8442 (a=1), q=1, zero-latency chord (0,6) -> (4,4), k=2.
//   Rst ~ 3.2203, Vuv ~ -0.30417, Ruv ~ 1.3842
//   zbar ~ 0.046 at edge (0,6)->(1,6); zel ~ 1.0
//   z* ~ 0.3798, BR ~ 1.0003262, BR_rel ~ 1.0202259, sum x ~ 13.2404

import { describe, expect, it } from 'vitest';
import { GridSpectral, buildGridNetwork, firstRegionData, nodeIndex, type GridChord, type GridSpec } from '../grid';
import { electricalFlow, frankWolfe, solveGridChord, systemOptimum } from '../equilibrium';
import { classifyChord, chordCanHarm, relaxedBraessRatio } from '../braess';
import type { Edge } from '../graph';

const flagshipSpec: GridSpec = { m: 4, n: 10, a: 1, b: 0.8442, q: 1 };
const flagshipChord: GridChord = { u: { i: 0, j: 6 }, v: { i: 4, j: 4 }, c: 0, d: 0 };

describe('spectral quantities on the 4x10 flagship grid (§3.4)', () => {
  const fr = firstRegionData(flagshipSpec, flagshipChord);

  it('reproduces Rst, Ruv, Vuv', () => {
    expect(fr.Rst).toBeCloseTo(3.2203, 3);
    expect(fr.Ruv).toBeCloseTo(1.3842, 3);
    expect(fr.Vuv).toBeCloseTo(-0.30417, 4);
  });

  it('chord has level gain k = 2 and attracts flow (Cor. 2.8)', () => {
    expect(fr.k).toBe(2);
    expect(fr.used).toBe(true);
    expect(fr.Vuv + flagshipSpec.b * fr.k).toBeGreaterThan(0);
  });

  it('optimal intercept b* = (q Ruv - Vuv)/k ~ 0.8442', () => {
    expect((fr.Ruv - fr.Vuv) / fr.k).toBeCloseTo(0.8442, 3);
  });

  it('first-region minimizer zel ~ 1.0 and breakpoint zbar ~ 0.046 at (0,6)->(1,6)', () => {
    expect(fr.zel).toBeCloseTo(1.0, 2);
    expect(fr.zbar).toBeCloseTo(0.046, 2);
    const net = buildGridNetwork(flagshipSpec);
    const e = net.edges[fr.zbarEdge];
    expect(e.from).toBe(nodeIndex(flagshipSpec, 0, 6));
    expect(e.to).toBe(nodeIndex(flagshipSpec, 1, 6));
  });

  it('BR_rel ~ 1.0202259', () => {
    const brRel = relaxedBraessRatio(flagshipSpec, fr.Rst, fr.Ruv, fr.Vuv, fr.k);
    expect(brRel).toBeCloseTo(1.0202259, 5);
  });
});

describe('honest orientation-constrained equilibrium on the flagship (§3.4)', () => {
  const sol = solveGridChord(flagshipSpec, flagshipChord);

  it('equilibrium lies beyond the first breakpoint', () => {
    expect(sol.region).toBe('beyond-breakpoint');
  });

  it('z* ~ 0.3798', () => {
    expect(sol.zStar).toBeCloseTo(0.3798, 3);
  });

  it('BR ~ 1.0003262 > 1: the paradox occurs', () => {
    expect(sol.BR).toBeGreaterThan(1);
    expect(sol.BR).toBeCloseTo(1.0003262, 6);
  });

  it('total grid flow = q(m+n) - k z* ~ 13.2404 with all flows nonnegative', () => {
    let sum = 0;
    for (const x of sol.flows) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      sum += x;
    }
    expect(sum).toBeCloseTo(14 - 2 * sol.zStar, 6);
    expect(sum).toBeCloseTo(13.2404, 3);
  });
});

describe('classic 4-node Braess network via Frank-Wolfe', () => {
  // s=0, A=1, B=2, t=3; l_sA = x, l_At = 1, l_sB = 1, l_Bt = x; chord A->B: 0.
  const base: Edge[] = [
    { from: 0, to: 1, a: 1, b: 0 },
    { from: 1, to: 3, a: 0, b: 1 },
    { from: 0, to: 2, a: 0, b: 1 },
    { from: 2, to: 3, a: 1, b: 0 },
  ];
  const chorded: Edge[] = [...base, { from: 1, to: 2, a: 0, b: 0 }];

  it('UE cost 1.5 without the chord, 2.0 with it: BR = 4/3', () => {
    const before = frankWolfe(4, base, 0, 3, 1);
    const after = frankWolfe(4, chorded, 0, 3, 1);
    expect(before.cost).toBeCloseTo(1.5, 6);
    expect(after.cost).toBeCloseTo(2.0, 6);
    expect(after.cost / before.cost).toBeCloseTo(4 / 3, 6);
  });

  it('System Optimum of the chorded network stays at 1.5 (PoA = 4/3)', () => {
    // Frank-Wolfe converges sublinearly, so allow ~1e-5 slack.
    const so = systemOptimum(4, chorded, 0, 3, 1);
    expect(so.cost).toBeCloseTo(1.5, 4);
  });
});

describe('solver cross-checks', () => {
  it('spectral Rst matches the CG electrical solve on a 3x5 grid', () => {
    const spec: GridSpec = { m: 3, n: 5, a: 1.7, b: 0.2, q: 1 };
    const gs = new GridSpectral(spec.m, spec.n);
    const RstSpectral = spec.a * gs.quad({ i: 0, j: 0 }, { i: 3, j: 5 }, { i: 0, j: 0 }, { i: 3, j: 5 });
    const net = buildGridNetwork(spec);
    const el = electricalFlow(net.nodeCount, net.edges, net.source, net.sink, 1)!;
    expect(el.phi[net.source] - el.phi[net.sink]).toBeCloseTo(RstSpectral, 9);
  });

  it('grid-chord exact solver agrees with Frank-Wolfe on the flagship cost', () => {
    const sol = solveGridChord(flagshipSpec, flagshipChord);
    const net = buildGridNetwork(flagshipSpec);
    const edges: Edge[] = [
      ...net.edges,
      {
        from: nodeIndex(flagshipSpec, 0, 6),
        to: nodeIndex(flagshipSpec, 4, 4),
        a: 0,
        b: 0,
      },
    ];
    const fw = frankWolfe(net.nodeCount, edges, net.source, net.sink, 1, {
      maxIter: 200000,
      relGapTol: 1e-9,
    });
    // FW is the approximate cross-check; 2e-4 relative agreement suffices.
    expect(Math.abs(fw.cost - sol.CNew) / sol.CNew).toBeLessThan(2e-4);
  });
});

describe('structural theorems', () => {
  it('NE shortcut chords never harm (Cor. 2.15)', () => {
    const spec: GridSpec = { m: 3, n: 4, a: 1, b: 0.9, q: 1 };
    const shortcuts: GridChord[] = [
      { u: { i: 0, j: 0 }, v: { i: 2, j: 3 }, c: 0, d: 0 },
      { u: { i: 1, j: 1 }, v: { i: 3, j: 2 }, c: 0.3, d: 0.1 },
      { u: { i: 0, j: 2 }, v: { i: 3, j: 4 }, c: 0, d: 0.05 },
    ];
    for (const chord of shortcuts) {
      expect(classifyChord(chord.u, chord.v)).toBe('shortcut');
      expect(chordCanHarm(chord.u, chord.v)).toBe(false);
      const sol = solveGridChord(spec, chord);
      expect(sol.BR).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('linear latencies (b = 0) are immune (Lemma 2.2)', () => {
    const spec: GridSpec = { m: 3, n: 4, a: 1, b: 0, q: 1 };
    const chord: GridChord = { u: { i: 0, j: 3 }, v: { i: 3, j: 1 }, c: 0, d: 0 };
    const sol = solveGridChord(spec, chord);
    expect(sol.BR).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('BR stays strictly below 4/3 on harmful flagship-style chords (Thm. 3.1)', () => {
    const sol = solveGridChord(flagshipSpec, flagshipChord);
    expect(sol.BR).toBeLessThan(4 / 3);
  });
});
