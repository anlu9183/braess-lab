// Orientation-constrained energy minimization (paper eq. (1)):
//
//   min ||x||^2  subject to  B x = p,  x >= 0
//
// solved by a primal active-set method in the style of Lawson-Hanson NNLS.
// On the passive set P the equality-constrained optimum is the electrical
// flow of the unit-resistance subgraph: solve L_P phi = p, x = B_P^T phi.
// KKT for a zeroed edge i->j is phi_i - phi_j <= 0 (no forward voltage drop);
// violated edges re-enter P, blocking edges leave it one at a time along a
// feasible interpolation. This is exactly the active-set continuation of
// the paper's directed energy (Thm. 2.7), at a fixed chord flow z.

import { solveLaplacian, type WeightedEdge } from './laplacian';

export interface DirectedEdgeRef {
  from: number;
  to: number;
}

export interface QPResult {
  x: Float64Array;
  /** Potentials of the final active subgraph (unit resistance). */
  phi: Float64Array;
  passive: Uint8Array;
  outerIterations: number;
  converged: boolean;
}

export function minNormNonnegFlow(
  nodeCount: number,
  edges: DirectedEdgeRef[],
  p: Float64Array,
  xInit: Float64Array,
  opts: { passiveInit?: Uint8Array; tol?: number; maxOuter?: number } = {},
): QPResult | null {
  const E = edges.length;
  const tol = opts.tol ?? 1e-12;
  const maxOuter = opts.maxOuter ?? 60 + 12 * E;

  const x = Float64Array.from(xInit);
  const passive = new Uint8Array(E);
  if (opts.passiveInit) {
    passive.set(opts.passiveInit);
    for (let e = 0; e < E; e++) if (x[e] > 0) passive[e] = 1;
  } else {
    passive.fill(1); // Lemma 2.5: at z = 0 the whole grid is active
  }

  let phi: Float64Array | null = null;
  let phiPrev: Float64Array | undefined;
  const y = new Float64Array(E);
  let outer = 0;
  let converged = false;

  while (outer < maxOuter) {
    outer++;

    const passiveEdges: WeightedEdge[] = [];
    for (let e = 0; e < E; e++) {
      if (passive[e]) passiveEdges.push({ from: edges[e].from, to: edges[e].to, w: 1 });
    }
    const solve = solveLaplacian(nodeCount, passiveEdges, p, { tol: 1e-13, phi0: phiPrev });
    if (solve === null) {
      // The passive subgraph cannot route p (a deletion disconnected it).
      // Reopen every edge; the injection is balanced on the full network.
      if (passive.every((v) => v === 1)) return null; // truly infeasible
      passive.fill(1);
      phiPrev = undefined;
      continue;
    }
    phi = solve.phi;
    phiPrev = phi;

    // Equality-constrained optimum on the passive set.
    let minY = 0;
    for (let e = 0; e < E; e++) {
      y[e] = passive[e] ? phi[edges[e].from] - phi[edges[e].to] : 0;
      if (passive[e] && y[e] < minY) minY = y[e];
    }

    if (minY >= -tol) {
      // Feasible on P: accept, then check duals of the zeroed edges.
      for (let e = 0; e < E; e++) x[e] = passive[e] ? Math.max(y[e], 0) : 0;
      let worst = tol;
      let worstEdge = -1;
      for (let e = 0; e < E; e++) {
        if (!passive[e]) {
          const viol = phi[edges[e].from] - phi[edges[e].to];
          if (viol > worst) {
            worst = viol;
            worstEdge = e;
          }
        }
      }
      if (worstEdge < 0) {
        converged = true;
        break;
      }
      passive[worstEdge] = 1;
      continue;
    }

    // Move from the feasible x toward y until the first passive edge hits zero.
    let t = 1;
    let blocker = -1;
    for (let e = 0; e < E; e++) {
      if (passive[e] && y[e] < -tol) {
        const te = x[e] / Math.max(x[e] - y[e], 1e-300);
        if (te < t) {
          t = te;
          blocker = e;
        }
      }
    }
    if (blocker < 0) {
      // Should not happen (minY < -tol guarantees a blocker); accept clipped.
      for (let e = 0; e < E; e++) x[e] = passive[e] ? Math.max(y[e], 0) : 0;
      converged = true;
      break;
    }
    for (let e = 0; e < E; e++) {
      if (passive[e]) x[e] = Math.max(x[e] + t * (y[e] - x[e]), 0);
    }
    x[blocker] = 0;
    passive[blocker] = 0;
  }

  if (!phi) return null;
  return { x, phi, passive, outerIterations: outer, converged };
}
