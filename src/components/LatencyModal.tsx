// Mandatory latency dialog: shown whenever a new edge / chord is created
// (and reusable for editing). Confirm with Enter, cancel with Escape.

import { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  /** Variable names for the two coefficients, e.g. ['a', 'b'] or ['c', 'd']. */
  varNames?: [string, string];
  initialA: number;
  initialB: number;
  confirmLabel?: string;
  onConfirm: (a: number, b: number) => void;
  onCancel: () => void;
}

export default function LatencyModal({
  title,
  subtitle,
  varNames = ['a', 'b'],
  initialA,
  initialB,
  confirmLabel = 'Add edge',
  onConfirm,
  onCancel,
}: Props) {
  const [a, setA] = useState(String(initialA));
  const [b, setB] = useState(String(initialB));
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const aNum = parseFloat(a);
  const bNum = parseFloat(b);
  const valid = isFinite(aNum) && isFinite(bNum) && aNum >= 0 && bNum >= 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid) onConfirm(aNum, bNum);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit}>
        <h3>{title}</h3>
        {subtitle && <p className="note">{subtitle}</p>}
        <div className="latency-preview mono">
          ℓ(x) = {valid ? `${trim(aNum)}·x${bNum > 0 ? ` + ${trim(bNum)}` : ''}` : '…'}
        </div>
        <div className="control-row">
          <label>slope {varNames[0]}</label>
          <input
            ref={firstRef}
            type="number"
            min={0}
            step="any"
            value={a}
            onChange={(e) => setA(e.target.value)}
            aria-label={`slope ${varNames[0]}`}
          />
        </div>
        <div className="control-row">
          <label>intercept {varNames[1]}</label>
          <input
            type="number"
            min={0}
            step="any"
            value={b}
            onChange={(e) => setB(e.target.value)}
            aria-label={`intercept ${varNames[1]}`}
          />
        </div>
        {!valid && <p className="note" style={{ color: 'var(--status-critical)' }}>Both coefficients must be numbers ≥ 0.</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function trim(v: number): string {
  return parseFloat(v.toPrecision(6)).toString();
}
