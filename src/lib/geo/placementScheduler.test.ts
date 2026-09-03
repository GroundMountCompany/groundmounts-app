import { describe, it, expect, vi } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { scheduleAutoPlacement, type PlacementHost } from './placementScheduler';

const building = (): Feature<Polygon> => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  properties: {},
});

/** Fake map with controllable idle events and a manual clock. */
function makeHost(opts: { idleNow?: boolean; obstacles?: () => Array<Feature<Polygon>> } = {}) {
  const listeners = new Set<() => void>();
  let idle = opts.idleNow ?? false;
  const timers: Array<{ fn: () => void; at: number; id: number }> = [];
  let clock = 0;
  let nextId = 1;

  const host: PlacementHost = {
    isIdle: () => idle,
    onIdle: (fn) => listeners.add(fn),
    offIdle: (fn) => listeners.delete(fn),
    queryObstacles: opts.obstacles ?? (() => []),
  };

  return {
    host,
    setIdle: (v: boolean) => (idle = v),
    emitIdle: () => [...listeners].forEach((fn) => fn()),
    listenerCount: () => listeners.size,
    options: {
      setTimeoutFn: (fn: () => void, ms: number) => {
        const t = { fn, at: clock + ms, id: nextId++ };
        timers.push(t);
        return t.id;
      },
      clearTimeoutFn: (h: unknown) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    },
    advance: (ms: number) => {
      clock += ms;
      for (const t of [...timers]) {
        if (t.at <= clock) {
          timers.splice(timers.indexOf(t), 1);
          t.fn();
        }
      }
    },
    pending: () => timers.length,
  };
}

describe('auto-placement scheduling', () => {
  it('places immediately once buildings are seen', () => {
    const commit = vi.fn();
    const h = makeHost({ obstacles: () => [building()] });

    scheduleAutoPlacement(h.host, commit, h.options);
    h.emitIdle();

    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0][0]).toHaveLength(1);
  });

  it('places with no obstacles when the wait expires on a rural parcel', () => {
    // The regression: open country has no buildings, so waiting for them is
    // waiting forever. The bounded wait must still place the array.
    const commit = vi.fn();
    const h = makeHost({ obstacles: () => [] });

    scheduleAutoPlacement(h.host, commit, h.options);
    h.emitIdle();
    expect(commit).not.toHaveBeenCalled();

    h.advance(1500);

    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0][0]).toEqual([]);
  });

  it('places on an already-idle map that will never emit another idle', () => {
    // The exact hang: the old code chained a second once('idle') which, on a
    // settled map, fires never.
    const commit = vi.fn();
    const h = makeHost({ idleNow: true, obstacles: () => [building()] });

    scheduleAutoPlacement(h.host, commit, h.options);

    expect(commit).toHaveBeenCalledOnce();
  });

  it('still resolves on an already-idle rural map with no idle events at all', () => {
    const commit = vi.fn();
    const h = makeHost({ idleNow: true, obstacles: () => [] });

    scheduleAutoPlacement(h.host, commit, h.options);
    expect(commit).not.toHaveBeenCalled();

    h.advance(1500);
    expect(commit).toHaveBeenCalledWith([]);
  });

  it('picks up buildings that arrive on a later idle, before the deadline', () => {
    const commit = vi.fn();
    let tiles: Array<Feature<Polygon>> = [];
    const h = makeHost({ obstacles: () => tiles });

    scheduleAutoPlacement(h.host, commit, h.options);
    h.emitIdle();
    expect(commit).not.toHaveBeenCalled();

    tiles = [building(), building()];
    h.advance(400);
    h.emitIdle();

    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0][0]).toHaveLength(2);
  });

  it('commits exactly once even if idle keeps firing', () => {
    const commit = vi.fn();
    const h = makeHost({ obstacles: () => [building()] });

    scheduleAutoPlacement(h.host, commit, h.options);
    h.emitIdle();
    h.emitIdle();
    h.advance(5000);

    expect(commit).toHaveBeenCalledOnce();
  });

  it('cancel stops the deadline and detaches the listener', () => {
    const commit = vi.fn();
    const h = makeHost({ obstacles: () => [] });

    const cancel = scheduleAutoPlacement(h.host, commit, h.options);
    cancel();

    h.advance(5000);
    h.emitIdle();

    expect(commit).not.toHaveBeenCalled();
    expect(h.listenerCount()).toBe(0);
    expect(h.pending()).toBe(0);
  });

  it('leaves no timer behind after placing', () => {
    const commit = vi.fn();
    const h = makeHost({ obstacles: () => [building()] });

    scheduleAutoPlacement(h.host, commit, h.options);
    h.emitIdle();

    expect(h.pending()).toBe(0);
    expect(h.listenerCount()).toBe(0);
  });
});
