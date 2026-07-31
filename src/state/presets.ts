import type { NetworkDef } from '../core/graph';
import type { SandboxState } from './types';

export const classicBraess: NetworkDef = {
  nodeCount: 4,
  // s=0, A=1, B=2, t=3
  edges: [
    { from: 0, to: 1, a: 1, b: 0 }, // s->A: l = x
    { from: 1, to: 3, a: 0, b: 1 }, // A->t: l = 1
    { from: 0, to: 2, a: 0, b: 1 }, // s->B: l = 1
    { from: 2, to: 3, a: 1, b: 0 }, // B->t: l = x
    { from: 1, to: 2, a: 0, b: 0, isChord: true }, // the zero-cost superhighway
  ],
  source: 0,
  sink: 3,
  positions: [
    { x: 0, y: 1 },
    { x: 1.4, y: 0 },
    { x: 1.4, y: 2 },
    { x: 2.8, y: 1 },
  ],
};

/** A blank worksheet: no nodes yet, source/sink unassigned. */
export function emptyNetwork(): NetworkDef {
  return { nodeCount: 0, edges: [], source: -1, sink: -1, positions: [] };
}

export function defaultSandbox(): SandboxState {
  return {
    mode: 'grid',
    spec: { m: 4, n: 10, a: 1, b: 0.8442, q: 1 },
    chord: { u: { i: 0, j: 6 }, v: { i: 4, j: 4 }, c: 0, d: 0 },
    chordOn: true,
    view: 'equilibrium',
    lens: false,
    lensU: null,
    freeform: emptyNetwork(),
    qFree: 1,
  };
}

export interface Preset {
  id: string;
  title: string;
  blurb: string;
  ref: string;
  state: () => SandboxState;
}

export const presets: Preset[] = [
  {
    id: 'classic',
    title: 'The classic Braess network',
    blurb:
      'Four nodes, two symmetric routes, and a free superhighway that makes everyone slower: total travel time rises from 1.5 to 2.0 when the chord is enabled. Run the Braess scan to see the superhighway flagged, then flip its switch with the switch tool and watch C(f) fall.',
    ref: 'Braess (1968) — the textbook example, BR = 4/3',
    state: () => ({
      ...defaultSandbox(),
      mode: 'freeform',
      freeform: structuredClone(classicBraess),
    }),
  },
  {
    id: 'flagship',
    title: 'The 4×10 example grid',
    blurb:
      'An illustrative 4×10 case: uniform latency x + 0.8442, zero-latency chord (0,6)→(4,4). The chord looks great in the electrical relaxation (BR_rel ≈ 1.0202259) but the honest directed equilibrium stops at z* ≈ 0.3798 with BR ≈ 1.0003262 — still a paradox. Switch the view to “Electrical relaxation” to see the roads the unconstrained current would drive backwards.',
    ref: 'Reference solver configuration — cross-checked against Frank–Wolfe',
    state: () => defaultSandbox(),
  },
  {
    id: 'edge-usage',
    title: 'When does a chord attract flow?',
    blurb:
      'The chord is used iff V_uv + bk > d (Corollary 2.8). This preset starts with the flagship chord priced at d = 1.6, just above the threshold ≈ 1.384 — the switch is closed but no traffic takes it. Drag d below the threshold and watch flow jump onto the chord.',
    ref: 'Corollary 2.8 — edge-usage criterion',
    state: () => {
      const s = defaultSandbox();
      s.chord = { ...s.chord, d: 1.6 };
      return s;
    },
  },
  {
    id: 'lens',
    title: 'Only SE and NW chords can harm',
    blurb:
      'Turn on the voltage lens and click any node u: every other node v is colored by the base-grid voltage V_uv. Northeast “shortcuts” are always blue (V_uv ≥ 0, provably harmless); only south-east and north-west chords can go red. Red means a chord u→v points against the voltage — the necessary condition for the paradox.',
    ref: 'Theorem 2.12 — directional restriction',
    state: () => {
      const s = defaultSandbox();
      s.spec = { m: 6, n: 6, a: 1, b: 1, q: 1 };
      s.chord = { u: { i: 0, j: 4 }, v: { i: 4, j: 2 }, c: 0, d: 0 };
      s.chordOn = false;
      s.lens = true;
      s.lensU = { i: 0, j: 4 };
      return s;
    },
  },
  {
    id: 'linear',
    title: 'Linear latencies are immune',
    blurb:
      'Set b = 0 everywhere and no added edge can ever hurt: the network is a pure resistor circuit and Thomson’s principle protects it (Lemma 2.2). Here the flagship-style SE chord attracts no flow at all — V_uv < 0 and there is no intercept b to pay it back.',
    ref: 'Lemma 2.2 / Theorem 2.3 (Thomson’s Principle) — resistor immunity',
    state: () => {
      const s = defaultSandbox();
      s.spec = { m: 4, n: 6, a: 1, b: 0, q: 1 };
      s.chord = { u: { i: 0, j: 4 }, v: { i: 3, j: 2 }, c: 0, d: 0 };
      s.chordOn = true;
      return s;
    },
  },
  {
    id: 'shortcut',
    title: 'Shortcuts never backfire',
    blurb:
      'A chord that moves toward the sink (northeast) telescopes down the potential, so V_uv ≥ 0 and adding it can only help — whatever its latency. Toggle the switch: total travel time falls or stays put, never rises.',
    ref: 'Theorem 2.12 + Lemma 2.1',
    state: () => {
      const s = defaultSandbox();
      s.spec = { m: 3, n: 4, a: 1, b: 0.9, q: 1 };
      s.chord = { u: { i: 1, j: 1 }, v: { i: 3, j: 3 }, c: 0, d: 0.2 };
      s.chordOn = true;
      return s;
    },
  },
];
