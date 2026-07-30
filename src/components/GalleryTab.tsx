// Demo gallery: preset scenes reproducing the paper's results. Each card
// loads a full sandbox configuration and jumps to the sandbox tab.

import { presets } from '../state/presets';
import type { SandboxState } from '../state/types';

interface Props {
  loadIntoSandbox: (state: SandboxState) => void;
}

export default function GalleryTab({ loadIntoSandbox }: Props) {
  return (
    <div className="column">
      <div className="card">
        <h2>
          Demo gallery <span className="hint">— the paper, interactive. Click a card to load it into the sandbox.</span>
        </h2>
        <p className="note">
          Each preset reproduces a result from “Braess' Paradox in Uniform Affine Grid Networks”
          (Lu &amp; Miller). The flagship 4×10 numbers double as the app's regression tests: R_st ≈ 3.2203,
          V_uv ≈ −0.30417, R_uv ≈ 1.3842, z̄ ≈ 0.046, z* ≈ 0.3798, BR ≈ 1.0003262 vs BR_rel ≈ 1.0202259.
        </p>
      </div>
      <div className="gallery">
        {presets.map((p) => (
          <button key={p.id} className="preset-card" onClick={() => loadIntoSandbox(p.state())}>
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
            <span className="ref">{p.ref}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
