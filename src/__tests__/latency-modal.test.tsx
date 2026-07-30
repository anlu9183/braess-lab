// @vitest-environment jsdom
//
// The mandatory latency dialog: drawing an edge in free-form mode must open
// it, cancelling must not create the edge, confirming must create the edge
// with the entered coefficients. Same flow for grid chords.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App';

afterEach(cleanup);

vi.stubGlobal(
  'Worker',
  class {
    onmessage: unknown = null;
    postMessage() {}
    terminate() {}
  },
);

// The free-form default is an empty worksheet, so tests that need nodes load
// the classic Braess network from the gallery.
async function openFreeform() {
  const utils = render(<App />);
  fireEvent.click(screen.getByText('Gallery'));
  fireEvent.click(await screen.findByText('The classic Braess network'));
  await screen.findByText(/Price of anarchy/);
  return utils;
}

function nodeEl(container: HTMLElement, idx: number): Element {
  const el = container.querySelector(`[data-node="${idx}"]`);
  expect(el).toBeTruthy();
  return el!;
}

it('drawing an edge opens the mandatory latency dialog and confirming creates it', async () => {
  const { container } = await openFreeform();
  const before = container.querySelectorAll('[data-edge]').length;

  fireEvent.click(screen.getByLabelText(/Add edge/));
  fireEvent.pointerDown(nodeEl(container, 0));
  fireEvent.pointerDown(nodeEl(container, 3));

  // Modal is up, edge not yet created.
  expect(await screen.findByText('New edge 0 → 3')).toBeTruthy();
  expect(container.querySelectorAll('[data-edge]').length).toBe(before);

  fireEvent.change(screen.getByLabelText('slope a'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('intercept b'), { target: { value: '0.5' } });
  fireEvent.click(screen.getByText('Add edge', { selector: 'button' }));

  expect(container.querySelectorAll('[data-edge]').length).toBe(before + 1);
  expect(screen.queryByText('New edge 0 → 3')).toBeNull();
});

it('cancelling the latency dialog discards the pending edge', async () => {
  const { container } = await openFreeform();
  const before = container.querySelectorAll('[data-edge]').length;

  fireEvent.click(screen.getByLabelText(/Add edge/));
  fireEvent.pointerDown(nodeEl(container, 0));
  fireEvent.pointerDown(nodeEl(container, 3));
  await screen.findByText('New edge 0 → 3');
  fireEvent.click(screen.getByText('Cancel'));

  expect(container.querySelectorAll('[data-edge]').length).toBe(before);
});

it('placing a grid chord via the toolbar ends in the c,d dialog', async () => {
  const { container } = render(<App />);
  await screen.findByText(/1\.000326\d/);

  fireEvent.click(screen.getByLabelText(/Place chord/));
  fireEvent.pointerDown(nodeEl(container, 0));
  const last = container.querySelectorAll('[data-node]').length - 1;
  fireEvent.pointerDown(nodeEl(container, last));

  expect(await screen.findByText(/^Chord \(0,0\)/)).toBeTruthy();
  expect(screen.getByLabelText('slope c')).toBeTruthy();
  fireEvent.click(screen.getByText('Wire in chord'));
  // Chord committed: the switch button reports the chord live.
  expect(await screen.findByText(/switch closed — chord live/)).toBeTruthy();
});
