import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redisConfigured, __resetRedis, cacheGet, cacheSet, claimOnce } from './redis';

/**
 * The durable store is optional, and everything that uses it has to work
 * without it. These check the two things that would hurt: reading credentials
 * from either naming convention, and treating a Redis that is down as a miss
 * rather than as an outage.
 */

beforeEach(() => {
  __resetRedis();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRedis();
});

describe('finding the credentials', () => {
  it('accepts the Upstash naming', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(redisConfigured()).toBe(true);
  });

  it('accepts the KV naming the Vercel Marketplace injects', () => {
    // The owner clicks "add integration" and gets KV_REST_API_*; they should
    // not have to know that is the same thing.
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    vi.stubEnv('KV_REST_API_TOKEN', 'token');
    expect(redisConfigured()).toBe(true);
  });

  it('is not configured on a half-set pair', () => {
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    expect(redisConfigured()).toBe(false);
  });

  it('is not configured when nothing is set', () => {
    expect(redisConfigured()).toBe(false);
  });
});

describe('with no store configured', () => {
  it('reads as a miss and writes as a no-op', async () => {
    await cacheSet('gm:test', { a: 1 }, 60);
    expect(await cacheGet('gm:test')).toBeNull();
  });

  it('cannot claim, and says so with null rather than false', async () => {
    // null means "no opinion" — the caller carries on. false would mean
    // "somebody else already did this", which would silently drop a submit.
    expect(await claimOnce('gm:test:lock', 60)).toBeNull();
  });
});

describe('when the store is unreachable', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://unreachable.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    __resetRedis();
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('treats a failed read as a miss', async () => {
    // A customer standing in a field must never fail to get a quote because
    // a cache was cold.
    expect(await cacheGet('gm:test')).toBeNull();
  });

  it('swallows a failed write', async () => {
    await expect(cacheSet('gm:test', { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it('returns null from a failed claim so the submit still goes through', async () => {
    expect(await claimOnce('gm:test:lock', 60)).toBeNull();
  });
});
