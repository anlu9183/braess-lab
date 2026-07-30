// User-Equilibrium solvers.
//
// 1. solveGridChord: exact equilibrium of the uniform affine grid plus one
//    chord, via the paper's reduction: the reduced Beckmann potential
//      Psi(z) = 1/2 E->(z) + b (q(m+n) - k z) + c/2 z^2 + d z      (eq. 3)
//    is strictly convex in the chord flow z; E->(z) is evaluated exactly by
//    the orientation-constrained QP (qp.ts) and Psi is minimized on [0, q].
//    Inside the first region everything is closed-form (spectral, grid.ts).
//
// 2. frankWolfe: Beckmann minimization on an arbitrary directed network with
//    affine latencies, by Frank-Wolfe with exact line search (each step is a
//    shortest-path all-or-nothing assignment). Handles a_e = 0 edges, used
//    for free-form networks and as a cross-check.
//
// 3. electricalFlow: the unconstrained resistor current (signed), for the
//    relaxation overlay.

import type { Edge } from './graph';
import {
  buildGridNetwork,
  firstRegionData,
  nodeIndex,
  relaxedEnergy,
  GridSpectral,
  type FirstRegionData,
  type GridChord,
  type GridSpec,
} from './grid';
import { minNormNonnegFlow } from './qp';
import { solveLaplacian, type WeightedEdge } from './laplacian';

// ---------------------------------------------------------------------------
// Grid + chord: exact solver
// ---------------------------------------------------------------------------

export interface GridChordEquilibrium {
  fr: FirstRegionData;
  zStar: number;
  /** Grid edge flows at z*, in buildGridNetwork edge order. */
  flows: Float64Array;
  /** Physical node potentials at z* (voltage, resistance-a edges). */
  phi: Float64Array;
  /** Orientation-constrained energy E->(z*) = a ||x||^2. */
  Earrow: number;
  CNew: number;
  COld: number;
  BR: number;
  region: 'unused' | 'first-region' | 'beyond-breakpoint';
  converged: boolean;
}

/** Injection p(z) = q(e_s - e_t) - z(e_u - e_v). */
function injection(spec: GridSpec, chord: GridChord, z: number): Float64Array {
  const p = new Float64Array((spec.m + 1) * (spec.n + 1));
  p[nodeIndex(spec, 0, 0)] += spec.q;
  p[nodeIndex(spec, spec.m, spec.n)] -= spec.q;
  p[nodeIndex(spec, chord.u.i, chord.u.j)] -= z;
  p[nodeIndex(spec, chord.v.i, chord.v.j)] += z;
  return p;
}

/**
 * A feasible nonnegative grid flow for p(z): route q-z along a monotone s->t
 * path, z along s->u, and z along v->t (the feasibility argument of Thm 2.7).
 */
function feasibleInit(
  spec: GridSpec,
  chord: GridChord,
  z: number,
  edgeIndex: Map<number, number>,
  edgeCount: number,
): Float64Array {
  const x = new Float64Array(edgeCount);
  const key = (from: number, to: number) => from * 1_000_003 + to;
  const addPath = (i0: number, j0: number, i1: number, j1: number, amount: number) => {
    // March i first, then j (both nondecreasing: valid directed grid moves).
    let i = i0;
    let j = j0;
    while (i < i1) {
      x[edgeIndex.get(key(nodeIndex(spec, i, j), nodeIndex(spec, i + 1, j)))!] += amount;
      i++;
    }
    while (j < j1) {
      x[edgeIndex.get(key(nodeIndex(spec, i, j), nodeIndex(spec, i, j + 1)))!] += amount;
      j++;
    }
  };
  addPath(0, 0, spec.m, spec.n, spec.q - z);
  if (z > 0) {
    addPath(0, 0, chord.u.i, chord.u.j, z);
    addPath(chord.v.i, chord.v.j, spec.m, spec.n, z);
  }
  return x;
}

export interface EarrowSample {
  z: number;
  E: number; // E->(z), physical (includes factor a)
  x: Float64Array;
  phiPhysical: Float64Array;
  passive: Uint8Array;
}

/** Exact evaluator for E->(z) on a given grid+chord; caches active sets across calls. */
export function makeEarrowEvaluator(spec: GridSpec, chord: GridChord) {
  const net = buildGridNetwork(spec);
  const E = net.edges.length;
  const edgeIndex = new Map<number, number>();
  for (let e = 0; e < E; e++) {
    edgeIndex.set(net.edges[e].from * 1_000_003 + net.edges[e].to, e);
  }
  const refs = net.edges.map((e) => ({ from: e.from, to: e.to }));
  let lastPassive: Uint8Array | undefined;

  return (z: number): EarrowSample => {
    const p = injection(spec, chord, z);
    const xInit = feasibleInit(spec, chord, z, edgeIndex, E);
    const res = minNormNonnegFlow(net.nodeCount, refs, p, xInit, { passiveInit: lastPassive });
    if (!res || !res.converged) {
      // Retry cold (full passive set) before giving up.
      const retry = minNormNonnegFlow(net.nodeCount, refs, p, xInit, {});
      if (!retry) throw new Error(`orientation-constrained QP infeasible at z=${z}`);
      lastPassive = Uint8Array.from(retry.passive);
      return finish(z, retry.x, retry.phi, retry.passive);
    }
    lastPassive = Uint8Array.from(res.passive);
    return finish(z, res.x, res.phi, res.passive);
  };

  function finish(z: number, x: Float64Array, phiUnit: Float64Array, passive: Uint8Array): EarrowSample {
    let norm2 = 0;
    for (let e = 0; e < E; e++) norm2 += x[e] * x[e];
    const phiPhysical = new Float64Array(phiUnit.length);
    for (let i = 0; i < phiUnit.length; i++) phiPhysical[i] = spec.a * phiUnit[i];
    return { z, E: spec.a * norm2, x, phiPhysical, passive };
  }
}

export function solveGridChord(
  spec: GridSpec,
  chord: GridChord,
  gs?: GridSpectral,
): GridChordEquilibrium {
  const { m, n, b, q } = spec;
  const fr = firstRegionData(spec, chord, gs);
  const k = fr.k;

  const costAt = (z: number, Earrow: number) =>
    Earrow + b * (q * (m + n) - k * z) + chord.c * z * z + chord.d * z;

  if (!fr.used) {
    return {
      fr,
      zStar: 0,
      flows: Float64Array.from(fr.baseFlows),
      phi: Float64Array.from(fr.basePhi),
      Earrow: q * q * fr.Rst,
      CNew: fr.COld,
      COld: fr.COld,
      BR: 1,
      region: 'unused',
      converged: true,
    };
  }

  const zcap = Math.min(q, fr.zbar);
  if (fr.zel <= zcap || q <= fr.zbar) {
    // Equilibrium stays inside the first region: closed form (Cor. 2.9 i/ii).
    const zStar = Math.min(fr.zel, q);
    const Earrow = relaxedEnergy(fr, q, zStar);
    const flows = new Float64Array(fr.baseFlows.length);
    for (let e = 0; e < flows.length; e++) flows[e] = fr.baseFlows[e] - zStar * fr.h[e];
    const phi = new Float64Array(fr.basePhi.length);
    for (let i = 0; i < phi.length; i++) phi[i] = fr.basePhi[i] - zStar * fr.chordPhiField[i];
    const CNew = costAt(zStar, Earrow);
    return {
      fr,
      zStar,
      flows,
      phi,
      Earrow,
      CNew,
      COld: fr.COld,
      BR: CNew / fr.COld,
      region: 'first-region',
      converged: true,
    };
  }

  // Beyond the breakpoint (Cor. 2.9 iii): minimize the strictly convex
  // Psi(z) = 1/2 E->(z) + b(q(m+n) - kz) + c/2 z^2 + d z by golden section
  // on [z_lo, q], evaluating E-> exactly with the constrained QP.
  const evalE = makeEarrowEvaluator(spec, chord);
  const psi = (z: number) =>
    0.5 * evalE(z).E + b * (q * (m + n) - k * z) + 0.5 * chord.c * z * z + chord.d * z;

  let lo = Math.max(0, Math.min(fr.zbar, q) * 0.999);
  let hi = q;
  const invPhi = (Math.sqrt(5) - 1) / 2;
  let c1 = hi - invPhi * (hi - lo);
  let c2 = lo + invPhi * (hi - lo);
  let f1 = psi(c1);
  let f2 = psi(c2);
  for (let it = 0; it < 90 && hi - lo > 1e-14 * Math.max(q, 1); it++) {
    if (f1 <= f2) {
      hi = c2;
      c2 = c1;
      f2 = f1;
      c1 = hi - invPhi * (hi - lo);
      f1 = psi(c1);
    } else {
      lo = c1;
      c1 = c2;
      f1 = f2;
      c2 = lo + invPhi * (hi - lo);
      f2 = psi(c2);
    }
  }
  const zStar = (lo + hi) / 2;
  const final = evalE(zStar);
  const CNew = costAt(zStar, final.E);
  return {
    fr,
    zStar,
    flows: final.x,
    phi: final.phiPhysical,
    Earrow: final.E,
    CNew,
    COld: fr.COld,
    BR: CNew / fr.COld,
    region: 'beyond-breakpoint',
    converged: true,
  };
}

/**
 * System Optimum of the grid + chord via the marginal-cost transform
 * (affine: doubled slopes), evaluated at the ORIGINAL latencies.
 */
export function solveGridChordSO(spec: GridSpec, chord: GridChord): { CSO: number; zSO: number; flows: Float64Array } {
  const so = solveGridChord({ ...spec, a: 2 * spec.a }, { ...chord, c: 2 * chord.c });
  let CSO = chord.c * so.zStar * so.zStar + chord.d * so.zStar;
  for (let e = 0; e < so.flows.length; e++) {
    const x = so.flows[e];
    CSO += x * (spec.a * x + spec.b);
  }
  return { CSO, zSO: so.zStar, flows: so.flows };
}

// ---------------------------------------------------------------------------
// Frank-Wolfe for arbitrary networks
// ---------------------------------------------------------------------------

interface AdjEntry {
  to: number;
  edge: number;
}

function dijkstra(
  nodeCount: number,
  adj: AdjEntry[][],
  weights: Float64Array,
  source: number,
): { dist: Float64Array; prevEdge: Int32Array } {
  const dist = new Float64Array(nodeCount).fill(Infinity);
  const prevEdge = new Int32Array(nodeCount).fill(-1);
  dist[source] = 0;
  // Binary heap of [dist, node]
  const heap: number[] = [source];
  const hd: number[] = [0];
  const swap = (i: number, j: number) => {
    [heap[i], heap[j]] = [heap[j], heap[i]];
    [hd[i], hd[j]] = [hd[j], hd[i]];
  };
  const push = (node: number, d: number) => {
    heap.push(node);
    hd.push(d);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (hd[parent] <= hd[i]) break;
      swap(i, parent);
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], hd[0]];
    const last = heap.pop()!;
    const lastD = hd.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      hd[0] = lastD;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < heap.length && hd[l] < hd[smallest]) smallest = l;
        if (r < heap.length && hd[r] < hd[smallest]) smallest = r;
        if (smallest === i) break;
        swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const [node, d] = pop();
    if (d > dist[node]) continue;
    for (const { to, edge } of adj[node]) {
      const nd = d + weights[edge];
      if (nd < dist[to]) {
        dist[to] = nd;
        prevEdge[to] = edge;
        push(to, nd);
      }
    }
  }
  return { dist, prevEdge };
}

export interface FWResult {
  flows: Float64Array;
  cost: number; // total travel time sum x l(x)
  tau: number; // equilibrium route time (shortest-path time at equilibrium)
  relGap: number;
  iterations: number;
  reachable: boolean;
}

export function frankWolfe(
  nodeCount: number,
  edges: Edge[],
  source: number,
  sink: number,
  q: number,
  opts: { maxIter?: number; relGapTol?: number } = {},
): FWResult {
  const maxIter = opts.maxIter ?? 20000;
  const tol = opts.relGapTol ?? 1e-10;
  const E = edges.length;

  const adj: AdjEntry[][] = Array.from({ length: nodeCount }, () => []);
  for (let e = 0; e < E; e++) adj[edges[e].from].push({ to: edges[e].to, edge: e });

  const weights = new Float64Array(E);
  const x = new Float64Array(E);
  const y = new Float64Array(E);

  const updateWeights = () => {
    for (let e = 0; e < E; e++) weights[e] = edges[e].a * x[e] + edges[e].b;
  };

  const assignAON = (target: Float64Array): number => {
    updateWeights();
    const { dist, prevEdge } = dijkstra(nodeCount, adj, weights, source);
    if (!isFinite(dist[sink])) return Infinity;
    target.fill(0);
    let node = sink;
    while (node !== source) {
      const e = prevEdge[node];
      target[e] += q;
      node = edges[e].from;
    }
    return dist[sink];
  };

  // Initial all-or-nothing assignment at zero flow.
  let sp = assignAON(y);
  if (!isFinite(sp)) {
    return { flows: x, cost: 0, tau: Infinity, relGap: Infinity, iterations: 0, reachable: false };
  }
  x.set(y);

  let relGap = Infinity;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    sp = assignAON(y);
    let currentCost = 0;
    let dirDeriv = 0; // sum l_e(x) (y_e - x_e)
    let curvature = 0; // sum a_e (y_e - x_e)^2
    for (let e = 0; e < E; e++) {
      const l = weights[e];
      currentCost += l * x[e];
      const delta = y[e] - x[e];
      dirDeriv += l * delta;
      curvature += edges[e].a * delta * delta;
    }
    relGap = currentCost > 0 ? -dirDeriv / currentCost : 0;
    if (relGap < tol) break;
    let gamma: number;
    if (curvature > 1e-300) {
      gamma = Math.min(1, Math.max(0, -dirDeriv / curvature));
    } else {
      gamma = dirDeriv < 0 ? 1 : 0;
    }
    if (gamma === 0) break;
    for (let e = 0; e < E; e++) x[e] += gamma * (y[e] - x[e]);
  }

  updateWeights();
  let cost = 0;
  for (let e = 0; e < E; e++) cost += weights[e] * x[e];
  const { dist } = dijkstra(nodeCount, adj, weights, source);
  return { flows: x, cost, tau: dist[sink], relGap, iterations: iter, reachable: true };
}

/** System Optimum for an arbitrary affine network (marginal-cost transform). */
export function systemOptimum(
  nodeCount: number,
  edges: Edge[],
  source: number,
  sink: number,
  q: number,
  opts: { maxIter?: number; relGapTol?: number } = {},
): FWResult {
  const marginal = edges.map((e) => ({ ...e, a: 2 * e.a }));
  const res = frankWolfe(nodeCount, marginal, source, sink, q, opts);
  // Re-price at the original latencies.
  let cost = 0;
  for (let e = 0; e < edges.length; e++) {
    const x = res.flows[e];
    cost += x * (edges[e].a * x + edges[e].b);
  }
  return { ...res, cost };
}

// ---------------------------------------------------------------------------
// Unconstrained electrical flow (the relaxation overlay)
// ---------------------------------------------------------------------------

/**
 * Signed resistor current with resistance a_e per edge and q units injected
 * s -> t. Returns null if some a_e <= 0 (superconducting edge) or s,t are
 * disconnected. Flows may be negative: that is the point of the overlay.
 */
export function electricalFlow(
  nodeCount: number,
  edges: Edge[],
  source: number,
  sink: number,
  q: number,
): { flows: Float64Array; phi: Float64Array } | null {
  const wedges: WeightedEdge[] = [];
  for (const e of edges) {
    if (e.a <= 0) return null;
    wedges.push({ from: e.from, to: e.to, w: 1 / e.a });
  }
  const p = new Float64Array(nodeCount);
  p[source] += q;
  p[sink] -= q;
  const res = solveLaplacian(nodeCount, wedges, p);
  if (!res) return null;
  const flows = new Float64Array(edges.length);
  for (let e = 0; e < edges.length; e++) {
    flows[e] = (res.phi[edges[e].from] - res.phi[edges[e].to]) / edges[e].a;
  }
  return { flows, phi: res.phi };
}
