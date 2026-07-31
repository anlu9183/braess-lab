// Free-form mode: a blank GeoGebra-style worksheet. Add nodes (the first two
// become source and sink automatically), draw edges through the mandatory
// latency dialog, drag to rearrange, pan/zoom the view. Solved with
// Frank-Wolfe once a source→sink network exists; Braess-check edges by
// resolving without them.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, NetworkDef } from '../core/graph';
import { electricalFlow, frankWolfe, systemOptimum } from '../core/equilibrium';
import { BR_EPS, braessEdgeScan, type EdgeScanRow } from '../core/braess';
import { fmt, fmtBR, type SandboxState } from '../state/types';
import NetworkCanvas, { type ProbeRow } from './NetworkCanvas';
import CanvasToolbar, { ToolRail, type ToolDef } from './CanvasToolbar';
import LatencyModal from './LatencyModal';
import Tiles, { type Tile } from './Tiles';

interface Props {
  state: SandboxState;
  setState: (next: SandboxState) => void;
}

type Tool = 'select' | 'node' | 'edge' | 'switch' | 'delete';

export default function FreeformSandbox({ state, setState }: Props) {
  const net = state.freeform;
  const q = state.qFree;
  const [tool, setTool] = useState<Tool>('select');
  const [selNode, setSelNode] = useState<number | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(null);
  const [pendingFrom, setPendingFrom] = useState<number | null>(null);
  const [pendingEdge, setPendingEdge] = useState<{ from: number; to: number } | null>(null);
  const [editEdge, setEditEdge] = useState<number | null>(null);
  const [showElectrical, setShowElectrical] = useState(false);
  const [scan, setScan] = useState<{ key: string; rows: EdgeScanRow[] } | null>(null);
  const lastLatency = useRef<{ a: number; b: number }>({ a: 1, b: 1 });

  const setNet = (next: NetworkDef) => setState({ ...state, freeform: next });

  const enabledIdx = useMemo(
    () => net.edges.map((_, i) => i).filter((i) => net.edges[i].enabled !== false),
    [net],
  );

  const solvable =
    net.nodeCount >= 2 && net.source >= 0 && net.sink >= 0 && net.source !== net.sink;

  const solution = useMemo(() => {
    if (!solvable) return null;
    const edges = enabledIdx.map((i) => net.edges[i]);
    const ue = frankWolfe(net.nodeCount, edges, net.source, net.sink, q, { maxIter: 60000 });
    const so = systemOptimum(net.nodeCount, edges, net.source, net.sink, q, { maxIter: 60000 });
    const flows = new Float64Array(net.edges.length);
    enabledIdx.forEach((orig, j) => {
      flows[orig] = ue.flows[j];
    });
    const allPositiveSlopes = edges.every((e) => e.a > 0);
    let elFlows: Float64Array | null = null;
    if (showElectrical && allPositiveSlopes) {
      const el = electricalFlow(net.nodeCount, edges, net.source, net.sink, q);
      if (el) {
        elFlows = new Float64Array(net.edges.length);
        enabledIdx.forEach((orig, j) => {
          elFlows![orig] = el.flows[j];
        });
      }
    }
    return { ue, so, flows, elFlows, allPositiveSlopes };
  }, [net, q, enabledIdx, showElectrical, solvable]);

  const shownFlows = useMemo(() => {
    if (!solution) return new Float64Array(net.edges.length);
    return showElectrical && solution.elFlows ? solution.elFlows : solution.flows;
  }, [solution, showElectrical, net.edges.length]);

  const braessCheck = useMemo(() => {
    if (!solution || selEdge === null || net.edges[selEdge]?.enabled === false) return null;
    const edges = enabledIdx.filter((i) => i !== selEdge).map((i) => net.edges[i]);
    const without = frankWolfe(net.nodeCount, edges, net.source, net.sink, q, { maxIter: 60000 });
    if (!without.reachable) return null;
    return { CWithout: without.cost, BR: solution.ue.cost / without.cost };
  }, [solution, selEdge, net, q, enabledIdx]);

  // --- Braess scan: leave-one-out over every live road. Results are keyed on
  // the network structure (not positions), so dragging keeps them; any edit
  // to edges, s/t, or demand marks them stale until the user re-scans.
  const structKey = useMemo(
    () => JSON.stringify({ e: net.edges, s: net.source, t: net.sink, n: net.nodeCount, q }),
    [net.edges, net.source, net.sink, net.nodeCount, q],
  );
  const freshScan = scan && scan.key === structKey ? scan : null;

  const runScan = () => {
    if (!solution || !solution.ue.reachable) return;
    const res = braessEdgeScan(
      net.nodeCount,
      enabledIdx.map((i) => net.edges[i]),
      net.source,
      net.sink,
      q,
    );
    setScan({
      key: structKey,
      rows: res ? res.rows.map((r) => ({ ...r, edge: enabledIdx[r.edge] })) : [],
    });
  };

  const braessEdges = useMemo(() => {
    if (!freshScan) return null;
    return new Set(freshScan.rows.filter((r) => r.reachable && r.BR > 1 + BR_EPS).map((r) => r.edge));
  }, [freshScan]);

  // --- mutations ---
  const addNode = (x: number, y: number) => {
    // The first two nodes become source and sink; reassign any time later.
    const idx = net.nodeCount;
    setNet({
      ...net,
      nodeCount: idx + 1,
      positions: [...net.positions, { x, y }],
      source: net.source < 0 ? idx : net.source,
      sink: net.sink < 0 && net.source >= 0 ? idx : net.sink,
    });
  };

  const deleteEdge = (idx: number) => {
    setSelEdge(null);
    setNet({ ...net, edges: net.edges.filter((_, i) => i !== idx) });
  };

  const deleteNode = (idx: number) => {
    if (idx === net.source || idx === net.sink) return;
    const remap = (i: number) => (i > idx ? i - 1 : i);
    setSelNode(null);
    setSelEdge(null);
    setNet({
      ...net,
      nodeCount: net.nodeCount - 1,
      positions: net.positions.filter((_, i) => i !== idx),
      edges: net.edges
        .filter((e) => e.from !== idx && e.to !== idx)
        .map((e) => ({ ...e, from: remap(e.from), to: remap(e.to) })),
      source: remap(net.source),
      sink: remap(net.sink),
    });
  };

  const patchEdge = (idx: number, patch: Partial<Edge>) => {
    setNet({ ...net, edges: net.edges.map((e, i) => (i === idx ? { ...e, ...patch } : e)) });
  };

  // --- keyboard: Esc clears pending, Delete removes the selection ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setPendingFrom(null);
        setSelNode(null);
        setSelEdge(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && pendingEdge === null && editEdge === null) {
        if (selEdge !== null) deleteEdge(selEdge);
        else if (selNode !== null) deleteNode(selNode);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- canvas handlers ---
  const onNodeClick = (idx: number) => {
    if (tool === 'edge') {
      if (pendingFrom === null) {
        setPendingFrom(idx);
      } else if (pendingFrom !== idx) {
        setPendingEdge({ from: pendingFrom, to: idx });
        setPendingFrom(null);
      }
      return;
    }
    if (tool === 'delete') {
      deleteNode(idx);
      return;
    }
    setSelNode(idx);
    setSelEdge(null);
  };

  const onEdgeClick = (idx: number) => {
    if (tool === 'delete') {
      deleteEdge(idx);
      return;
    }
    if (tool === 'switch') {
      patchEdge(idx, { enabled: net.edges[idx].enabled === false });
      return;
    }
    setSelEdge(idx);
    setSelNode(null);
  };

  const onBackgroundClick = (x: number, y: number) => {
    if (tool === 'node') {
      addNode(x, y);
      return;
    }
    setSelNode(null);
    setSelEdge(null);
    setPendingFrom(null);
  };

  // --- tool rail ---
  const tools: ToolDef[] = [
    { id: 'select', icon: 'select', label: 'Select & drag (Esc to deselect)', active: tool === 'select', onClick: () => setTool('select') },
    { id: 'node', icon: 'add-node', label: 'Add node: click the worksheet', active: tool === 'node', onClick: () => setTool('node') },
    { id: 'edge', icon: 'add-edge', label: 'Add edge: click tail node, then head node', active: tool === 'edge', onClick: () => setTool('edge') },
    { id: 'switch', icon: 'switch', label: 'Road switch: click a road to take it out of (or back into) the network', active: tool === 'switch', onClick: () => setTool('switch') },
    { id: 'delete', icon: 'delete', label: 'Delete nodes / edges', active: tool === 'delete', onClick: () => setTool('delete') },
    {
      id: 'bolt',
      icon: 'bolt',
      label:
        solution && solution.allPositiveSlopes
          ? 'Electrical overlay (signed resistor current)'
          : 'Electrical overlay needs a solvable network with every a > 0',
      active: showElectrical,
      disabled: !solution || !solution.allPositiveSlopes,
      onClick: () => setShowElectrical((v) => !v),
    },
  ];

  const hint =
    net.nodeCount === 0
      ? 'Empty worksheet — pick the ⊕ node tool and click to place nodes.'
      : tool === 'node'
        ? 'Click an empty spot to place a node.'
        : tool === 'edge'
          ? pendingFrom === null
            ? 'Click the tail node of the new edge.'
            : `From node ${pendingFrom} — click the head node.`
          : tool === 'switch'
            ? 'Click a road to flip its switch — open roads drop out of the network. Watch C(f).'
            : tool === 'delete'
              ? 'Click a node or edge to remove it.'
              : 'Drag background to pan · scroll to zoom · drag nodes to move them.';

  const worstRow = freshScan && freshScan.rows.length > 0 ? freshScan.rows[0] : null;
  const worstIsBraess = worstRow !== null && worstRow.reachable && worstRow.BR > 1 + BR_EPS;
  const braessTile: Tile = worstRow
    ? worstIsBraess
      ? {
          label: 'Worst road BR',
          value: fmtBR(worstRow.BR),
          delta: {
            text: `road ${net.edges[worstRow.edge].from} → ${net.edges[worstRow.edge].to} hurts — open its switch`,
            tone: 'bad',
          },
        }
      : {
          label: 'Worst road BR',
          value: '≤ 1',
          delta: { text: 'no Braess road in this network', tone: 'good' },
        }
    : {
        label: 'Worst road BR',
        value: '—',
        delta: { text: freshScan ? 'no roads to scan' : 'run the Braess scan', tone: 'neutral' },
      };

  const tiles: Tile[] = solution
    ? [
        {
          label: 'Total travel time C(f)',
          value: fmt(solution.ue.cost, 6),
          delta: solution.ue.reachable
            ? { text: `route time τ = ${fmt(solution.ue.tau)}`, tone: 'neutral' }
            : { text: 'sink unreachable!', tone: 'bad' },
        },
        {
          label: 'System optimum C(SO)',
          value: fmt(solution.so.cost, 6),
          delta: { text: 'if drivers cooperated', tone: 'neutral' },
        },
        {
          label: 'Price of anarchy',
          value: fmt(solution.ue.cost / solution.so.cost, 6),
          delta: { text: '≤ 4/3 for affine latencies', tone: 'neutral' },
        },
        braessTile,
        {
          label: 'Solver gap',
          value: solution.ue.relGap < 1e-9 ? '< 1e-9' : fmt(solution.ue.relGap, 2),
          delta: { text: `Frank–Wolfe, ${solution.ue.iterations} iters`, tone: 'neutral' },
        },
      ]
    : [
        {
          label: 'Total travel time C(f)',
          value: '—',
          delta: { text: 'needs a source and a sink', tone: 'neutral' },
        },
        {
          label: 'Network',
          value: `${net.nodeCount}·${net.edges.length}`,
          delta: { text: 'nodes · edges — first two nodes become s and t', tone: 'neutral' },
        },
      ];

  const edgeInfo = (idx: number) => {
    const e = net.edges[idx];
    const x = shownFlows[idx];
    const rows: ProbeRow[] = [
      { label: `edge ${e.from} → ${e.to}${e.enabled === false ? ' — switch open' : ''}`, value: '' },
      { label: 'flow x', value: fmt(x), color: 'var(--series-1)' },
      { label: `latency ${fmt(e.a)}·x + ${fmt(e.b)}`, value: fmt(e.a * Math.max(x, 0) + e.b) },
    ];
    const scanRow = freshScan?.rows.find((r) => r.edge === idx);
    if (scanRow && e.enabled !== false) {
      rows.push({
        label: 'BR(edge)',
        value: scanRow.reachable ? fmtBR(scanRow.BR) : 'only route',
        color: braessEdges?.has(idx) ? 'var(--series-8)' : undefined,
      });
    }
    return rows;
  };

  const nodeInfo = (idx: number) => [
    {
      label: `node ${idx}${idx === net.source ? ' (source)' : idx === net.sink ? ' (sink)' : ''}`,
      value: '',
    },
  ];

  const selEdgeData = selEdge !== null ? net.edges[selEdge] : null;

  return (
    <div className="sandbox">
      <CanvasToolbar mode="freeform" onMode={(mode) => setState({ ...state, mode })} hint={hint} />

      <div className="layout">
        <div className="column">
          <div className="card">
            <h2>Demand</h2>
            <div className="control-row">
              <label>demand q</label>
              <input type="range" aria-label="demand q" min={0.1} max={4} step={0.05} value={q} onChange={(e) => setState({ ...state, qFree: parseFloat(e.target.value) })} />
              <span className="value">{fmt(q)}</span>
            </div>
          </div>

          {selNode !== null && (
            <div className="card">
              <h2>Node {selNode}</h2>
              <div className="control-row">
                <button className="btn small" onClick={() => setNet({ ...net, source: selNode })}>
                  set as source
                </button>
                <button className="btn small" onClick={() => setNet({ ...net, sink: selNode })}>
                  set as sink
                </button>
                <button className="btn small" disabled={selNode === net.source || selNode === net.sink} onClick={() => deleteNode(selNode)}>
                  delete
                </button>
              </div>
            </div>
          )}

          {selEdgeData && selEdge !== null && (
            <div className="card">
              <h2>
                Edge {selEdgeData.from} → {selEdgeData.to} <span className="hint mono">ℓ(x) = {fmt(selEdgeData.a)}·x + {fmt(selEdgeData.b)}</span>
              </h2>
              <div className="control-row">
                <button className="btn small" onClick={() => setEditEdge(selEdge)}>
                  edit latency…
                </button>
                <button
                  className={`btn small ${selEdgeData.enabled !== false ? 'primary' : ''}`}
                  onClick={() => patchEdge(selEdge, { enabled: selEdgeData.enabled === false })}
                >
                  {selEdgeData.enabled !== false ? '⏻ switch closed — road live' : '⭘ switch open — road out'}
                </button>
                <button className="btn small" onClick={() => deleteEdge(selEdge)}>
                  delete
                </button>
              </div>
              {braessCheck && (
                <>
                  <div className="control-row">
                    <label>C without it</label>
                    <span className="value">{fmt(braessCheck.CWithout, 6)}</span>
                  </div>
                  <div className="control-row">
                    <label>BR(edge)</label>
                    <span className="value">{fmtBR(braessCheck.BR)}</span>
                  </div>
                  <span className={`chip ${braessCheck.BR > 1 + BR_EPS ? 'bad' : 'good'}`}>
                    {braessCheck.BR > 1 + BR_EPS ? 'Braess edge — removing it helps!' : 'benign edge'}
                  </span>
                </>
              )}
            </div>
          )}

          {solvable && (
            <div className="card">
              <h2>Braess paradox</h2>
              <p className="note">
                Take out each road in turn and re-solve: BR(e) = C(with e) / C(without e). A road
                with BR &gt; 1 slows everyone down just by existing — it gets a ⚠ on the worksheet.
              </p>
              <button
                className="btn primary"
                disabled={!solution || !solution.ue.reachable || enabledIdx.length === 0}
                onClick={runScan}
              >
                {freshScan
                  ? 'Re-scan roads'
                  : scan
                    ? 'Network changed — re-scan'
                    : `Scan ${enabledIdx.length} road${enabledIdx.length === 1 ? '' : 's'}`}
              </button>
              {freshScan && freshScan.rows.length > 0 && (
                <div className="scan-list">
                  {freshScan.rows.map((r) => {
                    const e = net.edges[r.edge];
                    const isBraess = r.reachable && r.BR > 1 + BR_EPS;
                    return (
                      <button
                        key={r.edge}
                        type="button"
                        className={`scan-row ${selEdge === r.edge ? 'selected' : ''}`}
                        onClick={() => {
                          setSelEdge(r.edge);
                          setSelNode(null);
                        }}
                      >
                        <span className="mono">
                          {e.from} → {e.to}
                        </span>
                        <span className="mono scan-br">{r.reachable ? fmtBR(r.BR) : '—'}</span>
                        <span className={`chip ${isBraess ? 'bad' : r.reachable ? 'good' : ''}`}>
                          {isBraess ? 'Braess!' : r.reachable ? 'benign' : 'only route'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="card">
            <h2>Solver</h2>
            <p className="note">
              Free-form networks solve with Frank–Wolfe on the Beckmann potential (handles any a ≥ 0,
              b ≥ 0). Grid mode uses the exact spectral + active-set machinery of the paper. Load the
              classic Braess network from the Gallery for a ready-made example.
            </p>
          </div>
        </div>

        <div className="column">
          <div className="canvas-row">
            <ToolRail tools={tools} />
            <div className="card canvas-card">
              <NetworkCanvas
                nodeCount={net.nodeCount}
                positions={net.positions}
                edges={net.edges}
                flows={shownFlows}
                source={net.source}
                sink={net.sink}
                signedView={showElectrical}
                selectedNode={selNode}
                selectedEdge={selEdge}
                pendingNode={pendingFrom}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onBackgroundClick={onBackgroundClick}
                onNodeDrag={
                  tool === 'select'
                    ? (idx, x, y) => setNet({ ...net, positions: net.positions.map((p, i) => (i === idx ? { x, y } : p)) })
                    : undefined
                }
                nodeInfo={nodeInfo}
                edgeInfo={edgeInfo}
                edgeOff={(i) => net.edges[i].enabled === false}
                edgeFlag={braessEdges ? (i) => braessEdges.has(i) : undefined}
                height={480}
              />
              {net.nodeCount === 0 && (
                <div className="canvas-empty">
                  <b>Empty worksheet</b>
                  <span>
                    Use the ⊕ node tool to place vertices — the first two become source and sink.
                    Then draw edges with the edge tool; each new road asks for its latency ℓ(x).
                  </span>
                </div>
              )}
            </div>
          </div>
          <Tiles tiles={tiles} />
        </div>
      </div>

      {pendingEdge && (
        <LatencyModal
          title={`New edge ${pendingEdge.from} → ${pendingEdge.to}`}
          subtitle="Every road needs a latency function ℓ(x) = a·x + b before it joins the network."
          initialA={lastLatency.current.a}
          initialB={lastLatency.current.b}
          confirmLabel="Add edge"
          onConfirm={(a, b) => {
            lastLatency.current = { a, b };
            setNet({ ...net, edges: [...net.edges, { from: pendingEdge.from, to: pendingEdge.to, a, b }] });
            setPendingEdge(null);
          }}
          onCancel={() => setPendingEdge(null)}
        />
      )}

      {editEdge !== null && net.edges[editEdge] && (
        <LatencyModal
          title={`Edge ${net.edges[editEdge].from} → ${net.edges[editEdge].to}`}
          subtitle="Update this road's latency function."
          initialA={net.edges[editEdge].a}
          initialB={net.edges[editEdge].b}
          confirmLabel="Apply"
          onConfirm={(a, b) => {
            patchEdge(editEdge, { a, b });
            setEditEdge(null);
          }}
          onCancel={() => setEditEdge(null)}
        />
      )}
    </div>
  );
}
