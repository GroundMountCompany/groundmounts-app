'use client';

/**
 * Registry connecting the single long-lived map to whichever step wants to show
 * it right now.
 *
 * The map instance is created once, above the step router, and never unmounted
 * mid-funnel. Steps render a <MapSlot />; the stage positions the real canvas
 * over that slot's rectangle. This is what lets the map keep its camera, layers
 * and WebGL context across step changes instead of being torn down and rebuilt.
 */

let slot: HTMLElement | null = null;
const subscribers = new Set<() => void>();

export function setMapSlot(el: HTMLElement | null) {
  slot = el;
  subscribers.forEach((fn) => fn());
}

export function getMapSlot(): HTMLElement | null {
  return slot;
}

export function subscribeMapSlot(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
