// Research tab: run the corrected-maximum search in a Web Worker, stream
// results into a ranked table + per-grid heatmap, export CSV, and load any
// row back into the sandbox for inspection.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DoneMsg, GridSummary, ProgressMsg, SearchRow, WorkerOut } from '../workers/protocol';
import { defaultSandbox } from '../state/presets';
import { fmt, fmtBR, type SandboxState } from '../state/types';

interface Props {
  loadIntoSandbox: (state: SandboxState) => void;
}

export default function ResearchTab({ loadIntoSandbox }: Props) {
  const [maxN, setMaxN] = useState(8);
  const [budget, setBudget] = useState(60);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressMsg | null>(null);
  const [result, setResult] = useState<DoneMsg | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  const start = () => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    setResult(null);
    setProgress(null);
    setRunning(true);
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      if (ev.data.type === 'progress') setProgress(ev.data);
      else {
        setResult(ev.data);
        setRunning(false);
      }
    };
    worker.postMessage({ type: 'start', maxN, perGridBudget: budget });
  };

  const cancel = () => {
    workerRef.current?.postMessage({ type: 'cancel' });
  };

  const rows: SearchRow[] = useMemo(() => result?.rows ?? progress?.rows ?? [], [result, progress]);
  const grids: GridSummary[] = result?.grids ?? progress?.grids ?? [];
  const bestBR = result?.bestBR ?? progress?.bestBR ?? 1;

  const csv = useMemo(() => {
    const header = 'm,n,ui,uj,vi,vj,k,Vuv,Ruv,bStar,BRrel,BR,zStar,zbar';
    const lines = rows.map((r) =>
      [r.m, r.n, r.u.i, r.u.j, r.v.i, r.v.j, r.k, r.Vuv, r.Ruv, r.bStar, r.BRrel, r.BR, r.zStar, r.zbar].join(','),
    );
    return [header, ...lines].join('\n');
  }, [rows]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braess-search-N${maxN}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadRow = (r: SearchRow) => {
    const s = defaultSandbox();
    s.spec = { m: r.m, n: r.n, a: 1, b: r.bStar, q: 1 };
    s.chord = { u: r.u, v: r.v, c: 0, d: 0 };
    s.chordOn = true;
    loadIntoSandbox(s);
  };

  return (
    <div className="column">
      <div className="card">
        <h2>
          Corrected-maximum search{' '}
          <span className="hint">
            — the honest orientation-constrained Braess ratio over all grids m ≤ n ≤ N, the companion
            computation the paper defers (§5, Future Directions)
          </span>
        </h2>
        <div className="control-row">
          <label>max side N</label>
          <input type="number" min={2} max={16} value={maxN} disabled={running} onChange={(e) => setMaxN(Math.max(2, Math.min(16, parseInt(e.target.value) || 2)))} />
          <label style={{ width: 'auto' }}>honest solves / grid</label>
          <input type="number" min={1} max={500} value={budget} disabled={running} onChange={(e) => setBudget(Math.max(1, parseInt(e.target.value) || 1))} />
          {!running ? (
            <button className="btn primary" onClick={start}>
              run search
            </button>
          ) : (
            <button className="btn" onClick={cancel}>
              stop
            </button>
          )}
          <button className="btn" onClick={downloadCsv} disabled={rows.length === 0}>
            export CSV
          </button>
        </div>
        <p className="note">
          Per chord: c = d = 0 (Thm. 4.2) and b = (q·R_uv − V_uv)/k, the relaxation-optimal
          configuration. Pruning: SE/NW & k &gt; 0 (Thm. 2.12), V_uv &lt; 0 (Thm. 2.11), and BR ≤ BR_rel — candidates
          are tried in BR_rel order and the scan stops when BR_rel can no longer beat the grid's
          honest best, so per-grid maxima are exact (up to the solve budget).
        </p>
        {(running || progress) && (
          <>
            <div className="progress-track" style={{ marginTop: 8 }}>
              <div className="progress-fill" style={{ width: `${progress ? (100 * progress.done) / progress.total : 0}%` }} />
            </div>
            <p className="note" style={{ marginTop: 6 }}>
              {progress
                ? `${progress.done}/${progress.total} grids · last ${progress.label} · ${progress.honestSolves} honest solves · best BR so far ${fmtBR(bestBR)}`
                : 'starting…'}
              {result?.cancelled ? ' · stopped early' : ''}
            </p>
          </>
        )}
      </div>

      {grids.length > 0 && (
        <div className="card">
          <h2>
            Best honest BR per grid <span className="hint">— where does the corrected maximum live?</span>
          </h2>
          <GridHeatmap grids={grids} maxN={maxN} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="card">
          <h2>
            Top chords by honest BR <span className="hint">— click a row to open it in the sandbox</span>
          </h2>
          <div className="table-scroll">
            <table className="results">
              <thead>
                <tr>
                  <th>grid</th>
                  <th>chord u → v</th>
                  <th>k</th>
                  <th>V_uv</th>
                  <th>b*</th>
                  <th>BR_rel</th>
                  <th>BR (honest)</th>
                  <th>z*</th>
                  <th>z̄</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((r, i) => (
                  <tr key={i} className={i === 0 ? 'best' : ''} onClick={() => loadRow(r)} style={{ cursor: 'pointer' }}>
                    <td>
                      {r.m}×{r.n}
                    </td>
                    <td className="mono">
                      ({r.u.i},{r.u.j}) → ({r.v.i},{r.v.j})
                    </td>
                    <td>{r.k}</td>
                    <td>{fmt(r.Vuv)}</td>
                    <td>{fmt(r.bStar)}</td>
                    <td>{fmtBR(r.BRrel)}</td>
                    <td>{fmtBR(r.BR)}</td>
                    <td>{fmt(r.zStar)}</td>
                    <td>{fmt(r.zbar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GridHeatmap({ grids, maxN }: { grids: GridSummary[]; maxN: number }) {
  const cell = 34;
  const pad = 30;
  const W = pad + maxN * cell + 8;
  const H = pad + maxN * cell + 8;
  let maxExcess = 1e-12;
  for (const g of grids) maxExcess = Math.max(maxExcess, g.bestBR - 1);
  const byKey = new Map(grids.map((g) => [`${g.m},${g.n}`, g]));
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: 520 }}>
        {Array.from({ length: maxN }, (_, mi) =>
          Array.from({ length: maxN }, (_, ni) => {
            const m = mi + 1;
            const n = ni + 1;
            const g = byKey.get(`${Math.min(m, n)},${Math.max(m, n)}`);
            if (!g) return null;
            const t = (g.bestBR - 1) / maxExcess;
            const pct = Math.round(Math.min(1, t) * 100);
            return (
              <g key={`${m}-${n}`}>
                <rect
                  x={pad + ni * cell}
                  y={pad + mi * cell}
                  width={cell - 2}
                  height={cell - 2}
                  rx={3}
                  fill={
                    g.bestBR <= 1 + 1e-12
                      ? 'var(--div-mid)'
                      : `color-mix(in oklab, var(--seq-100) ${100 - pct}%, var(--seq-700))`
                  }
                >
                  <title>{`${m}×${n}: best BR ${g.bestBR.toFixed(7)} (${g.candidates} candidates, ${g.solves} solves)`}</title>
                </rect>
              </g>
            );
          }),
        )}
        {Array.from({ length: maxN }, (_, i) => (
          <text key={`r${i}`} x={pad - 8} y={pad + i * cell + cell / 2 + 3} fontSize={10.5} textAnchor="end" fill="var(--text-muted)" className="mono">
            {i + 1}
          </text>
        ))}
        {Array.from({ length: maxN }, (_, i) => (
          <text key={`c${i}`} x={pad + i * cell + (cell - 2) / 2} y={pad - 8} fontSize={10.5} textAnchor="middle" fill="var(--text-muted)" className="mono">
            {i + 1}
          </text>
        ))}
        <text x={pad - 22} y={pad - 8} fontSize={10.5} fill="var(--text-secondary)">
          m\n
        </text>
      </svg>
      <p className="note">Darker = larger best honest BR; gray = no paradox found. Hover a cell for the exact value.</p>
    </div>
  );
}
