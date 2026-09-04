import { describe, it, expect, beforeEach } from 'vitest';
import {
  rateLimitOk,
  rateLimitOkAsync,
  ROUTE_LIMITS,
  isBotHoneypot,
  minTimeOk,
  __resetRateLimits,
  getClientIp,
} from './guard';

beforeEach(() => __resetRateLimits());

describe('rateLimitOk', () => {
  it('allows up to the route budget and then blocks', () => {
    for (let i = 0; i < ROUTE_LIMITS.leads; i++) {
      expect(rateLimitOk('1.2.3.4', 'leads')).toBe(true);
    }
    expect(rateLimitOk('1.2.3.4', 'leads')).toBe(false);
  });

  it('gives each route its own budget for the same IP', () => {
    // Exhaust the submit budget entirely.
    for (let i = 0; i <= ROUTE_LIMITS.leads; i++) rateLimitOk('1.2.3.4', 'leads');
    expect(rateLimitOk('1.2.3.4', 'leads')).toBe(false);

    // The design step must still be able to ask about the ground.
    expect(rateLimitOk('1.2.3.4', 'site')).toBe(true);
  });

  it('gives partial saves a bigger budget than submits', () => {
    // A single honest session fires several partial saves and one submit, so
    // holding them to the same allowance would cut the session off partway.
    expect(ROUTE_LIMITS['lead-partial']).toBeGreaterThan(ROUTE_LIMITS.leads);
  });

  it('keeps separate budgets per IP', () => {
    for (let i = 0; i <= ROUTE_LIMITS.leads; i++) rateLimitOk('1.2.3.4', 'leads');
    expect(rateLimitOk('1.2.3.4', 'leads')).toBe(false);
    expect(rateLimitOk('5.6.7.8', 'leads')).toBe(true);
  });
});

describe('rateLimitOkAsync', () => {
  it('uses the in-memory limiter when Redis is not configured', async () => {
    // Local development, and the answer when Upstash is unreachable.
    for (let i = 0; i < ROUTE_LIMITS.leads; i++) {
      expect(await rateLimitOkAsync('9.9.9.9', 'leads')).toBe(true);
    }
    expect(await rateLimitOkAsync('9.9.9.9', 'leads')).toBe(false);
  });
});

describe('minTimeOk', () => {
  it('rejects a missing ttc_ms rather than skipping the check', () => {
    expect(minTimeOk(undefined)).toBe(false);
    expect(minTimeOk(null)).toBe(false);
  });

  it('rejects non-numeric and non-finite values', () => {
    expect(minTimeOk('9999')).toBe(false);
    expect(minTimeOk(Number.NaN)).toBe(false);
    // Infinity is not a plausible elapsed time; treat it as malformed input.
    expect(minTimeOk(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects a too-fast submission', () => {
    expect(minTimeOk(4999)).toBe(false);
  });

  it('accepts a plausible human submission', () => {
    expect(minTimeOk(5000)).toBe(true);
    expect(minTimeOk(60_000)).toBe(true);
  });
});

describe('isBotHoneypot', () => {
  it('treats any non-empty value as a bot', () => {
    expect(isBotHoneypot('acme corp')).toBe(true);
    expect(isBotHoneypot('   x  ')).toBe(true);
  });

  it('treats empty and whitespace-only as human', () => {
    expect(isBotHoneypot('')).toBe(false);
    expect(isBotHoneypot('   ')).toBe(false);
    expect(isBotHoneypot(undefined)).toBe(false);
  });
});

describe('getClientIp', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' });
    expect(getClientIp({ headers })).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip then a sentinel', () => {
    expect(getClientIp({ headers: new Headers({ 'x-real-ip': '8.8.8.8' }) })).toBe('8.8.8.8');
    expect(getClientIp({ headers: new Headers() })).toBe('0.0.0.0');
  });
});
