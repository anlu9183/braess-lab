// Uniform affine grid G_{m,n} and the closed-form spectral machinery for its
// Laplacian pseudoinverse (paper §3.2).
//
// Vertices are (i, j) with 0 <= i <= m, 0 <= j <= n, source s = (0,0), sink
// t = (m,n); node index = i * (n+1) + j. Directed edges (i,j)->(i+1,j) and
// (i,j)->(i,j+1). Every grid edge has latency l(x) = a x + b, i.e. resistance
// a in the electrical analogy.
//
// The grid Laplacian is the Kronecker sum L = L_{m+1} (+) L_{n+1}, so its
// eigenpairs are products of path eigenpairs:
//   path on P vertices: lambda_k = 4 sin^2(pi k / 2P),
//   psi_k(i) = sqrt(eps_k / P) cos(pi k (i + 1/2) / P), eps_0 = 1, eps_k = 2.
// All L+ quadratic forms and potential fields below follow from this spectrum
// without ever forming a dense pseudoinverse.

import type { Edge, NetworkDef } from './graph';

export interface GridSpec {
  m: number;
  n: number;
  a: number; // latency slope (= edge resistance), a > 0
  b: number; // latency intercept, b >= 0
  q: number; // total demand s -> t
}

export interface GridCoord {
  i: number;
  j: number;
}

export function nodeIndex(spec: { n: number }, i: number, j: number): number {
  return i * (spec.n + 1) + j;
}

export function nodeCoord(spec: { n: number }, idx: number): GridCoord {
  const N = spec.n + 1;
  return { i: Math.floor(idx / N), j: idx % N };
}

/** Level lambda(v) = i + j; level gain of a chord u->v is lambda(v)-lambda(u). */
export function level(c: GridCoord): number {
  return c.i + c.j;
}

/** Build the directed grid network (edges point toward the sink). */
export function buildGridNetwork(spec: GridSpec): NetworkDef {
  const { m, n, a, b } = spec;
  const edges: Edge[] = [];
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      positions[nodeIndex(spec, i, j)] = { x: j, y: m - i };
    }
  }
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (i < m) edges.push({ from: nodeIndex(spec, i, j), to: nodeIndex(spec, i + 1, j), a, b });
      if (j < n) edges.push({ from: nodeIndex(spec, i, j), to: nodeIndex(spec, i, j + 1), a, b });
    }
  }
  return {
    nodeCount: (m + 1) * (n + 1),
    edges,
    source: nodeIndex(spec, 0, 0),
    sink: nodeIndex(spec, m, n),
    positions,
  };
}

/**
 * Spectral engine for the (m+1) x (n+1) grid graph with UNIT resistances.
 * Physical quantities for resistance-a edges scale by a where noted.
 */
export class GridSpectral {
  readonly m: number;
  readonly n: number;
  private readonly M: number; // m+1 path length (i coordinate)
  private readonly N: number; // n+1 path length (j coordinate)
  private readonly psiM: Float64Array; // psiM[r*M + i]
  private readonly psiN: Float64Array; // psiN[s*N + j]
  private readonly lamM: Float64Array;
  private readonly lamN: Float64Array;

  constructor(m: number, n: number) {
    this.m = m;
    this.n = n;
    const M = (this.M = m + 1);
    const N = (this.N = n + 1);
    this.psiM = GridSpectral.pathEigenvectors(M);
    this.psiN = GridSpectral.pathEigenvectors(N);
    this.lamM = GridSpectral.pathEigenvalues(M);
    this.lamN = GridSpectral.pathEigenvalues(N);
  }

  private static pathEigenvalues(P: number): Float64Array {
    const lam = new Float64Array(P);
    for (let k = 0; k < P; k++) {
      const sn = Math.sin((Math.PI * k) / (2 * P));
      lam[k] = 4 * sn * sn;
    }
    return lam;
  }

  private static pathEigenvectors(P: number): Float64Array {
    const psi = new Float64Array(P * P);
    for (let k = 0; k < P; k++) {
      const norm = Math.sqrt((k === 0 ? 1 : 2) / P);
      for (let i = 0; i < P; i++) {
        psi[k * P + i] = norm * Math.cos((Math.PI * k * (i + 0.5)) / P);
      }
    }
    return psi;
  }

  /**
   * (e_p1 - e_p2)^T L+ (e_p3 - e_p4) for the unit-resistance grid.
   * O(M*N) via the eigen-sum, skipping the (0,0) null mode.
   */
  quad(p1: GridCoord, p2: GridCoord, p3: GridCoord, p4: GridCoord): number {
    const { M, N, psiM, psiN, lamM, lamN } = this;
    let total = 0;
    for (let r = 0; r < M; r++) {
      const a1 = psiM[r * M + p1.i];
      const a2 = psiM[r * M + p2.i];
      const a3 = psiM[r * M + p3.i];
      const a4 = psiM[r * M + p4.i];
      for (let s = 0; s < N; s++) {
        if (r === 0 && s === 0) continue;
        const u = a1 * psiN[s * N + p1.j] - a2 * psiN[s * N + p2.j];
        const v = a3 * psiN[s * N + p3.j] - a4 * psiN[s * N + p4.j];
        total += (u * v) / (lamM[r] + lamN[s]);
      }
    }
    return total;
  }

  /**
   * Potential field phi = L+ (e_plus - e_minus) on the unit-resistance grid,
   * returned as Float64Array indexed by node index i*(n+1)+j.
   * Separable transform: O(M*N*(M+N)) instead of O((MN)^2).
   */
  potentialField(plus: GridCoord, minus: GridCoord): Float64Array {
    const { M, N, psiM, psiN, lamM, lamN } = this;
    // c[r][s] = (Phi_rs(plus) - Phi_rs(minus)) / (lam_r + lam_s)
    const c = new Float64Array(M * N);
    for (let r = 0; r < M; r++) {
      const ap = psiM[r * M + plus.i];
      const am = psiM[r * M + minus.i];
      for (let s = 0; s < N; s++) {
        if (r === 0 && s === 0) continue;
        c[r * N + s] =
          (ap * psiN[s * N + plus.j] - am * psiN[s * N + minus.j]) / (lamM[r] + lamN[s]);
      }
    }
    // D[r][j] = sum_s c[r][s] psiN[s][j]
    const D = new Float64Array(M * N);
    for (let r = 0; r < M; r++) {
      for (let s = 0; s < N; s++) {
        const crs = c[r * N + s];
        if (crs === 0) continue;
        for (let j = 0; j < N; j++) {
          D[r * N + j] += crs * psiN[s * N + j];
        }
      }
    }
    // phi[i][j] = sum_r psiM[r][i] D[r][j]
    const phi = new Float64Array(M * N);
    for (let r = 0; r < M; r++) {
      for (let i = 0; i < M; i++) {
        const w = psiM[r * M + i];
        if (w === 0) continue;
        for (let j = 0; j < N; j++) {
          phi[i * N + j] += w * D[r * N + j];
        }
      }
    }
    return phi;
  }
}

export interface GridChord {
  u: GridCoord;
  v: GridCoord;
  c: number; // latency slope of the chord
  d: number; // latency intercept of the chord
}

/** First-region closed-form quantities for a grid + chord (paper §2.3-2.4, §3.3). */
export interface FirstRegionData {
  Rst: number; // effective resistance s-t (resistance-a edges)
  Ruv: number; // effective resistance u-v
  Vuv: number; // voltage drop u->v in the base grid under demand q
  k: number; // level gain of the chord
  used: boolean; // chord attracts flow iff Vuv + b k > d (Cor. 2.8)
  zel: number; // unconstrained first-region minimizer (V+bk-d)/(R+c)
  zbar: number; // first breakpoint: smallest z at which a road saturates (eq. 13)
  zbarEdge: number; // index (in grid edge order) of the first saturating road
  baseFlows: Float64Array; // x(0): base-grid equilibrium flows (all > 0, Lemma 2.5)
  h: Float64Array; // transfer flow pattern: x(z) = x(0) - z h on the first region
  basePhi: Float64Array; // physical potentials of the base grid (volts, scaled by a)
  chordPhiField: Float64Array; // physical potentials for unit u->v injection
  COld: number; // q^2 Rst + b q (m+n)
}

export function firstRegionData(spec: GridSpec, chord: GridChord, gs?: GridSpectral): FirstRegionData {
  const { m, n, a, b, q } = spec;
  const spectral = gs ?? new GridSpectral(m, n);
  const s = { i: 0, j: 0 };
  const t = { i: m, j: n };
  const { u, v } = chord;

  const Rst = a * spectral.quad(s, t, s, t);
  const Ruv = a * spectral.quad(u, v, u, v);
  const Vuv = q * a * spectral.quad(s, t, u, v);
  const k = level(v) - level(u);

  // Unit-resistance potential fields; flows are resistance-independent.
  const fieldST = spectral.potentialField(s, t); // injection e_s - e_t
  const fieldUV = spectral.potentialField(u, v); // injection e_u - e_v

  const net = buildGridNetwork(spec);
  const E = net.edges.length;
  const baseFlows = new Float64Array(E);
  const h = new Float64Array(E);
  for (let e = 0; e < E; e++) {
    const { from, to } = net.edges[e];
    baseFlows[e] = q * (fieldST[from] - fieldST[to]);
    h[e] = fieldUV[from] - fieldUV[to];
  }

  // First breakpoint (eq. 13): smallest z with x_e(0) - z h_e = 0 over h_e > 0.
  let zbar = Infinity;
  let zbarEdge = -1;
  for (let e = 0; e < E; e++) {
    if (h[e] > 1e-14) {
      const z = baseFlows[e] / h[e];
      if (z < zbar) {
        zbar = z;
        zbarEdge = e;
      }
    }
  }

  const used = Vuv + b * k > chord.d + 1e-15;
  const zel = (Vuv + b * k - chord.d) / (Ruv + chord.c);

  const basePhi = new Float64Array(fieldST.length);
  const chordPhiField = new Float64Array(fieldUV.length);
  for (let w = 0; w < fieldST.length; w++) {
    basePhi[w] = q * a * fieldST[w];
    chordPhiField[w] = a * fieldUV[w];
  }

  const COld = q * q * Rst + b * q * (m + n);

  return { Rst, Ruv, Vuv, k, used, zel, zbar, zbarEdge, baseFlows, h, basePhi, chordPhiField, COld };
}

/**
 * The electrical relaxation of the energy on the full grid:
 * E(z) = q^2 Rst - 2 Vuv z + Ruv z^2 (valid as the true energy only on the
 * first region; a strict lower bound beyond it).
 */
export function relaxedEnergy(fr: FirstRegionData, q: number, z: number): number {
  return q * q * fr.Rst - 2 * fr.Vuv * z + fr.Ruv * z * z;
}
