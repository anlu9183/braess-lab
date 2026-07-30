// Thin Web Worker adapter around the pure search in core/search.ts.

import { runSearch } from '../core/search';
import type { WorkerIn, WorkerOut } from './protocol';

let cancelled = false;

const post = (msg: WorkerOut) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.type === 'start') {
    cancelled = false;
    const result = runSearch({
      maxN: msg.maxN,
      perGridBudget: msg.perGridBudget,
      isCancelled: () => cancelled,
      onGridDone: (done, total, label, rows, grids, bestBR, honestSolves) =>
        post({ type: 'progress', done, total, label, rows, grids, bestBR, honestSolves }),
    });
    post({ type: 'done', ...result });
  }
};
