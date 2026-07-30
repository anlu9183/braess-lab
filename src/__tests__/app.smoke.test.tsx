// @vitest-environment jsdom
//
// Render smoke test: mount the whole app on the flagship preset, check the
// paper's headline numbers appear in the meters, flip the chord switch,
// switch to free-form mode and the gallery/research tabs. Catches runtime
// crashes the unit tests can't see.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App';

afterEach(cleanup);

// jsdom has no Worker; the research tab only constructs one on "run search".
vi.stubGlobal(
  'Worker',
  class {
    onmessage: unknown = null;
    postMessage() {}
    terminate() {}
  },
);

it('renders the flagship sandbox with the paper numbers', async () => {
  render(<App />);
  // BR meter shows the §3.4 honest ratio (stable to 6 decimals).
  expect(await screen.findByText(/1\.000326\d/)).toBeTruthy();
  // BR_rel meter shows the relaxation bound.
  expect(screen.getByText(/1\.020225\d/)).toBeTruthy();
  // Region label: equilibrium lies beyond the first breakpoint.
  expect(screen.getByText(/beyond breakpoint/)).toBeTruthy();
  // The three curve cards render.
  expect(screen.getByText(/orientation penalty/)).toBeTruthy();
  expect(screen.getByText(/Voltage-area criterion/)).toBeTruthy();
});

it('opens the chord switch and the paradox disappears', async () => {
  render(<App />);
  const switchBtn = await screen.findByText(/switch closed — chord live/);
  fireEvent.click(switchBtn);
  expect(await screen.findByText(/switch open — chord off/)).toBeTruthy();
  // With the chord off, BR meter goes blank.
  expect(screen.getByText('Braess ratio BR').parentElement!.textContent).toContain('—');
});

it('electrical relaxation view reports reversed roads', async () => {
  render(<App />);
  fireEvent.click(await screen.findByText('Electrical relaxation'));
  expect(await screen.findByText(/road\(s\) run backwards/)).toBeTruthy();
});

it('free-form mode starts as an empty worksheet and auto-assigns s/t', async () => {
  const { container } = render(<App />);
  fireEvent.click(await screen.findByText('Free-form'));
  expect(await screen.findByText('Empty worksheet')).toBeTruthy();
  // Place two nodes: they become source and sink automatically.
  fireEvent.click(screen.getByLabelText(/Add node/));
  const svg = container.querySelector('.canvas-frame svg')!;
  fireEvent.pointerDown(svg);
  fireEvent.pointerUp(svg);
  fireEvent.pointerDown(svg);
  fireEvent.pointerUp(svg);
  expect(container.querySelectorAll('[data-node]').length).toBe(2);
  // The first two nodes were auto-assigned as source and sink (s/t badges).
  const labels = Array.from(container.querySelectorAll('.canvas-frame svg text')).map((t) => t.textContent);
  expect(labels).toContain('s');
  expect(labels).toContain('t');
});

it('gallery loads the classic Braess network into free-form mode', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Gallery'));
  fireEvent.click(await screen.findByText('The classic Braess network'));
  // UE cost of the chorded classic network is 2.0
  expect(await screen.findByText('2')).toBeTruthy();
  expect(screen.getByText(/Price of anarchy/)).toBeTruthy();
});

it('braess scan flags the classic superhighway and the switch removes it', async () => {
  const { container } = render(<App />);
  fireEvent.click(screen.getByText('Gallery'));
  fireEvent.click(await screen.findByText('The classic Braess network'));
  await screen.findByText(/Price of anarchy/);

  fireEvent.click(screen.getByText('Scan 5 roads'));
  // The zero-cost chord 1 → 2 is the unique Braess road, BR = 4/3, shown in
  // both the scan list and the worst-road meter.
  expect(await screen.findByText('Braess!')).toBeTruthy();
  expect((await screen.findAllByText(/1\.33333/)).length).toBeGreaterThanOrEqual(2);

  // Flip its switch with the switch tool: total travel time falls to 1.5 and
  // the scan results go stale.
  fireEvent.click(screen.getByLabelText(/Road switch/));
  fireEvent.pointerDown(container.querySelector('[data-edge="4"]')!);
  expect(screen.getByText('Total travel time C(f)').parentElement!.textContent).toMatch(/1\.5/);
  expect(screen.getByText('Network changed — re-scan')).toBeTruthy();
});

it('gallery and research tabs render', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Gallery'));
  expect(await screen.findByText(/The classic Braess network/)).toBeTruthy();
  fireEvent.click(screen.getByText('Research'));
  expect(await screen.findByText(/Corrected-maximum search/)).toBeTruthy();
});

it('loading a gallery preset lands in the sandbox', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Gallery'));
  fireEvent.click(await screen.findByText('Only SE and NW chords can harm'));
  // Lens preset: 6x6 grid with the voltage lens enabled.
  expect(await screen.findByText(/Voltage lens/)).toBeTruthy();
});
