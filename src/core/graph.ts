// Network model shared by all solvers.
//
// A directed edge from -> to carries flow x >= 0 with affine latency
// l(x) = a x + b  (a >= 0, b >= 0).

export interface Edge {
  from: number;
  to: number;
  a: number;
  b: number;
  /** Chords are user-added shortcut edges, rendered and toggled separately. */
  isChord?: boolean;
  enabled?: boolean;
}

export interface NetworkDef {
  nodeCount: number;
  edges: Edge[];
  source: number;
  sink: number;
  /** Layout positions for rendering (arbitrary units). */
  positions: Array<{ x: number; y: number }>;
}

export function activeEdges(net: NetworkDef): Edge[] {
  return net.edges.filter((e) => e.enabled !== false);
}

/** Total system travel time C(f) = sum x_e * l_e(x_e) for given edge flows. */
export function totalCost(edges: Edge[], flows: ArrayLike<number>): number {
  let c = 0;
  for (let e = 0; e < edges.length; e++) {
    const x = flows[e];
    c += x * (edges[e].a * x + edges[e].b);
  }
  return c;
}
