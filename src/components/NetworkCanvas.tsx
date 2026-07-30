// SVG network schematic, GeoGebra-style: a fixed-height viewport over an
// infinite dotted worksheet. Drag the background to pan, scroll to zoom at
// the cursor, ⛶ to re-fit. Edges are "roads" whose stroke width tracks flow;
// a chord renders as a curved wire with a circuit-switch glyph. Hovering an
// edge or node raises a probe tooltip (ammeter / voltmeter).

import { useEffect, useId, useRef, useState } from 'react';

export interface CanvasEdge {
  from: number;
  to: number;
}

export interface ChordVisual {
  from: number;
  to: number;
  flow: number;
  on: boolean;
  color: string;
}

export interface ProbeRow {
  label: string;
  value: string;
  color?: string;
}

interface Props {
  nodeCount: number;
  positions: Array<{ x: number; y: number }>;
  edges: CanvasEdge[];
  /** Signed flows (negative = against the road direction, only in overlay). */
  flows: ArrayLike<number> | null;
  source: number;
  sink: number;
  chord?: ChordVisual | null;
  onChordToggle?: () => void;
  selectedNode?: number | null;
  selectedEdge?: number | null;
  /** Node currently armed as the tail of a pending edge/chord. */
  pendingNode?: number | null;
  onNodeClick?: (idx: number) => void;
  onEdgeClick?: (idx: number) => void;
  onBackgroundClick?: (x: number, y: number) => void;
  onNodeDrag?: (idx: number, x: number, y: number) => void;
  nodeFill?: (idx: number) => string | null;
  nodeInfo?: (idx: number) => ProbeRow[];
  edgeInfo?: (idx: number) => ProbeRow[];
  /** Road whose switch is open: drawn muted with a switch-gap glyph. */
  edgeOff?: (idx: number) => boolean;
  /** Braess-flagged road: red halo + warning sign (from the edge scan). */
  edgeFlag?: (idx: number) => boolean;
  /** Color negative flows red and reverse their arrows (relaxation overlay). */
  signedView?: boolean;
  height?: number;
  /** When this value changes the view re-fits to the network. */
  fitKey?: unknown;
}

const UNIT = 72;
const PAD = 40;
const NODE_R = 7;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function NetworkCanvas(props: Props) {
  const { nodeCount, positions, edges, flows, source, sink, chord, signedView = false, height = 500 } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragNodeRef = useRef<number | null>(null);
  const panRef = useRef<{ px: number; py: number; box: Box; moved: boolean } | null>(null);
  const [view, setView] = useState<Box | null>(null);
  const [hover, setHover] = useState<{ rows: ProbeRow[]; x: number; y: number } | null>(null);
  const dotsId = useId().replace(/[^a-zA-Z0-9]/g, '');

  // World coordinates: unit position * UNIT.
  const wx = (x: number) => x * UNIT;
  const wy = (y: number) => y * UNIT;

  let minX = 0;
  let minY = 0;
  let maxX = 1;
  let maxY = 1;
  for (let i = 0; i < nodeCount; i++) {
    const p = positions[i];
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const worldBox: Box = {
    x: wx(minX) - PAD,
    y: wy(minY) - PAD,
    w: (maxX - minX) * UNIT + 2 * PAD,
    h: (maxY - minY) * UNIT + 2 * PAD,
  };

  const fitBox = (): Box => {
    const frame = frameRef.current;
    const cw = frame?.clientWidth ?? 0;
    const ch = frame?.clientHeight ?? 0;
    if (cw <= 0 || ch <= 0) return worldBox;
    const ca = cw / ch;
    const wa = worldBox.w / worldBox.h;
    if (ca >= wa) {
      const w = worldBox.h * ca;
      return { x: worldBox.x - (w - worldBox.w) / 2, y: worldBox.y, w, h: worldBox.h };
    }
    const h = worldBox.w / ca;
    return { x: worldBox.x, y: worldBox.y - (h - worldBox.h) / 2, w: worldBox.w, h };
  };

  const box = view ?? fitBox();
  const boxRef = useRef(box);
  boxRef.current = box;
  const fitWRef = useRef(worldBox.w);
  fitWRef.current = Math.max(worldBox.w, 1);

  // Fit once on mount / when the network identity changes; afterwards the
  // view is FROZEN (GeoGebra-style) — dragging a vertex or adding nodes never
  // rescales it. Re-fitting is always an explicit act (⛶ or a new fitKey).
  const fitBoxRef = useRef(fitBox);
  fitBoxRef.current = fitBox;
  const measuredRef = useRef(false);
  const doFit = () => {
    const frame = frameRef.current;
    measuredRef.current = !!frame && frame.clientWidth > 0 && frame.clientHeight > 0;
    setView(fitBoxRef.current());
  };
  const doFitRef = useRef(doFit);
  doFitRef.current = doFit;
  useEffect(() => {
    doFitRef.current();
  }, [props.fitKey]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !frameRef.current) return;
    // Only used to complete the initial fit if the frame wasn't laid out yet.
    const ro = new ResizeObserver(() => {
      if (!measuredRef.current) doFitRef.current();
    });
    ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, []);

  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const b = boxRef.current;
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: b.x + ((clientX - rect.left) / rect.width) * b.w,
      y: b.y + ((clientY - rect.top) / rect.height) * b.h,
    };
  };

  const zoomAt = (worldX: number, worldY: number, factor: number) => {
    const b = boxRef.current;
    const w = Math.min(Math.max(b.w * factor, fitWRef.current / 10), fitWRef.current * 5);
    const scale = w / b.w;
    setView({
      x: worldX - (worldX - b.x) * scale,
      y: worldY - (worldY - b.y) * scale,
      w,
      h: b.h * scale,
    });
  };

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pt = toWorld(e.clientX, e.clientY);
      zoomAt(pt.x, pt.y, e.deltaY > 0 ? 1.13 : 1 / 1.13);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let maxFlow = 1e-12;
  if (flows) {
    for (let e = 0; e < edges.length; e++) maxFlow = Math.max(maxFlow, Math.abs(flows[e]));
    if (chord) maxFlow = Math.max(maxFlow, Math.abs(chord.flow));
  }

  const widthFor = (f: number) => 1.2 + 2.6 * (Math.abs(f) / maxFlow);
  const colorFor = (f: number) => {
    if (signedView && f < -1e-9) return 'var(--series-8)';
    if (Math.abs(f) < 1e-9 * maxFlow + 1e-12) return 'var(--baseline)';
    const t = Math.min(1, Math.abs(f) / maxFlow);
    return `color-mix(in oklab, var(--seq-250) ${Math.round((1 - t) * 100)}%, var(--seq-700))`;
  };

  const showProbe = (evt: React.PointerEvent, rows: ProbeRow[]) => {
    if (panRef.current?.moved || dragNodeRef.current !== null) return;
    const rect = frameRef.current!.getBoundingClientRect();
    setHover({
      rows,
      x: Math.min(evt.clientX - rect.left + 14, Math.max(rect.width - 165, 0)),
      y: evt.clientY - rect.top + 12,
    });
  };

  const isBackground = (target: EventTarget) =>
    target === svgRef.current || (target instanceof Element && target.getAttribute('data-bg') === '1');

  const arrow = (x1: number, y1: number, x2: number, y2: number, w: number, color: string, frac = 0.56) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const ax = x1 + dx * frac;
    const ay = y1 + dy * frac;
    const s = 3 + w * 0.8;
    const p1 = `${ax + ux * s},${ay + uy * s}`;
    const p2 = `${ax - ux * s * 0.6 - uy * s * 0.7},${ay - uy * s * 0.6 + ux * s * 0.7}`;
    const p3 = `${ax - ux * s * 0.6 + uy * s * 0.7},${ay - uy * s * 0.6 - ux * s * 0.7}`;
    return <polygon points={`${p1} ${p2} ${p3}`} fill={color} />;
  };

  return (
    <div className="canvas-frame" ref={frameRef} style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
        onPointerDown={(evt) => {
          if (!isBackground(evt.target)) return;
          panRef.current = { px: evt.clientX, py: evt.clientY, box: boxRef.current, moved: false };
          svgRef.current?.setPointerCapture?.(evt.pointerId);
        }}
        onPointerMove={(evt) => {
          if (dragNodeRef.current !== null && props.onNodeDrag) {
            // Clamp to the (frozen) view so a dragged vertex stops at the
            // frame edge instead of escaping and forcing a rescale.
            const pt = toWorld(evt.clientX, evt.clientY);
            const b = boxRef.current;
            const m = NODE_R * 2;
            const x = Math.min(Math.max(pt.x, b.x + m), b.x + b.w - m);
            const y = Math.min(Math.max(pt.y, b.y + m), b.y + b.h - m);
            props.onNodeDrag(dragNodeRef.current, x / UNIT, y / UNIT);
            return;
          }
          const pan = panRef.current;
          if (pan) {
            const dxPx = evt.clientX - pan.px;
            const dyPx = evt.clientY - pan.py;
            if (!pan.moved && Math.hypot(dxPx, dyPx) < 4) return;
            pan.moved = true;
            const rect = svgRef.current!.getBoundingClientRect();
            setView({
              x: pan.box.x - (dxPx / rect.width) * pan.box.w,
              y: pan.box.y - (dyPx / rect.height) * pan.box.h,
              w: pan.box.w,
              h: pan.box.h,
            });
          }
        }}
        onPointerUp={(evt) => {
          dragNodeRef.current = null;
          const pan = panRef.current;
          panRef.current = null;
          if (pan && !pan.moved && props.onBackgroundClick && isBackground(evt.target)) {
            const pt = toWorld(evt.clientX, evt.clientY);
            props.onBackgroundClick(pt.x / UNIT, pt.y / UNIT);
          }
        }}
        onPointerLeave={() => {
          panRef.current = null;
        }}
      >
        <defs>
          <pattern id={`dots-${dotsId}`} patternUnits="userSpaceOnUse" width={UNIT / 2} height={UNIT / 2}>
            <circle cx={1.2} cy={1.2} r={1.2} fill="var(--gridline)" />
          </pattern>
        </defs>
        {/* worksheet background: pans/zooms with the world */}
        <rect
          data-bg="1"
          x={box.x - box.w}
          y={box.y - box.h}
          width={box.w * 3}
          height={box.h * 3}
          fill={`url(#dots-${dotsId})`}
        />

        {/* roads */}
        {edges.map((e, i) => {
          const a = positions[e.from];
          const b = positions[e.to];
          if (!a || !b) return null;
          const off = props.edgeOff?.(i) ?? false;
          const flag = !off && (props.edgeFlag?.(i) ?? false);
          const f = flows ? flows[i] : 0;
          const w = off ? 1.6 : flows ? widthFor(f) : 2;
          const color = off ? 'var(--text-muted)' : flows ? colorFor(f) : 'var(--baseline)';
          const x1 = wx(a.x);
          const y1 = wy(a.y);
          const x2 = wx(b.x);
          const y2 = wy(b.y);
          const rev = signedView && f < -1e-9;
          const selected = props.selectedEdge === i;
          // Open-switch glyph geometry (same as the chord's, on a straight road).
          const lerp = (t: number) => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
          const c1 = lerp(0.42);
          const c2 = lerp(0.58);
          const lrad = (-38 * Math.PI) / 180;
          const lever = {
            x: c1.x + (c2.x - c1.x) * Math.cos(lrad) - (c2.y - c1.y) * Math.sin(lrad),
            y: c1.y + (c2.x - c1.x) * Math.sin(lrad) + (c2.y - c1.y) * Math.cos(lrad),
          };
          // Warning sign offset off the road along its normal.
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const sx = (x1 + x2) / 2 - ((y2 - y1) / len) * 12;
          const sy = (y1 + y2) / 2 + ((x2 - x1) / len) * 12;
          return (
            <g
              key={`e${i}`}
              data-edge={i}
              onPointerEnter={(evt) => props.edgeInfo && showProbe(evt, props.edgeInfo(i))}
              onPointerMove={(evt) => props.edgeInfo && showProbe(evt, props.edgeInfo(i))}
              onPointerLeave={() => setHover(null)}
              onPointerDown={(evt) => {
                evt.stopPropagation();
                props.onEdgeClick?.(i);
              }}
              style={{ cursor: props.onEdgeClick ? 'pointer' : 'default' }}
            >
              {/* fat invisible hit target */}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
              {off ? (
                <>
                  <line x1={x1} y1={y1} x2={c1.x} y2={c1.y} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={0.65} />
                  <line x1={c2.x} y1={c2.y} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={0.65} />
                  <line x1={c1.x} y1={c1.y} x2={lever.x} y2={lever.y} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
                  <circle cx={c1.x} cy={c1.y} r={2.6} fill={color} stroke="var(--surface-1)" strokeWidth={1.2} />
                  <circle cx={c2.x} cy={c2.y} r={2.6} fill={color} stroke="var(--surface-1)" strokeWidth={1.2} />
                </>
              ) : (
                <>
                  {flag && (
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--series-8)" strokeWidth={w + 5} strokeLinecap="round" opacity={0.22} />
                  )}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={0.92} />
                  {selected && (
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent)" strokeWidth={Math.max(w + 3, 5)} strokeLinecap="round" opacity={0.25} />
                  )}
                  {rev ? arrow(x2, y2, x1, y1, w, color) : arrow(x1, y1, x2, y2, w, color)}
                  {flag && (
                    <g pointerEvents="none">
                      <path
                        d={`M${sx},${sy - 5.4} L${sx - 5.2},${sy + 3.6} L${sx + 5.2},${sy + 3.6} Z`}
                        fill="var(--series-8)"
                        stroke="var(--series-8)"
                        strokeWidth={2.4}
                        strokeLinejoin="round"
                      />
                      <text x={sx} y={sy + 2.8} textAnchor="middle" fontSize={7.2} fontWeight={800} fill="var(--surface-1)">
                        !
                      </text>
                    </g>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* chord: curved wire with a switch glyph */}
        {chord &&
          (() => {
            const a = positions[chord.from];
            const b = positions[chord.to];
            if (!a || !b) return null;
            const x1 = wx(a.x);
            const y1 = wy(a.y);
            const x2 = wx(b.x);
            const y2 = wy(b.y);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const bow = Math.min(46, len * 0.22);
            const cx = mx + nx * bow;
            const cy = my + ny * bow;
            const w = chord.on ? Math.max(2, widthFor(chord.flow)) : 2;
            const color = chord.on ? chord.color : 'var(--text-muted)';
            const qp = (t: number) => ({
              x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2,
              y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2,
            });
            const c1 = qp(0.42);
            const c2 = qp(0.58);
            const leverAngle = chord.on ? 0 : -38;
            const lrad = (leverAngle * Math.PI) / 180;
            const ldx = c2.x - c1.x;
            const ldy = c2.y - c1.y;
            const lever = {
              x: c1.x + ldx * Math.cos(lrad) - ldy * Math.sin(lrad),
              y: c1.y + ldx * Math.sin(lrad) + ldy * Math.cos(lrad),
            };
            return (
              <g
                onPointerEnter={(evt) =>
                  showProbe(evt, [
                    { label: chord.on ? 'Chord (switch closed)' : 'Chord (switch open)', value: '' },
                    { label: 'flow z', value: chord.on ? chord.flow.toPrecision(4) : '—' },
                    { label: 'click switch', value: 'toggle' },
                  ])
                }
                onPointerLeave={() => setHover(null)}
              >
                <path
                  d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={w}
                  strokeLinecap="round"
                  opacity={chord.on ? 0.95 : 0.6}
                />
                {chord.on && arrow(qp(0.7).x, qp(0.7).y, qp(0.78).x, qp(0.78).y, w, color, 1)}
                <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke="var(--surface-1)" strokeWidth={w + 6} strokeLinecap="round" />
                <g
                  onPointerDown={(evt) => {
                    evt.stopPropagation();
                    props.onChordToggle?.();
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={mx} cy={my} r={16} fill="transparent" />
                  <line x1={c1.x} y1={c1.y} x2={lever.x} y2={lever.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
                  <circle cx={c1.x} cy={c1.y} r={3} fill={color} stroke="var(--surface-1)" strokeWidth={1.5} />
                  <circle cx={c2.x} cy={c2.y} r={3} fill={color} stroke="var(--surface-1)" strokeWidth={1.5} />
                </g>
              </g>
            );
          })()}

        {/* nodes */}
        {Array.from({ length: nodeCount }, (_, i) => {
          const p = positions[i];
          if (!p) return null;
          const isS = i === source;
          const isT = i === sink;
          const custom = props.nodeFill?.(i) ?? null;
          const fill = custom ?? (isS || isT ? 'var(--accent)' : 'var(--surface-1)');
          const selected = props.selectedNode === i;
          const pending = props.pendingNode === i;
          return (
            <g
              key={`n${i}`}
              data-node={i}
              onPointerEnter={(evt) => props.nodeInfo && showProbe(evt, props.nodeInfo(i))}
              onPointerMove={(evt) => props.nodeInfo && showProbe(evt, props.nodeInfo(i))}
              onPointerLeave={() => setHover(null)}
              onPointerDown={(evt) => {
                evt.stopPropagation();
                if (props.onNodeDrag) {
                  dragNodeRef.current = i;
                  svgRef.current?.setPointerCapture?.(evt.pointerId);
                }
                props.onNodeClick?.(i);
              }}
              style={{ cursor: props.onNodeClick || props.onNodeDrag ? 'pointer' : 'default' }}
            >
              <circle cx={wx(p.x)} cy={wy(p.y)} r={14} fill="transparent" />
              {(selected || pending) && (
                <circle cx={wx(p.x)} cy={wy(p.y)} r={NODE_R + 4.5} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={pending ? 0.9 : 0.5} strokeDasharray={pending ? '4 3' : undefined} />
              )}
              <circle cx={wx(p.x)} cy={wy(p.y)} r={NODE_R} fill={fill} stroke={selected || pending ? 'var(--accent)' : 'var(--baseline)'} strokeWidth={selected ? 2.5 : 1.2} />
              {(isS || isT) && (
                <text x={wx(p.x) + (isS ? -17 : 13)} y={wy(p.y) + 4} fontSize={13} fontWeight={650} fill="var(--text-primary)">
                  {isS ? 's' : 't'}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="zoom-controls">
        <button
          type="button"
          aria-label="zoom in"
          onClick={() => zoomAt(boxRef.current.x + boxRef.current.w / 2, boxRef.current.y + boxRef.current.h / 2, 1 / 1.3)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="zoom out"
          onClick={() => zoomAt(boxRef.current.x + boxRef.current.w / 2, boxRef.current.y + boxRef.current.h / 2, 1.3)}
        >
          −
        </button>
        <button type="button" aria-label="fit view" onClick={doFit}>
          ⛶
        </button>
      </div>

      {hover && (
        <div className="chart-tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.rows.map((r, i) =>
            r.value === '' ? (
              <div className="tt-x" key={i}>
                {r.label}
              </div>
            ) : (
              <div className="tt-row" key={i}>
                {r.color && <span className="tt-key" style={{ borderTopColor: r.color }} />}
                <span className="tt-name">{r.label}</span>
                <span className="tt-val">{r.value}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
