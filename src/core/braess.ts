// Braess analytics: chord classification (Thm. 2.12), the electrical
// relaxation ratio BR_rel (the relaxation upper bound, Thm. 2.11), the honest orientation-constrained
// Braess ratio via the exact solver, and a leave-one-out edge scan for
// free-form networks.

import { GridSpectral, type GridChord, type GridCoord, type GridSpec } from './grid';
import { frankWolfe, solveGridChord, solveGridChordSO, type GridChordEquilibrium } from './equilibrium';
import type { Edge } from './graph';

export type ChordClass =
  | 'shortcut' // i' >= i and j' >= j: provably harmless (Thm. 2.12)
  | 'SE' // one coordinate up, the other down: the harmful candidates
  | 'NW'
  | 'reverse'; // i' <= i and j' <= j (k <= 0 or backwards): no effect / harmless

export function classifyChord(u: GridCoord, v: GridCoord): ChordClass {
  const di = v.i - u.i;
  const dj = v.j - u.j;
  if (di >= 0 && dj >= 0) return 'shortcut';
  if (di <= 0 && dj <= 0) return 'reverse';
  // Anti-diagonal: with i drawn southward, di > 0, dj < 0 is "SE".
  return di > 0 ? 'SE' : 'NW';
}

/** Can this chord possibly induce the paradox? (necessary conditions only) */
export function chordCanHarm(u: GridCoord, v: GridCoord): boolean {
  const cls = classifyChord(u, v);
  const k = v.i + v.j - (u.i + u.j);
  return (cls === 'SE' || cls === 'NW') && k > 0;
}

/**
 * The electrical-relaxation ratio (Thm. 2.11): worst case over first-region
 * parameters (c = d = 0, b k = q Ruv - Vuv), an upper bound on the honest BR.
 *   BR_rel = 1 + (-Vuv k) / (q k Rst + (m+n) q Ruv - (m+n) Vuv).
 */
export function relaxedBraessRatio(
  spec: Pick<GridSpec, 'm' | 'n' | 'q'>,
  Rst: number,
  Ruv: number,
  Vuv: number,
  k: number,
): number {
  if (Vuv >= 0 || k <= 0) return 1;
  const mn = spec.m + spec.n;
  return 1 + (-Vuv * k) / (spec.q * k * Rst + mn * spec.q * Ruv - mn * Vuv);
}

export interface ChordAnalysis {
  equilibrium: GridChordEquilibrium;
  cls: ChordClass;
  BRrel: number; // relaxation ratio at the worst-case parameters (Thm. 2.11)
  bStar: number; // the b that attains BR_rel: (q Ruv - Vuv) / k
  CSO: number;
  PoA: number; // price of anarchy of the augmented network
}

/**
 * Frank–Wolfe converges sublinearly, so BR values computed from it carry
 * ~1e-4 relative noise; only excesses above this count as a paradox.
 */
export const BR_EPS = 1e-4;

export interface EdgeScanRow {
  edge: number; // index into the edges array passed to the scan
  /** false: removing this edge disconnects s from t (it is the only route). */
  reachable: boolean;
  CWithout: number;
  BR: number; // C(with edge) / C(without edge); > 1 means Braess
}

export interface EdgeScan {
  C: number; // UE cost of the full network
  rows: EdgeScanRow[]; // sorted by BR descending; disconnecting edges last
}

/**
 * Leave-one-out Braess scan of an arbitrary network: re-solve the user
 * equilibrium without each edge in turn and report BR(e) = C / C(G - e).
 * Edges carrying no flow at equilibrium are BR = 1 exactly (removing an
 * unused road cannot move the equilibrium), so they skip the re-solve.
 */
export function braessEdgeScan(
  nodeCount: number,
  edges: Edge[],
  source: number,
  sink: number,
  q: number,
  opts: { maxIter?: number } = {},
): EdgeScan | null {
  const maxIter = opts.maxIter ?? 60000;
  const full = frankWolfe(nodeCount, edges, source, sink, q, { maxIter });
  if (!full.reachable) return null;
  const rows: EdgeScanRow[] = edges.map((_, i) => {
    if (Math.abs(full.flows[i]) < 1e-12) {
      return { edge: i, reachable: true, CWithout: full.cost, BR: 1 };
    }
    const rest = edges.filter((_, j) => j !== i);
    const r = frankWolfe(nodeCount, rest, source, sink, q, { maxIter });
    return r.reachable
      ? { edge: i, reachable: true, CWithout: r.cost, BR: full.cost / r.cost }
      : { edge: i, reachable: false, CWithout: Infinity, BR: 0 };
  });
  rows.sort((r1, r2) => r2.BR - r1.BR);
  return { C: full.cost, rows };
}

/** Full analysis of one chord on a uniform affine grid. */
export function analyzeChord(spec: GridSpec, chord: GridChord, gs?: GridSpectral): ChordAnalysis {
  const equilibrium = solveGridChord(spec, chord, gs);
  const { Rst, Ruv, Vuv, k } = equilibrium.fr;
  const cls = classifyChord(chord.u, chord.v);
  const BRrel = relaxedBraessRatio(spec, Rst, Ruv, Vuv, k);
  const bStar = k > 0 ? (spec.q * Ruv - Vuv) / k : NaN;
  const { CSO } = solveGridChordSO(spec, chord);
  return { equilibrium, cls, BRrel, bStar, CSO, PoA: equilibrium.CNew / CSO };
}
