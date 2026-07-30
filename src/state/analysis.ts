// Glue between the core solvers and the UI: one memoizable analysis bundle
// per (spec, chord, switch) configuration, plus curve sampling for the plots.

import { analyzeChord, type ChordAnalysis } from '../core/braess';
import { makeEarrowEvaluator, solveGridChord } from '../core/equilibrium';
import {
  buildGridNetwork,
  relaxedEnergy,
  type GridChord,
  type GridSpec,
} from '../core/grid';
import type { NetworkDef } from '../core/graph';

export interface GridAnalysisBundle {
  net: NetworkDef;
  analysis: ChordAnalysis;
  /** Signed flows of the electrical relaxation at its own optimizer z_rel. */
  relaxFlows: Float64Array;
  zRel: number;
}

/** The switch-open configuration is the same chord priced out of the market. */
export function effectiveChord(chord: GridChord, chordOn: boolean): GridChord {
  return chordOn ? chord : { ...chord, d: 1e15 };
}

export function computeGridAnalysis(
  spec: GridSpec,
  chord: GridChord,
  chordOn: boolean,
): GridAnalysisBundle {
  const net = buildGridNetwork(spec);
  const analysis = analyzeChord(spec, effectiveChord(chord, chordOn));
  const fr = analysis.equilibrium.fr;
  // Electrical relaxation: unconstrained current with the chord at its own
  // (first-region formula) optimizer, clamped to [0, q]. Beyond zbar this
  // pattern reverses roads — exactly the infeasibility the paper corrects.
  const zRel = chordOn && fr.used ? Math.min(Math.max(fr.zel, 0), spec.q) : 0;
  const relaxFlows = new Float64Array(fr.baseFlows.length);
  for (let e = 0; e < relaxFlows.length; e++) {
    relaxFlows[e] = fr.baseFlows[e] - zRel * fr.h[e];
  }
  return { net, analysis, relaxFlows, zRel };
}

export interface CurveSamples {
  zs: number[];
  Earrow: number[]; // honest orientation-constrained energy
  Erelax: number[]; // electrical lower bound
  Psi: number[]; // reduced Beckmann potential
  Delta: number[]; // directed voltage drop u->v (physical)
  DeltaBound: number[]; // Vuv - Ruv z (Lemma 2.13)
  integralDelta: number; // ∫0^{z*} Delta dr (trapezoid)
  DeltaStar: number; // c z* + d - b k (stationarity)
}

export function sampleCurves(
  spec: GridSpec,
  chord: GridChord,
  zStar: number,
  count = 40,
): CurveSamples {
  const { m, n, b, q } = spec;
  const sol = solveGridChord(spec, chord);
  const fr = sol.fr;
  const evalE = makeEarrowEvaluator(spec, chord);
  const uIdx = chord.u.i * (n + 1) + chord.u.j;
  const vIdx = chord.v.i * (n + 1) + chord.v.j;

  const zs: number[] = [];
  for (let i = 0; i <= count; i++) zs.push((q * i) / count);
  // Make sure the interesting points are sampled exactly.
  for (const extra of [fr.zbar, zStar]) {
    if (extra > 0 && extra < q) zs.push(extra);
  }
  zs.sort((x, y) => x - y);

  const Earrow: number[] = [];
  const Erelax: number[] = [];
  const Psi: number[] = [];
  const Delta: number[] = [];
  const DeltaBound: number[] = [];
  for (const z of zs) {
    const s = evalE(z);
    Earrow.push(s.E);
    Erelax.push(relaxedEnergy(fr, q, z));
    Psi.push(0.5 * s.E + b * (q * (m + n) - fr.k * z) + 0.5 * chord.c * z * z + chord.d * z);
    Delta.push(s.phiPhysical[uIdx] - s.phiPhysical[vIdx]);
    DeltaBound.push(fr.Vuv - fr.Ruv * z);
  }

  // Trapezoid integral of Delta over [0, z*].
  let integral = 0;
  for (let i = 1; i < zs.length; i++) {
    if (zs[i] > zStar + 1e-15) break;
    integral += ((Delta[i] + Delta[i - 1]) / 2) * (zs[i] - zs[i - 1]);
  }
  const DeltaStar = chord.c * zStar + chord.d - b * fr.k;

  return { zs, Earrow, Erelax, Psi, Delta, DeltaBound, integralDelta: integral, DeltaStar };
}
