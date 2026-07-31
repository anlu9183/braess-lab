// Stat tiles (dashboard meters): label + value, optional signed delta whose
// color encodes direction x goodness, per the stat-tile contract.

export interface Tile {
  label: string;
  value: string;
  delta?: { text: string; tone: 'good' | 'bad' | 'neutral' };
  /** Plain-language explanation shown on hover / to assistive tech. */
  hint?: string;
}

export default function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div className="tile" key={t.label} title={t.hint}>
          <div className="label">
            {t.label}
            {t.hint && (
              <span className="tile-info" aria-hidden="true">
                {' '}ⓘ
              </span>
            )}
          </div>
          <div className="value">{t.value}</div>
          {t.delta && <div className={`delta ${t.delta.tone}`}>{t.delta.text}</div>}
        </div>
      ))}
    </div>
  );
}
