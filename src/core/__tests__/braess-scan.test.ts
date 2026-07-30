// Leave-one-out Braess scan on free-form networks. The classic Braess
// network is the ground truth: the zero-cost superhighway is the unique
// Braess edge with BR = (C with) / (C without) = 2 / 1.5 = 4/3.

import { expect, it } from 'vitest';
import { BR_EPS, braessEdgeScan } from '../braess';
import type { Edge } from '../graph';

// s=0, A=1, B=2, t=3
const classic: Edge[] = [
  { from: 0, to: 1, a: 1, b: 0 }, // s->A: l = x
  { from: 1, to: 3, a: 0, b: 1 }, // A->t: l = 1
  { from: 0, to: 2, a: 0, b: 1 }, // s->B: l = 1
  { from: 2, to: 3, a: 1, b: 0 }, // B->t: l = x
  { from: 1, to: 2, a: 0, b: 0 }, // the zero-cost superhighway
];

it('flags exactly the classic superhighway with BR = 4/3', () => {
  const scan = braessEdgeScan(4, classic, 0, 3, 1);
  expect(scan).not.toBeNull();
  expect(scan!.C).toBeCloseTo(2, 4);
  // Rows are sorted by BR descending: the chord tops the list.
  expect(scan!.rows[0].edge).toBe(4);
  expect(scan!.rows[0].BR).toBeCloseTo(4 / 3, 3);
  expect(scan!.rows[0].BR).toBeGreaterThan(1 + BR_EPS);
  for (const r of scan!.rows.slice(1)) {
    expect(r.reachable).toBe(true);
    expect(Math.abs(r.BR - 1)).toBeLessThanOrEqual(BR_EPS);
  }
});

it('unused edges skip the re-solve and report BR = 1 exactly', () => {
  // At the chorded UE all flow rides s->A->B->t, so A->t and s->B are idle.
  const scan = braessEdgeScan(4, classic, 0, 3, 1)!;
  const byEdge = new Map(scan.rows.map((r) => [r.edge, r]));
  expect(byEdge.get(1)!.BR).toBe(1);
  expect(byEdge.get(2)!.BR).toBe(1);
  expect(byEdge.get(1)!.CWithout).toBe(scan.C);
});

it('reports an edge whose removal disconnects s from t', () => {
  const scan = braessEdgeScan(2, [{ from: 0, to: 1, a: 1, b: 1 }], 0, 1, 1)!;
  expect(scan.rows).toHaveLength(1);
  expect(scan.rows[0].reachable).toBe(false);
});

it('returns null when the sink is unreachable to begin with', () => {
  expect(braessEdgeScan(2, [], 0, 1, 1)).toBeNull();
});
