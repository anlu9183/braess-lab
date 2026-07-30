// Share/persist sandbox state via a base64url JSON fragment in the URL hash,
// plus a JSON file download.

import type { SandboxState } from './types';
import { defaultSandbox } from './presets';

export function encodeShare(state: SandboxState): string {
  const json = JSON.stringify(state);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(hash: string): SandboxState | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SandboxState;
    if (!parsed || typeof parsed !== 'object') return null;
    // Merge over defaults so missing fields from older links stay valid.
    const base = defaultSandbox();
    return {
      ...base,
      ...parsed,
      spec: { ...base.spec, ...parsed.spec },
      chord: { ...base.chord, ...parsed.chord },
      freeform: parsed.freeform ?? base.freeform,
    };
  } catch {
    return null;
  }
}

export function shareUrl(state: SandboxState): string {
  const url = new URL(window.location.href);
  url.hash = encodeShare(state);
  return url.toString();
}

export function downloadJson(state: SandboxState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'braess-lab-network.json';
  a.click();
  URL.revokeObjectURL(url);
}
