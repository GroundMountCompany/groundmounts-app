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

/**
 * The host page (groundmounts.com) runs the first-party pixel, so it has to
 * hear about every step and the finished lead, and nobody else may.
 */
describe('telling the host page', () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
    vi.restoreAllMocks();
  });

  function framed() {
    const postMessage = vi.fn();
    const parent = { postMessage };
    (globalThis as { window?: unknown }).window = { parent, location: { search: '' } };
    return postMessage;
  }

  it('posts each step and the finished lead to groundmounts.com origins only', async () => {
    const postMessage = framed();
    const { trackStepView, trackLeadFiled } = await import('./analytics');
    trackStepView(3);
    trackLeadFiled('lead-1', { value: 42000 });
    const origins = new Set(postMessage.mock.calls.map((c) => c[1]));
    expect([...origins].sort()).toEqual(['https://groundmounts.com', 'https://www.groundmounts.com']);
    expect(postMessage).toHaveBeenCalledWith({ type: 'designer:step', step: 3 }, 'https://groundmounts.com');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'designer:complete', leadId: 'lead-1', value: 42000 },
      'https://groundmounts.com'
    );
  });

  it('says nothing when the app is the page, not an iframe', async () => {
    const self: Record<string, unknown> = { location: { search: '' } };
    const postMessage = vi.fn();
    self.parent = self;
    self.postMessage = postMessage;
    (globalThis as { window?: unknown }).window = self;
    const { trackStepView } = await import('./analytics');
    trackStepView(1);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
