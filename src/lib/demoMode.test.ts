import { describe, it, expect, afterEach } from 'vitest';
import { demoFromParam, demoParamsEnabled } from './demoMode';

/**
 * The demo parameter opens a screen that claims a quote was produced.
 *
 * It exists so the owner can review wording without filing a real lead into
 * their own Airtable. It must be inert anywhere the flag is not set, because
 * a URL that shows anybody a finished quote is a URL that lies to them.
 */

const original = process.env.NEXT_PUBLIC_DEMO_PARAMS;

afterEach(() => {
  process.env.NEXT_PUBLIC_DEMO_PARAMS = original;
});

describe('the demo parameter', () => {
  it('is off unless the flag is exactly "1"', () => {
    for (const value of [undefined, '', '0', 'true', 'yes', 'preview']) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_DEMO_PARAMS;
      else process.env.NEXT_PUBLIC_DEMO_PARAMS = value;
      expect(demoParamsEnabled(), `flag ${JSON.stringify(value)}`).toBe(false);
      expect(demoFromParam('results'), `flag ${JSON.stringify(value)}`).toBeNull();
    }
  });

  it('opens only the demo it knows, and only when enabled', () => {
    process.env.NEXT_PUBLIC_DEMO_PARAMS = '1';
    expect(demoParamsEnabled()).toBe(true);
    expect(demoFromParam('results')).toBe('results');

    // Anything else is nothing, rather than an error: a bad query string is
    // not a reason to stop somebody getting a quote.
    for (const value of [null, '', 'Results', 'success', 'admin', '../results']) {
      expect(demoFromParam(value), `demo=${JSON.stringify(value)}`).toBeNull();
    }
  });
});
