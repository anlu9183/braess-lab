// Stat tiles (dashboard meters): label + value, optional signed delta whose
// color encodes direction x goodness, per the stat-tile contract.

export interface Tile {
  label: string;
  value: string;
  delta?: { text: string; tone: 'good' | 'bad' | 'neutral' };
}

export default function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <div className="label">{t.label}</div>
          <div className="value">{t.value}</div>
          {t.delta && <div className={`delta ${t.delta.tone}`}>{t.delta.text}</div>}
        </div>
      ))}
    </div>
  );
}
