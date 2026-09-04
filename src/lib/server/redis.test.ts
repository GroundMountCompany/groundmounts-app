import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  redisConfigured,
  __resetRedis,
  cacheGet,
  cacheSet,
  storeGet,
  storeSet,
  acquireLease,
  releaseLease,
  StoreUnavailable,
} from './redis';

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
  it('falls back to process memory rather than losing the write', async () => {
    // Local development. A submit record that vanished immediately would mean
    // resend never worked outside production.
    await storeSet('gm:test', { a: 1 }, 60);
    expect(await storeGet('gm:test')).toEqual({ a: 1 });
  });

  it('honours a TTL', async () => {
    vi.useFakeTimers();
    await storeSet('gm:test:ttl', { a: 1 }, 60);
    vi.advanceTimersByTime(61_000);
    expect(await storeGet('gm:test:ttl')).toBeNull();
    vi.useRealTimers();
  });

  it('gives a lease to one caller and refuses the next', async () => {
    const mine = await acquireLease('gm:test:lease', 60);
    expect(mine).toBeTruthy();
    expect(await acquireLease('gm:test:lease', 60)).toBeNull();

    await releaseLease('gm:test:lease', mine!);
    expect(await acquireLease('gm:test:lease', 60)).toBeTruthy();
  });

  it('will not let a stale holder delete a newer holder\'s lease', async () => {
    // The race this exists for: A takes the lease and stalls, the lease
    // expires, B takes it, then A finishes and tries to tidy up. With a plain
    // DEL, A would free B's lease and a second writer would think it was
    // alone.
    const stale = await acquireLease('gm:test:handover', 60);
    expect(stale).toBeTruthy();

    // The lease expires and somebody else takes it.
    __resetRedis();
    const fresh = await acquireLease('gm:test:handover', 60);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(stale);

    // The original holder tries to release. It must not touch the new one.
    await releaseLease('gm:test:handover', stale!);
    expect(
      await acquireLease('gm:test:handover', 60),
      'a stale holder released the current lease'
    ).toBeNull();

    // The real holder can still release it.
    await releaseLease('gm:test:handover', fresh!);
    expect(await acquireLease('gm:test:handover', 60)).toBeTruthy();
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

  it('treats a failed cache read as a miss', async () => {
    // A customer standing in a field must never fail to get a quote because
    // a cache was cold. The cost of a miss is one lookup.
    expect(await cacheGet('gm:test')).toBeNull();
  });

  it('swallows a failed cache write', async () => {
    await expect(cacheSet('gm:test', { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it('throws on a store read, because a guess there duplicates a submit', async () => {
    // "I could not tell you whether this already happened" is not the same
    // answer as "it did not", and treating them alike files the lead twice.
    await expect(storeGet('gm:submit:x')).rejects.toBeInstanceOf(StoreUnavailable);
  });

  it('throws on a store write and on a lease', async () => {
    await expect(storeSet('gm:submit:x', { a: 1 }, 60)).rejects.toBeInstanceOf(StoreUnavailable);
    await expect(acquireLease('gm:submit:lease:x', 60)).rejects.toBeInstanceOf(StoreUnavailable);
  });

  it('never throws when giving a lease back', async () => {
    // The caller is already handling a failure; an unreleased lease expires.
    await expect(releaseLease('gm:submit:lease:x', 'token')).resolves.toBeUndefined();
  });
});
