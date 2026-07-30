// Sparse graph-Laplacian linear algebra for arbitrary networks: connected
// components, and a Jacobi-preconditioned conjugate-gradient solve of
// L phi = p (L singular; solvable iff p sums to zero on every component).

export interface WeightedEdge {
  from: number;
  to: number;
  w: number;
}

export function connectedComponents(nodeCount: number, edges: WeightedEdge[]): Int32Array {
  const parent = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  for (const e of edges) {
    const ra = find(e.from);
    const rb = find(e.to);
    if (ra !== rb) parent[ra] = rb;
  }
  const comp = new Int32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) comp[i] = find(i);
  return comp;
}

export interface LaplacianSolveResult {
  phi: Float64Array;
  iterations: number;
  residual: number;
}

/**
 * Solve L phi = p by preconditioned CG, where L is the weighted Laplacian of
 * the given edges. Returns null if p is not balanced on some connected
 * component (system infeasible). phi is normalized to mean zero per component.
 */
export function solveLaplacian(
  nodeCount: number,
  edges: WeightedEdge[],
  p: Float64Array,
  opts: { tol?: number; maxIter?: number; phi0?: Float64Array } = {},
): LaplacianSolveResult | null {
  const tol = opts.tol ?? 1e-13;
  const maxIter = opts.maxIter ?? Math.max(500, 8 * nodeCount);

  const comp = connectedComponents(nodeCount, edges);
  const compSum = new Map<number, number>();
  const compCount = new Map<number, number>();
  let pScale = 0;
  for (let i = 0; i < nodeCount; i++) {
    compSum.set(comp[i], (compSum.get(comp[i]) ?? 0) + p[i]);
    compCount.set(comp[i], (compCount.get(comp[i]) ?? 0) + 1);
    pScale += Math.abs(p[i]);
  }
  for (const [, s] of compSum) {
    if (Math.abs(s) > 1e-9 * (pScale + 1)) return null;
  }

  const deg = new Float64Array(nodeCount);
  for (const e of edges) {
    deg[e.from] += e.w;
    deg[e.to] += e.w;
  }
  // Isolated nodes must carry zero injection (checked above per component).

  const applyL = (x: Float64Array, out: Float64Array) => {
    out.fill(0);
    for (const e of edges) {
      const d = e.w * (x[e.from] - x[e.to]);
      out[e.from] += d;
      out[e.to] -= d;
    }
  };

  const projectNull = (x: Float64Array) => {
    // Remove per-component means so iterates stay orthogonal to the nullspace.
    const sums = new Map<number, number>();
    for (let i = 0; i < nodeCount; i++) sums.set(comp[i], (sums.get(comp[i]) ?? 0) + x[i]);
    for (let i = 0; i < nodeCount; i++) {
      x[i] -= (sums.get(comp[i]) ?? 0) / (compCount.get(comp[i]) ?? 1);
    }
  };

  const phi = new Float64Array(nodeCount);
  if (opts.phi0) phi.set(opts.phi0);
  projectNull(phi);

  const r = new Float64Array(nodeCount);
  const z = new Float64Array(nodeCount);
  const q = new Float64Array(nodeCount);
  const d = new Float64Array(nodeCount);

  applyL(phi, r);
  for (let i = 0; i < nodeCount; i++) r[i] = p[i] - r[i];
  projectNull(r);

  const precond = (src: Float64Array, dst: Float64Array) => {
    for (let i = 0; i < nodeCount; i++) dst[i] = deg[i] > 0 ? src[i] / deg[i] : 0;
  };

  precond(r, z);
  d.set(z);
  let rz = 0;
  for (let i = 0; i < nodeCount; i++) rz += r[i] * z[i];

  let rNorm = Math.sqrt(r.reduce((s, v) => s + v * v, 0));
  const bNorm = Math.max(Math.sqrt(p.reduce((s, v) => s + v * v, 0)), 1e-300);
  let iter = 0;

  while (rNorm / bNorm > tol && iter < maxIter) {
    applyL(d, q);
    let dq = 0;
    for (let i = 0; i < nodeCount; i++) dq += d[i] * q[i];
    if (dq <= 0) break; // d in the nullspace (numerically); converged enough
    const alpha = rz / dq;
    for (let i = 0; i < nodeCount; i++) {
      phi[i] += alpha * d[i];
      r[i] -= alpha * q[i];
    }
    if (iter % 50 === 49) projectNull(r);
    precond(r, z);
    let rzNew = 0;
    for (let i = 0; i < nodeCount; i++) rzNew += r[i] * z[i];
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < nodeCount; i++) d[i] = z[i] + beta * d[i];
    rNorm = Math.sqrt(r.reduce((s, v) => s + v * v, 0));
    iter++;
  }

  projectNull(phi);
  return { phi, iterations: iter, residual: rNorm / bNorm };
}
