// GeoGebra-style chrome around the canvas: a slim top bar carrying the
// sandbox mode switch and a live hint, plus a vertical ToolRail of large
// icon buttons that sits on the left edge of the canvas.

export type IconName =
  | 'select'
  | 'add-node'
  | 'add-edge'
  | 'delete'
  | 'chord'
  | 'switch'
  | 'lens'
  | 'probe'
  | 'bolt'
  | 'flow';

export interface ToolDef {
  id: string;
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface TopBarProps {
  mode: 'grid' | 'freeform';
  onMode: (mode: 'grid' | 'freeform') => void;
  hint?: string;
}

export default function CanvasToolbar({ mode, onMode, hint }: TopBarProps) {
  return (
    <div className="toolbar">
      <div className="seg">
        <button className={mode === 'grid' ? 'active' : ''} onClick={() => onMode('grid')}>
          Grid
        </button>
        <button className={mode === 'freeform' ? 'active' : ''} onClick={() => onMode('freeform')}>
          Free-form
        </button>
      </div>
      {hint && <span className="toolbar-hint">{hint}</span>}
    </div>
  );
}

export function ToolRail({ tools }: { tools: ToolDef[] }) {
  return (
    <div className="tool-rail" role="toolbar" aria-orientation="vertical">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool-btn large ${t.active ? 'active' : ''}`}
          disabled={t.disabled}
          onClick={t.onClick}
          title={t.label}
          aria-label={t.label}
          aria-pressed={t.active}
        >
          <Icon name={t.icon} size={24} />
        </button>
      ))}
    </div>
  );
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const s = {
    stroke: 'currentColor',
    strokeWidth: 1.6,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'select':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M4 2 L14 9.5 L9.5 10.5 L12 15.5 L9.8 16.5 L7.4 11.5 L4 14.5 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'add-node':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="7" cy="10" r="4" {...s} />
          <path d="M13 3 v6 M10 6 h6" {...s} />
        </svg>
      );
    case 'add-edge':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="4" cy="14" r="2.4" {...s} />
          <circle cx="14" cy="4" r="2.4" {...s} />
          <path d="M6 12 L12 6 M12 6 l-3.4 0.6 M12 6 l-0.6 3.4" {...s} />
        </svg>
      );
    case 'delete':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M4 5 h10 M7 5 V3.5 h4 V5 M5.5 5 l0.7 9.5 h5.6 L12.5 5 M7.8 7.5 v5 M10.2 7.5 v5" {...s} />
        </svg>
      );
    case 'chord':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="3.5" cy="14.5" r="2" {...s} />
          <circle cx="14.5" cy="3.5" r="2" {...s} />
          <path d="M5 13 Q 3 6 9 5.5" {...s} />
          <path d="M11.5 5.2 L13 4.6" {...s} strokeWidth={2} />
        </svg>
      );
    case 'switch':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M1 12.5 h2 M15 12.5 h2" {...s} />
          <circle cx="4.6" cy="12.5" r="1.7" {...s} />
          <circle cx="13.4" cy="12.5" r="1.7" {...s} />
          <path d="M6 11.3 L12 5.5" {...s} strokeWidth={2} />
        </svg>
      );
    case 'lens':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="6" {...s} />
          <circle cx="9" cy="9" r="2.6" {...s} />
          <circle cx="9" cy="9" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'probe':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="7.5" cy="7.5" r="4.5" {...s} />
          <path d="M11 11 L15.5 15.5" {...s} strokeWidth={2} />
        </svg>
      );
    case 'bolt':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M10 2 L4.5 10 H8.5 L7.5 16 L13.5 8 H9.5 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'flow':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M2.5 5 h9 M11.5 5 l-2.6 -1.8 M11.5 5 l-2.6 1.8" {...s} />
          <path d="M2.5 12.5 h11.5 M14 12.5 l-2.6 -1.8 M14 12.5 l-2.6 1.8" {...s} strokeWidth={2.6} />
        </svg>
      );
  }
}
