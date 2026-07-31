// Reusable SVG line chart: 2px lines, hairline solid gridlines, shaded
// washes, vertical annotation lines, >=8px markers with a surface ring,
// legend for >=2 series, and a crosshair tooltip listing every series.

import { useMemo, useRef, useState } from 'react';

export interface Series {
  name: string;
  color: string; // CSS color (var(--series-n))
  points: Array<{ x: number; y: number }>;
  width?: number;
}

export interface Region {
  /** Polygon in data coordinates (closed automatically). */
  polygon: Array<{ x: number; y: number }>;
  fill: string;
  opacity?: number;
}

export interface VLine {
  x: number;
  label: string;
}

export interface Marker {
  x: number;
  y: number;
  color: string;
  label?: string;
}

interface Props {
  series: Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  regions?: Region[];
  vlines?: VLine[];
  markers?: Marker[];
  yFormat?: (v: number) => string;
  xFormat?: (v: number) => string;
  /** Symbol shown in the crosshair tooltip before the x value (default "z"). */
  tipXLabel?: string;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(isFinite(min) && isFinite(max)) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

const defaultFormat = (v: number): string => {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, '');
  if (a >= 0.01) return parseFloat(v.toFixed(4)).toString();
  return v.toExponential(1);
};

export default function LineChart({
  series,
  height = 220,
  xLabel,
  yLabel,
  regions = [],
  vlines = [],
  markers = [],
  yFormat = defaultFormat,
  xFormat = defaultFormat,
  tipXLabel = 'z',
}: Props) {
  const width = 560;
  const pad = { l: 54, r: 14, t: 12, b: 34 };
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ px: number; py: number; x: number } | null>(null);

  const { x0, x1, y0, y1 } = useMemo(() => {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    const consider = (x: number, y: number) => {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    };
    for (const s of series) for (const p of s.points) consider(p.x, p.y);
    for (const r of regions) for (const p of r.polygon) consider(p.x, p.y);
    for (const m of markers) consider(m.x, m.y);
    if (!isFinite(xMin)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    return { x0: xMin, x1: xMax, y0: yMin - yPad, y1: yMax + yPad };
  }, [series, regions, markers]);

  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const sy = (y: number) => height - pad.b - ((y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);

  const xTicks = niceTicks(x0, x1, 5);
  const yTicks = niceTicks(y0, y1, 4);

  const path = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ');

  const onMove = (evt: React.PointerEvent<SVGSVGElement>) => {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * width;
    if (px < pad.l || px > width - pad.r) {
      setHover(null);
      return;
    }
    // Snap to the nearest sample x of the first (densest) series.
    const dataX = x0 + ((px - pad.l) / (width - pad.l - pad.r)) * (x1 - x0);
    let bestX = dataX;
    let bestDist = Infinity;
    for (const s of series) {
      for (const p of s.points) {
        const d = Math.abs(p.x - dataX);
        if (d < bestDist) {
          bestDist = d;
          bestX = p.x;
        }
      }
    }
    setHover({ px: sx(bestX), py: ((evt.clientY - rect.top) / rect.height) * height, x: bestX });
  };

  const hoverRows = useMemo(() => {
    if (!hover) return [];
    return series
      .map((s) => {
        let best: { x: number; y: number } | null = null;
        let bestDist = Infinity;
        for (const p of s.points) {
          const d = Math.abs(p.x - hover.x);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        return best ? { name: s.name, color: s.color, y: best.y } : null;
      })
      .filter((r): r is { name: string; color: string; y: number } => r !== null);
  }, [hover, series]);

  return (
    <div className="chart-box" ref={boxRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Line chart of ${series.map((s) => s.name).join(', ')}${
          xLabel ? ` versus ${xLabel}` : ''
        }`}
      >
        {/* gridlines */}
        {yTicks.map((t) => (
          <line
            key={`gy${t}`}
            x1={pad.l}
            x2={width - pad.r}
            y1={sy(t)}
            y2={sy(t)}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}
        {/* shaded regions */}
        {regions.map((r, i) => (
          <polygon
            key={`r${i}`}
            points={r.polygon.map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ')}
            fill={r.fill}
            opacity={r.opacity ?? 0.1}
          />
        ))}
        {/* axes */}
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="var(--baseline)" strokeWidth={1} />
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={height - pad.b} stroke="var(--baseline)" strokeWidth={1} />
        {y0 < 0 && y1 > 0 && (
          <line x1={pad.l} x2={width - pad.r} y1={sy(0)} y2={sy(0)} stroke="var(--baseline)" strokeWidth={1} />
        )}
        {/* ticks */}
        {xTicks.map((t) => (
          <text key={`tx${t}`} x={sx(t)} y={height - pad.b + 16} fontSize={11} fill="var(--text-muted)" textAnchor="middle" className="mono">
            {xFormat(t)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`ty${t}`} x={pad.l - 7} y={sy(t) + 4} fontSize={11} fill="var(--text-muted)" textAnchor="end" className="mono">
            {yFormat(t)}
          </text>
        ))}
        {xLabel && (
          <text x={(pad.l + width - pad.r) / 2} y={height - 4} fontSize={11.5} fill="var(--text-secondary)" textAnchor="middle">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={12} y={pad.t + 2} fontSize={11.5} fill="var(--text-secondary)">
            {yLabel}
          </text>
        )}
        {/* annotation vlines */}
        {vlines.map((v, i) => (
          <g key={`v${i}`}>
            <line x1={sx(v.x)} x2={sx(v.x)} y1={pad.t} y2={height - pad.b} stroke="var(--text-muted)" strokeWidth={1} />
            <text x={sx(v.x) + 4} y={pad.t + 11} fontSize={10.5} fill="var(--text-secondary)">
              {v.label}
            </text>
          </g>
        ))}
        {/* series */}
        {series.map((s) => (
          <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* markers */}
        {markers.map((mk, i) => (
          <g key={`m${i}`}>
            <circle cx={sx(mk.x)} cy={sy(mk.y)} r={6} fill={mk.color} stroke="var(--surface-1)" strokeWidth={2} />
            {mk.label && (
              <text x={sx(mk.x) + 9} y={sy(mk.y) - 7} fontSize={11} fill="var(--text-secondary)">
                {mk.label}
              </text>
            )}
          </g>
        ))}
        {/* crosshair */}
        {hover && (
          <line x1={hover.px} x2={hover.px} y1={pad.t} y2={height - pad.b} stroke="var(--text-muted)" strokeWidth={1} />
        )}
      </svg>
      {hover && hoverRows.length > 0 && boxRef.current && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min((hover.px / width) * boxRef.current.clientWidth + 12, boxRef.current.clientWidth - 150),
            top: 8,
          }}
        >
          <div className="tt-x mono">{tipXLabel} = {xFormat(hover.x)}</div>
          {hoverRows.map((r) => (
            <div className="tt-row" key={r.name}>
              <span className="tt-key" style={{ borderTopColor: r.color }} />
              <span className="tt-name">{r.name}</span>
              <span className="tt-val">{yFormat(r.y)}</span>
            </div>
          ))}
        </div>
      )}
      {series.length >= 2 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <span className="key" style={{ borderTopColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
