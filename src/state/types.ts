import type { NetworkDef } from '../core/graph';
import type { GridChord, GridSpec } from '../core/grid';

export type Mode = 'grid' | 'freeform';
export type ViewMode = 'equilibrium' | 'electrical';

export interface SandboxState {
  mode: Mode;
  /** Grid mode */
  spec: GridSpec;
  chord: GridChord;
  chordOn: boolean;
  view: ViewMode;
  lens: boolean;
  lensU: { i: number; j: number } | null;
  /** Free-form mode */
  freeform: NetworkDef;
  qFree: number;
}

export type TabId = 'sandbox' | 'gallery' | 'research';

export function fmt(v: number, sig = 4): string {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 10000 || a < 1e-4) return v.toExponential(2);
  return parseFloat(v.toPrecision(sig)).toString();
}

/** Braess ratios need to show tiny excesses over 1. */
export function fmtBR(v: number): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(7);
}
