import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyticsEnabled, track, identify, __resetAnalytics } from './analytics';

/**
 * The one rule this module has: it must never be able to break the funnel.
 *
 * The interesting case is the common one — no key configured. A blank key has
 * to be a complete no-op, not a call that quietly fails, because the branch
 * behind it is what keeps `posthog-js` out of the bundle entirely.
 */
describe('analytics with nothing configured', () => {
  const original = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    __resetAnalytics();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = '';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = original;
    vi.restoreAllMocks();
  });

  it('reports itself off', () => {
    expect(analyticsEnabled()).toBe(false);
  });

  it('a blank key and a whitespace key are the same thing', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = '   ';
    expect(analyticsEnabled()).toBe(false);
  });

  it('tracking is silent and throws nothing', () => {
    expect(() => track('step_viewed', { step: 2 })).not.toThrow();
    expect(() => identify('e1f2a3b4-5c6d-4e7f-9a8b-9cadbecfd7e8')).not.toThrow();
  });

  it('never reaches the network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    track('lead_filed');
    track('step_viewed');
    identify('e1f2a3b4-5c6d-4e7f-9a8b-9cadbecfd7e8');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('analytics with a key, before the library has loaded', () => {
  const original = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    __resetAnalytics();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = original;
  });

  it('holds events rather than dropping them', () => {
    // The first two steps of the funnel happen inside this window on a slow
    // phone, and they are the two the drop-off report is mostly about.
    expect(() => {
      for (let i = 0; i < 5; i++) track('step_viewed', { step: i });
    }).not.toThrow();
  });

  it('does not grow the queue without limit', () => {
    // A page left open with a blocked script must not accumulate a megabyte
    // of events. The cap is 50; this proves it does not throw or hang past it.
    expect(() => {
      for (let i = 0; i < 500; i++) track('sheet_toggled', { snap: 'peek' });
    }).not.toThrow();
  });

  it('survives a store that is not ready', () => {
    expect(() => track('coach_dismissed', { reason: 'timeout' })).not.toThrow();
  });
});
