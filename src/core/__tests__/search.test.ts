// The corrected-maximum search: structural invariants on a small sweep.

import { describe, expect, it } from 'vitest';
import { runSearch } from '../search';

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
});
