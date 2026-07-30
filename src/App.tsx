import { useEffect, useState } from 'react';
import GridSandbox from './components/GridSandbox';
import FreeformSandbox from './components/FreeformSandbox';
import GalleryTab from './components/GalleryTab';
import ResearchTab from './components/ResearchTab';
import { defaultSandbox } from './state/presets';
import { decodeShare, downloadJson, shareUrl } from './state/share';
import type { SandboxState, TabId } from './state/types';

export default function App() {
  const [tab, setTab] = useState<TabId>('sandbox');
  const [sandbox, setSandbox] = useState<SandboxState>(() => {
    const fromHash = window.location.hash.length > 1 ? decodeShare(window.location.hash.slice(1)) : null;
    return fromHash ?? defaultSandbox();
  });
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  const loadIntoSandbox = (state: SandboxState) => {
    setSandbox(state);
    setTab('sandbox');
  };

  const copyShare = async () => {
    const url = shareUrl(sandbox);
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // URL is already in the address bar via replaceState.
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Braess Lab</h1>
        <span className="sub">selfish routing on uniform affine grids — companion to Lu &amp; Miller</span>
        <nav className="tabs">
          {(
            [
              ['sandbox', 'Sandbox'],
              ['gallery', 'Gallery'],
              ['research', 'Research'],
            ] as Array<[TabId, string]>
          ).map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        {tab === 'sandbox' && (
          <>
            <button className="theme-toggle" onClick={copyShare}>
              {copied ? 'copied!' : 'share'}
            </button>
            <button className="theme-toggle" onClick={() => downloadJson(sandbox)}>
              json
            </button>
          </>
        )}
        <button
          className="theme-toggle"
          onClick={() => {
            const isDark =
              theme === 'dark' || (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
            setTheme(isDark ? 'light' : 'dark');
          }}
          aria-label="toggle theme"
        >
          ◐
        </button>
      </header>
      <main className="main">
        {tab === 'sandbox' &&
          (sandbox.mode === 'grid' ? (
            <GridSandbox state={sandbox} setState={setSandbox} />
          ) : (
            <FreeformSandbox state={sandbox} setState={setSandbox} />
          ))}
        {tab === 'gallery' && <GalleryTab loadIntoSandbox={loadIntoSandbox} />}
        {tab === 'research' && <ResearchTab loadIntoSandbox={loadIntoSandbox} />}
      </main>
    </div>
  );
}
