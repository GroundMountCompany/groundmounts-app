import { Redis } from '@upstash/redis';

/**
 * The durable store, when there is one.
 *
 * Everything that uses this works without it. Serverless instances come and go
 * and none of them share memory, so an in-memory rate limiter is really a
 * per-instance one and an in-memory cache is a per-instance cache — good enough
 * to develop against, not good enough to depend on. Redis makes them real.
 *
 * Two naming conventions, because the Vercel Marketplace integration injects
 * KV_REST_API_* while a hand-provisioned Upstash database gives you
 * UPSTASH_REDIS_REST_*. The owner should not have to care which they clicked.
 */

let client: Redis | null | undefined;

function resolveCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** The shared client, or null when nothing is configured. */
export function redis(): Redis | null {
  if (client !== undefined) return client;

  const credentials = resolveCredentials();
  if (!credentials) {
    console.log('[REDIS] not configured; using in-memory fallbacks');
    client = null;
    return client;
  }

  try {
    client = new Redis(credentials);
    console.log('[REDIS] connected');
  } catch (error) {
    console.error('[REDIS] client failed to initialise:', error);
    client = null;
  }
  return client;
}

/** Whether the durable store is available. Reported by /api/health. */
export function redisConfigured(): boolean {
  return resolveCredentials() !== null;
}

/**
 * Read a JSON value, treating any Redis failure as a miss.
 *
 * A cache that throws is worse than no cache: the customer is standing in a
 * field waiting for a quote, and a cold Upstash instance must never be the
 * reason they do not get one.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const store = redis();
  if (!store) return null;
  try {
    return (await store.get<T>(key)) ?? null;
  } catch (error) {
    console.warn('[REDIS] get failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Write a JSON value with a TTL in seconds. Failures are logged, not thrown. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const store = redis();
  if (!store) return;
  try {
    await store.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.warn('[REDIS] set failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Claim a key exactly once, for a TTL in seconds.
 *
 * Returns true for the caller that got there first. Used for submit
 * idempotency, where "did this already happen?" has to be answered atomically
 * across instances — two taps on Get my quote can land on two of them.
 */
export async function claimOnce(key: string, ttlSeconds: number): Promise<boolean | null> {
  const store = redis();
  if (!store) return null;
  try {
    const result = await store.set(key, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK';
  } catch (error) {
    console.warn('[REDIS] claim failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Test seam: drop the memoised client so env changes take effect. */
export function __resetRedis(): void {
  client = undefined;
}
