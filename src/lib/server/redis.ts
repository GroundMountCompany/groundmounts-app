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
 *
 * Two failure modes, deliberately not the same thing:
 *
 *   not configured  — no credentials at all. Fall back to process memory and
 *                     carry on. This is local development, and it is fine.
 *   unavailable     — configured, and the call failed. Something the caller
 *                     was promised would be durable was not, so it throws
 *                     `StoreUnavailable` and the route answers 503 rather than
 *                     pretending. Silently degrading here is how a submit gets
 *                     written twice.
 */

/** Thrown when a configured store could not be reached. */
export class StoreUnavailable extends Error {
  constructor(operation: string, cause: unknown) {
    super(`redis ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'StoreUnavailable';
  }
}

let client: Redis | null | undefined;

/** Per-instance stand-in used only when nothing is configured. */
const memory = new Map<string, { value: unknown; expiresAt: number }>();

function memoryGet<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

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
    client = new Redis({
      ...credentials,
      // One quick retry, not the SDK's five with backoff.
      //
      // These calls sit in the path of a customer pressing Get my quote. A
      // store that is down should become a 503 they can retry in a second, not
      // twenty seconds of a spinner ending in the same answer.
      retry: { retries: 1, backoff: () => 200 },
    });
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

/** Read a JSON value. Throws `StoreUnavailable` if a configured store fails. */
export async function storeGet<T>(key: string): Promise<T | null> {
  const store = redis();
  if (!store) return memoryGet<T>(key);
  try {
    return (await store.get<T>(key)) ?? null;
  } catch (error) {
    throw new StoreUnavailable('get', error);
  }
}

/** Write a JSON value with a TTL in seconds. Throws if a configured store fails. */
export async function storeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const store = redis();
  if (!store) {
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  try {
    await store.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    throw new StoreUnavailable('set', error);
  }
}

/**
 * Take a key nobody else holds, for a TTL in seconds.
 *
 * True for the caller that got there first, false for everyone else. Used as a
 * lease around the submit: two taps on Get my quote can land on two instances,
 * and only one of them may write.
 */
export async function acquireLease(key: string, ttlSeconds: number): Promise<boolean> {
  const store = redis();
  if (!store) {
    if (memoryGet(key) !== null) return false;
    memory.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
  try {
    return (await store.set(key, '1', { nx: true, ex: ttlSeconds })) === 'OK';
  } catch (error) {
    throw new StoreUnavailable('lease', error);
  }
}

/**
 * Give a lease back before it expires.
 *
 * Called on every path that fails before the work is committed, so a customer
 * whose submit hit a broken Airtable can press the button again immediately
 * rather than staring at "already in progress" for a minute.
 */
export async function releaseLease(key: string): Promise<void> {
  const store = redis();
  if (!store) {
    memory.delete(key);
    return;
  }
  try {
    await store.del(key);
  } catch (error) {
    // A lease that cannot be released will expire on its own. Nothing is lost
    // except a minute, and the caller is already handling a failure.
    console.warn('[REDIS] lease release failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Best-effort read for a cache, where a miss and a failure mean the same thing.
 *
 * The site cache uses this: a customer standing in a field must never fail to
 * get a quote because Upstash was slow, and the cost of a miss is one lookup.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await storeGet<T>(key);
  } catch (error) {
    console.warn('[REDIS] cache get failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Best-effort write, for the same reason. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await storeSet(key, value, ttlSeconds);
  } catch (error) {
    console.warn('[REDIS] cache set failed:', error instanceof Error ? error.message : error);
  }
}

/** Test seam: drop the memoised client and the in-memory fallback. */
export function __resetRedis(): void {
  client = undefined;
  memory.clear();
}
