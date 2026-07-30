// Message protocol between the UI and the corrected-maximum search worker.

export interface SearchRow {
  m: number;
  n: number;
  u: { i: number; j: number };
  v: { i: number; j: number };
  k: number;
  Vuv: number;
  Ruv: number;
  BRrel: number;
  BR: number;
  zStar: number;
  zbar: number;
  bStar: number;
}

export interface GridSummary {
  m: number;
  n: number;
  bestBR: number;
  solves: number;
  candidates: number;
}

export interface StartMsg {
  type: 'start';
  maxN: number;
  perGridBudget: number;
}

export interface CancelMsg {
  type: 'cancel';
}

export interface ProgressMsg {
  type: 'progress';
  done: number;
  total: number;
  label: string;
  rows: SearchRow[];
  grids: GridSummary[];
  bestBR: number;
  honestSolves: number;
}

export interface DoneMsg {
  type: 'done';
  rows: SearchRow[];
  grids: GridSummary[];
  bestBR: number;
  honestSolves: number;
  cancelled: boolean;
}

export type WorkerIn = StartMsg | CancelMsg;
export type WorkerOut = ProgressMsg | DoneMsg;
