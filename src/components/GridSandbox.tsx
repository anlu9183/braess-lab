// Grid-mode sandbox: uniform affine grid + one chord, exact solver, live
// meters, probe canvas, energy/potential curves, and parameter sweeps.

import { useDeferredValue, useMemo, useState } from 'react';
import { GridSpectral, nodeCoord, nodeIndex, type GridChord, type GridCoord, type GridSpec } from '../core/grid';
import { solveGridChord } from '../core/equilibrium';
import { classifyChord } from '../core/braess';
import { computeGridAnalysis, sampleCurves } from '../state/analysis';
import { fmt, fmtBR, type SandboxState } from '../state/types';
import NetworkCanvas, { type ProbeRow } from './NetworkCanvas';
import CanvasToolbar, { ToolRail, type ToolDef } from './CanvasToolbar';
import LatencyModal from './LatencyModal';
import Tiles, { type Tile } from './Tiles';
import LineChart from './LineChart';

interface Props {
  state: SandboxState;
  setState: (next: SandboxState) => void;
}

const CURVE_EDGE_LIMIT = 500;

export default function GridSandbox({ state, setState }: Props) {
  const { spec, chord, chordOn, view, lens, lensU } = state;
  const [picking, setPicking] = useState(false);
  const [pendingU, setPendingU] = useState<GridCoord | null>(null);
  const [pendingChordUV, setPendingChordUV] = useState<{ u: GridCoord; v: GridCoord } | null>(null);
  const [sweep, setSweep] = useState<
    | { kind: 'q'; qs: number[]; BR: number[] }
    | { kind: 'd'; ds: number[]; BR: number[]; z: number[] }
    | null
  >(null);

  const config = useMemo(() => ({ spec, chord, chordOn }), [spec, chord, chordOn]);
  const dConfig = useDeferredValue(config);
  const stale = dConfig !== config;

  const bundle = useMemo(
    () => computeGridAnalysis(dConfig.spec, dConfig.chord, dConfig.chordOn),
    [dConfig],
  );
  const sol = bundle.analysis.equilibrium;
  const fr = sol.fr;
  const net = bundle.net;

  const curves = useMemo(() => {
    if (!dConfig.chordOn || !fr.used || net.edges.length > CURVE_EDGE_LIMIT) return null;
    return sampleCurves(dConfig.spec, dConfig.chord, sol.zStar);
  }, [dConfig, fr.used, net.edges.length, sol.zStar]);

  const lensValues = useMemo(() => {
    if (!lens || !lensU) return null;
    const gs = new GridSpectral(dConfig.spec.m, dConfig.spec.n);
    const s = { i: 0, j: 0 };
    const t = { i: dConfig.spec.m, j: dConfig.spec.n };
    const count = (dConfig.spec.m + 1) * (dConfig.spec.n + 1);
    const vals = new Float64Array(count);
    let maxAbs = 1e-12;
    for (let idx = 0; idx < count; idx++) {
      const w = nodeCoord(dConfig.spec, idx);
      vals[idx] =
        dConfig.spec.q * dConfig.spec.a * gs.quad(s, t, { i: lensU.i, j: lensU.j }, w);
      maxAbs = Math.max(maxAbs, Math.abs(vals[idx]));
    }
    return { vals, maxAbs };
  }, [lens, lensU, dConfig.spec]);

  const update = (patch: Partial<SandboxState>) => {
    setSweep(null);
    setState({ ...state, ...patch });
  };
  const setSpec = (patch: Partial<GridSpec>) => {
    const next = { ...spec, ...patch };
    // Keep the chord inside the grid when it shrinks.
    const clampCoord = (c: { i: number; j: number }) => ({
      i: Math.min(c.i, next.m),
      j: Math.min(c.j, next.n),
    });
    update({
      spec: next,
      chord: { ...chord, u: clampCoord(chord.u), v: clampCoord(chord.v) },
      lensU: lensU ? clampCoord(lensU) : null,
    });
  };
  const setChord = (patch: Partial<GridChord>) => update({ chord: { ...chord, ...patch } });

  const cls = classifyChord(chord.u, chord.v);
  const clsLabel =
    cls === 'shortcut'
      ? 'NE shortcut — provably safe'
      : cls === 'reverse'
        ? 'reverse — no effect'
        : `${cls} — paradox candidate`;

  const flowsShown = view === 'equilibrium' ? sol.flows : bundle.relaxFlows;
  const chordFlowShown = view === 'equilibrium' ? sol.zStar : bundle.zRel;
  const reversedCount = useMemo(() => {
    if (view !== 'electrical') return 0;
    let count = 0;
    for (let e = 0; e < bundle.relaxFlows.length; e++) if (bundle.relaxFlows[e] < -1e-9) count++;
    return count;
  }, [view, bundle.relaxFlows]);

  // --- meters ---
  const deltaPct = ((sol.CNew - sol.COld) / sol.COld) * 100;
  const tiles: Tile[] = [
    {
      label: 'Total travel time C(f)',
      hint: 'C(f) = Σ x·ℓ(x) over all roads — the total system travel time at the user equilibrium.',
      value: fmt(chordOn ? sol.CNew : sol.COld, 6),
      delta: chordOn
        ? {
            text: `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(4)}% vs no chord`,
            tone: deltaPct > 1e-7 ? 'bad' : deltaPct < -1e-7 ? 'good' : 'neutral',
          }
        : { text: 'baseline (no chord)', tone: 'neutral' },
    },
    {
      label: 'Braess ratio BR',
      hint: 'BR = C(with chord) ÷ C(without). BR > 1 means adding the road made everyone slower — the paradox. Proven strictly below 4/3 (Thm 4.1).',
      value: chordOn ? fmtBR(sol.BR) : '—',
      delta: !chordOn
        ? undefined
        : sol.BR > 1 + 1e-9
          ? { text: '▲ paradox — adding the road hurt', tone: 'bad' }
          : sol.BR < 1 - 1e-9
            ? { text: '▼ the road helps', tone: 'good' }
            : { text: 'no change', tone: 'neutral' },
    },
    {
      label: 'Price of anarchy',
      hint: 'Price of anarchy = equilibrium cost ÷ system-optimum cost — how much selfish routing costs versus coordinated routing.',
      value: fmt(bundle.analysis.PoA, 6),
      delta: { text: 'UE cost / SO cost', tone: 'neutral' },
    },
    {
      label: 'Chord flow z*',
      hint: 'z* — how much traffic uses the added chord at the user equilibrium.',
      value: chordOn ? fmt(sol.zStar) : '—',
      delta: chordOn
        ? {
            text:
              sol.region === 'unused'
                ? 'chord unused (Cor. 2.8)'
                : sol.region === 'first-region'
                  ? 'first region (closed form)'
                  : 'beyond breakpoint (QP)',
            tone: 'neutral',
          }
        : undefined,
    },
    {
      label: 'Voltage V_uv',
      hint: 'V_uv — the base-grid potential drop from u to v. V_uv < 0 is necessary for the paradox (Thm 2.11 / 2.12).',
      value: fmt(fr.Vuv),
      delta:
        fr.Vuv < 0
          ? { text: 'negative — necessary for paradox', tone: 'bad' }
          : { text: 'nonnegative — chord is safe', tone: 'good' },
    },
    {
      label: 'Breakpoint z̄ / zel',
      hint: 'z̄ — chord flow at which the first grid road saturates; zel — the unconstrained (electrical) optimizer. Beyond z̄ the exact QP takes over.',
      value: `${fmt(Math.min(fr.zbar, spec.q))} / ${fmt(fr.zel)}`,
      delta: { text: 'first saturation / relaxation opt', tone: 'neutral' },
    },
    {
      label: 'BR_rel (electrical bound)',
      hint: 'BR_rel — the electrical-relaxation upper bound on the Braess ratio (Thm 2.11); the honest BR is always ≤ this.',
      value: fr.Vuv < 0 ? fmtBR(bundle.analysis.BRrel) : '—',
      delta: { text: 'BR ≤ BR_rel < 4/3', tone: 'neutral' },
    },
  ];

  // --- probes ---
  const edgeInfo = (idx: number) => {
    const e = net.edges[idx];
    const x = flowsShown[idx];
    const from = nodeCoord(spec, e.from);
    const to = nodeCoord(spec, e.to);
    const rows: ProbeRow[] = [
      { label: `road (${from.i},${from.j}) → (${to.i},${to.j})`, value: '' },
      { label: 'flow x', value: fmt(x), color: 'var(--series-1)' },
      { label: 'latency ax+b', value: fmt(spec.a * Math.max(x, 0) + spec.b) },
    ];
    if (view === 'electrical' && x < -1e-9) {
      rows.push({ label: '⚠ runs backwards', value: 'infeasible', color: 'var(--series-8)' });
    } else {
      rows.push({ label: 'voltage drop', value: fmt(sol.phi[e.from] - sol.phi[e.to]) });
    }
    return rows;
  };

  const nodeInfo = (idx: number) => {
    const c = nodeCoord(spec, idx);
    const rows: ProbeRow[] = [
      { label: `node (${c.i},${c.j}) — level ${c.i + c.j}`, value: '' },
      { label: 'potential φ', value: fmt(sol.phi[idx]) },
    ];
    if (lensValues) {
      rows.push({
        label: `V(u→here)`,
        value: fmt(lensValues.vals[idx]),
        color: lensValues.vals[idx] < 0 ? 'var(--series-8)' : 'var(--series-1)',
      });
    }
    if (picking) rows.push({ label: 'click to set', value: pendingU ? 'v' : 'u' });
    return rows;
  };

  const nodeFill = (idx: number): string | null => {
    if (!lensValues) return null;
    const v = lensValues.vals[idx];
    const mag = Math.round(Math.min(1, Math.abs(v) / lensValues.maxAbs) * 100);
    const pole = v < 0 ? 'var(--series-8)' : 'var(--series-1)';
    return `color-mix(in oklab, var(--div-mid) ${100 - mag}%, ${pole})`;
  };

  const onNodeClick = (idx: number) => {
    const c = nodeCoord(spec, idx);
    if (picking) {
      if (!pendingU) {
        setPendingU(c);
      } else if (pendingU.i !== c.i || pendingU.j !== c.j) {
        // Both endpoints chosen: the latency dialog decides c, d (mandatory).
        setPendingChordUV({ u: pendingU, v: c });
        setPendingU(null);
        setPicking(false);
      }
      return;
    }
    if (lens) update({ lensU: c });
  };

  // --- sweeps ---
  const runQSweep = () => {
    const gs = new GridSpectral(spec.m, spec.n);
    const qs: number[] = [];
    const BR: number[] = [];
    for (let i = 1; i <= 40; i++) {
      const q = (i / 40) * 2.5;
      const s = solveGridChord({ ...spec, q }, chord, gs);
      qs.push(q);
      BR.push(s.BR);
    }
    setSweep({ kind: 'q', qs, BR });
  };

  const runDSweep = () => {
    const gs = new GridSpectral(spec.m, spec.n);
    const dMax = Math.max((fr.Vuv + spec.b * fr.k) * 1.3, 0.5);
    const ds: number[] = [];
    const BR: number[] = [];
    const z: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const d = (i / 40) * dMax;
      const s = solveGridChord(spec, { ...chord, d }, gs);
      ds.push(d);
      BR.push(s.BR);
      z.push(s.zStar);
    }
    setSweep({ kind: 'd', ds, BR, z });
  };

  // --- curve chart data ---
  const energyChart = curves && (
    <LineChart
      series={[
        { name: 'E→(z) constrained', color: 'var(--series-1)', points: curves.zs.map((z, i) => ({ x: z, y: curves.Earrow[i] })) },
        { name: 'E(z) electrical relaxation', color: 'var(--series-2)', points: curves.zs.map((z, i) => ({ x: z, y: curves.Erelax[i] })) },
      ]}
      regions={[
        {
          polygon: [
            ...curves.zs.map((z, i) => ({ x: z, y: curves.Earrow[i] })),
            ...[...curves.zs].reverse().map((z) => {
              const i = curves.zs.indexOf(z);
              return { x: z, y: curves.Erelax[i] };
            }),
          ],
          fill: 'var(--series-1)',
        },
      ]}
      vlines={fr.zbar < spec.q ? [{ x: fr.zbar, label: 'z̄' }] : []}
      markers={[{ x: sol.zStar, y: sol.Earrow, color: 'var(--series-1)', label: 'z*' }]}
      xLabel="chord flow z"
      yLabel="energy"
    />
  );

  const psiChart = curves && (
    <LineChart
      series={[
        { name: 'Ψ(z) reduced Beckmann', color: 'var(--series-1)', points: curves.zs.map((z, i) => ({ x: z, y: curves.Psi[i] })) },
      ]}
      vlines={fr.zbar < spec.q ? [{ x: fr.zbar, label: 'z̄' }] : []}
      markers={[
        {
          x: sol.zStar,
          y: 0.5 * sol.Earrow + spec.b * (spec.q * (spec.m + spec.n) - fr.k * sol.zStar) + 0.5 * chord.c * sol.zStar ** 2 + chord.d * sol.zStar,
          color: 'var(--series-1)',
          label: 'z*',
        },
      ]}
      xLabel="chord flow z"
      yLabel="Ψ"
    />
  );

  const areaCurve = curves ? z2area(curves.zs, curves.Delta, sol.zStar) : [];
  const deltaChart = curves && (
    <>
      <LineChart
        series={[
          { name: 'Δuv(z) directed voltage', color: 'var(--series-1)', points: curves.zs.map((z, i) => ({ x: z, y: curves.Delta[i] })) },
          { name: 'Vuv − Ruv·z bound (Thm. 2.10)', color: 'var(--series-2)', points: curves.zs.map((z, i) => ({ x: z, y: curves.DeltaBound[i] })) },
        ]}
        regions={[{ polygon: areaCurve, fill: 'var(--series-1)', opacity: 0.14 }]}
        vlines={[{ x: sol.zStar, label: 'z*' }]}
        xLabel="chord flow z"
        yLabel="Δuv"
      />
      <div style={{ marginTop: 8 }}>
        <span className="chip mono">z*·Δ* = {fmt(sol.zStar * curves.DeltaStar)}</span>
        <span className="chip mono">2∫Δ = {fmt(2 * curves.integralDelta)}</span>
        <span className={`chip ${sol.BR > 1 + 1e-9 ? 'bad' : 'good'}`}>
          {sol.BR > 1 + 1e-9 ? 'z*Δ* > 2∫Δ — paradox (Thm 2.11)' : 'no paradox (Thm 2.11)'}
        </span>
      </div>
    </>
  );

  const toolbarTools: ToolDef[] = [
    {
      id: 'probe',
      icon: 'probe',
      label: 'Probe: hover roads (ammeter) and nodes (voltmeter)',
      active: !picking && !lens,
      onClick: () => {
        setPicking(false);
        setPendingU(null);
        if (lens) update({ lens: false, lensU: null });
      },
    },
    {
      id: 'chord',
      icon: 'chord',
      label: 'Place chord: click u, then v — the latency dialog follows',
      active: picking,
      onClick: () => {
        setPicking(!picking);
        setPendingU(null);
      },
    },
    {
      id: 'lens',
      icon: 'lens',
      label: 'Voltage lens: click a node u, colors show V(u→w)',
      active: lens,
      onClick: () => update({ lens: !lens, lensU: !lens ? (lensU ?? { i: chord.u.i, j: chord.u.j }) : null }),
    },
    {
      id: 'bolt',
      icon: 'bolt',
      label: 'Electrical relaxation view (signed resistor current)',
      active: view === 'electrical',
      onClick: () => update({ view: view === 'electrical' ? 'equilibrium' : 'electrical' }),
    },
  ];

  const toolbarHint = picking
    ? pendingU
      ? `u = (${pendingU.i},${pendingU.j}) — now click v`
      : 'Click the chord tail u'
    : lens
      ? 'Click any node to move the lens origin u'
      : 'Drag background to pan · scroll to zoom · click the switch on the chord';

  return (
    <div className="sandbox">
      <CanvasToolbar mode="grid" onMode={(mode) => setState({ ...state, mode })} hint={toolbarHint} />

      <div className="layout">
      <div className="column">
        <div className="card">
          <h2>Grid G(m,n) — every road ℓ(x) = a·x + b</h2>
          <Slider label="rows m" value={spec.m} min={1} max={12} step={1} onChange={(v) => setSpec({ m: v })} />
          <Slider label="cols n" value={spec.n} min={1} max={14} step={1} onChange={(v) => setSpec({ n: v })} />
          <Slider label="slope a" value={spec.a} min={0.1} max={3} step={0.05} onChange={(v) => setSpec({ a: v })} />
          <NumberSlider label="intercept b" value={spec.b} min={0} max={3} step={0.0001} onChange={(v) => setSpec({ b: v })} />
          <Slider label="demand q" value={spec.q} min={0.1} max={3} step={0.05} onChange={(v) => setSpec({ q: v })} />
        </div>

        <div className="card">
          <h2>
            Chord u → v — ℓ(x) = c·x + d <span className="hint">({clsLabel}, k = {fr.k})</span>
          </h2>
          <div className="control-row">
            <label>u = (i, j)</label>
            <input type="number" aria-label="chord tail u — row i" min={0} max={spec.m} value={chord.u.i} onChange={(e) => setChord({ u: { ...chord.u, i: clampInt(e.target.value, 0, spec.m) } })} />
            <input type="number" aria-label="chord tail u — column j" min={0} max={spec.n} value={chord.u.j} onChange={(e) => setChord({ u: { ...chord.u, j: clampInt(e.target.value, 0, spec.n) } })} />
          </div>
          <div className="control-row">
            <label>v = (i, j)</label>
            <input type="number" aria-label="chord head v — row i" min={0} max={spec.m} value={chord.v.i} onChange={(e) => setChord({ v: { ...chord.v, i: clampInt(e.target.value, 0, spec.m) } })} />
            <input type="number" aria-label="chord head v — column j" min={0} max={spec.n} value={chord.v.j} onChange={(e) => setChord({ v: { ...chord.v, j: clampInt(e.target.value, 0, spec.n) } })} />
          </div>
          <NumberSlider label="slope c" value={chord.c} min={0} max={3} step={0.01} onChange={(v) => setChord({ c: v })} />
          <NumberSlider label="intercept d" value={chord.d} min={0} max={3} step={0.0001} onChange={(v) => setChord({ d: v })} />
          <div className="control-row" style={{ marginTop: 10 }}>
            <button className={`btn ${chordOn ? 'primary' : ''}`} onClick={() => update({ chordOn: !chordOn })}>
              {chordOn ? '⏻ switch closed — chord live' : '⭘ switch open — chord off'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPicking(!picking);
                setPendingU(null);
              }}
            >
              {picking ? (pendingU ? 'click node for v…' : 'click node for u…') : 'pick u → v on canvas'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2>View</h2>
          <div className="seg" role="tablist">
            <button className={view === 'equilibrium' ? 'active' : ''} onClick={() => update({ view: 'equilibrium' })}>
              User equilibrium
            </button>
            <button className={view === 'electrical' ? 'active' : ''} onClick={() => update({ view: 'electrical' })}>
              Electrical relaxation
            </button>
          </div>
          {view === 'electrical' && (
            <p className="note" style={{ marginTop: 8 }}>
              Unconstrained resistor current at z = {fmt(bundle.zRel)}.{' '}
              {reversedCount > 0 ? (
                <b style={{ color: 'var(--status-critical)' }}>{reversedCount} road(s) run backwards</b>
              ) : (
                'No reversed roads here.'
              )}{' '}
              — reversed roads are why BR_rel overstates the honest ratio (Thm 2.11).
            </p>
          )}
          <div className="control-row" style={{ marginTop: 8 }}>
            <label style={{ width: 'auto', flex: 1 }}>
              <input
                type="checkbox"
                checked={lens}
                onChange={(e) => update({ lens: e.target.checked, lensU: e.target.checked ? (lensU ?? { i: chord.u.i, j: chord.u.j }) : null })}
              />{' '}
              Voltage lens (click a node u; colors show V_u→w)
            </label>
          </div>
          {lens && (
            <p className="note">
              Red = V &lt; 0 (a chord u→w in that direction is a paradox candidate); blue = safe. Only
              SE/NW nodes can go red (Thm. 2.12).
            </p>
          )}
        </div>

        <div className="card">
          <h2>Analyses</h2>
          <div className="control-row">
            <button className="btn small" onClick={runQSweep}>
              demand sweep BR(q)
            </button>
            <button className="btn small" onClick={runDSweep} disabled={!chordOn}>
              price sweep BR(d), z*(d)
            </button>
          </div>
          <p className="note">
            The d-sweep shows chord usage switching off exactly at d = V_uv + bk ≈{' '}
            <span className="mono">{fmt(fr.Vuv + spec.b * fr.k)}</span> (Cor. 2.8).
          </p>
        </div>
      </div>

      <div className="column" style={{ opacity: stale ? 0.6 : 1 }}>
        <div className="canvas-row">
          <ToolRail tools={toolbarTools} />
          <div className="card canvas-card">
          <NetworkCanvas
            nodeCount={net.nodeCount}
            positions={net.positions}
            edges={net.edges}
            flows={flowsShown}
            source={net.source}
            sink={net.sink}
            signedView={view === 'electrical'}
            chord={{
              from: nodeIndex(spec, chord.u.i, chord.u.j),
              to: nodeIndex(spec, chord.v.i, chord.v.j),
              flow: chordFlowShown,
              on: chordOn,
              color: 'var(--series-7)',
            }}
            onChordToggle={() => update({ chordOn: !chordOn })}
            onNodeClick={onNodeClick}
            pendingNode={pendingU ? nodeIndex(spec, pendingU.i, pendingU.j) : null}
            nodeFill={nodeFill}
            nodeInfo={nodeInfo}
            edgeInfo={edgeInfo}
            height={460}
            fitKey={`${spec.m}x${spec.n}`}
          />
          </div>
        </div>

        <Tiles tiles={tiles} />

        {chordOn && fr.used && !curves && net.edges.length > CURVE_EDGE_LIMIT && (
          <p className="note">Curves are hidden for grids this large — shrink the grid to see E→(z), Ψ(z), Δuv(z).</p>
        )}

        {curves && (
          <>
            <div className="card">
              <h2>
                Energy E→(z) vs the electrical relaxation E(z) <span className="hint">— the shaded gap is the orientation penalty G(z)</span>
              </h2>
              {energyChart}
            </div>
            <div className="card">
              <h2>Reduced Beckmann potential Ψ(z) — its minimizer is the equilibrium chord flow</h2>
              {psiChart}
            </div>
            <div className="card">
              <h2>
                Voltage-area criterion (Thm 2.11) <span className="hint">— paradox iff z*Δ* exceeds twice the shaded area</span>
              </h2>
              {deltaChart}
            </div>
          </>
        )}

        {sweep?.kind === 'q' && (
          <div className="card">
            <h2>Braess ratio vs demand q</h2>
            <LineChart
              series={[{ name: 'BR(q)', color: 'var(--series-1)', points: sweep.qs.map((q, i) => ({ x: q, y: sweep.BR[i] })) }]}
              xLabel="demand q"
              yLabel="BR"
              yFormat={(v) => v.toFixed(4)}
            />
          </div>
        )}
        {sweep?.kind === 'd' && (
          <>
            <div className="card">
              <h2>Chord flow z* vs chord price d</h2>
              <LineChart
                series={[{ name: 'z*(d)', color: 'var(--series-1)', points: sweep.ds.map((d, i) => ({ x: d, y: sweep.z[i] })) }]}
                vlines={[{ x: fr.Vuv + spec.b * fr.k, label: 'Vuv+bk' }]}
                xLabel="chord intercept d"
                yLabel="z*"
              />
            </div>
            <div className="card">
              <h2>Braess ratio vs chord price d</h2>
              <LineChart
                series={[{ name: 'BR(d)', color: 'var(--series-1)', points: sweep.ds.map((d, i) => ({ x: d, y: sweep.BR[i] })) }]}
                vlines={[{ x: fr.Vuv + spec.b * fr.k, label: 'Vuv+bk' }]}
                xLabel="chord intercept d"
                yLabel="BR"
                yFormat={(v) => v.toFixed(4)}
              />
            </div>
          </>
        )}
      </div>
      </div>

      {pendingChordUV && (
        <LatencyModal
          title={`Chord (${pendingChordUV.u.i},${pendingChordUV.u.j}) → (${pendingChordUV.v.i},${pendingChordUV.v.j})`}
          subtitle="The chord needs a latency function ℓ(x) = c·x + d before it is wired in."
          varNames={['c', 'd']}
          initialA={chord.c}
          initialB={chord.d}
          confirmLabel="Wire in chord"
          onConfirm={(c, d) => {
            update({ chord: { u: pendingChordUV.u, v: pendingChordUV.v, c, d }, chordOn: true });
            setPendingChordUV(null);
          }}
          onCancel={() => setPendingChordUV(null)}
        />
      )}
    </div>
  );
}

function z2area(zs: number[], delta: number[], zStar: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  for (let i = 0; i < zs.length; i++) {
    if (zs[i] > zStar + 1e-15) break;
    pts.push({ x: zs[i], y: delta[i] });
  }
  pts.push({ x: Math.min(zStar, zs[zs.length - 1]), y: 0 });
  return pts;
}

function clampInt(raw: string, lo: number, hi: number): number {
  const v = parseInt(raw, 10);
  if (isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="control-row">
      <label>{props.label}</label>
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
      <span className="value">{fmt(props.value)}</span>
    </div>
  );
}

function NumberSlider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="control-row">
      <label>{props.label}</label>
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
      <input
        type="number"
        aria-label={props.label}
        min={props.min}
        step={props.step}
        value={props.value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v >= 0) props.onChange(v);
        }}
      />
    </div>
  );
}
