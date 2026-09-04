// src/lib/guard.ts
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./server/redis";

type RateEntry = { count: number; ts: number };
const BUCKET: Record<string, RateEntry> = {};
const WINDOW_MS = 60_000;   // 1 minute
const MAX_REQS = 20;        // per IP per minute (tune as needed)

export function getClientIp(req: Request | { headers: Headers }): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0"
  );
}

/**
 * Per-route budgets, per IP per minute.
 *
 * A shared per-IP budget let a burst against one endpoint lock a legitimate
 * user out of the others. Partial saves fire several times per honest session
 * and cost nothing; a final submit writes to Airtable and sends two emails.
 */
export const ROUTE_LIMITS: Record<string, number> = {
  site: 30,
  leads: 10,
  "lead-partial": 40,
  "bill-extract": 10,
  health: 30,
};

const limiters = new Map<string, Ratelimit>();

function limiterFor(route: string): Ratelimit | null {
  const store = redis();
  if (!store) return null;

  const existing = limiters.get(route);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: store,
    // Sliding window rather than fixed: a fixed window lets someone spend a
    // whole minute's budget in the last second of one window and again in the
    // first second of the next.
    limiter: Ratelimit.slidingWindow(ROUTE_LIMITS[route] ?? MAX_REQS, "60 s"),
    prefix: `gm:rl:${route}`,
    analytics: false,
  });
  limiters.set(route, limiter);
  return limiter;
}

/**
 * Durable when Redis is configured, per-instance when it is not.
 *
 * The in-memory path stays for local development and as the answer to Upstash
 * being unreachable: a limiter that throws must not be the reason a customer
 * cannot submit, so a failed check is allowed through and logged.
 */
export async function rateLimitOkAsync(ip: string, route: string): Promise<boolean> {
  const limiter = limiterFor(route);
  if (!limiter) return rateLimitOk(ip, route);

  try {
    const { success } = await limiter.limit(ip);
    return success;
  } catch (error) {
    console.warn("[RATE_LIMIT] Upstash unavailable, falling back:", error);
    return rateLimitOk(ip, route);
  }
}

/**
 * Fixed-window limiter, keyed on IP *and* route. The fallback path.
 *
 * In-memory, so it resets per serverless instance and is not shared across
 * them — which is exactly why `rateLimitOkAsync` above prefers Redis.
 */
export function rateLimitOk(ip: string, route: string) {
  const key = `${route}|${ip}`;
  const now = Date.now();
  const row = BUCKET[key] || { count: 0, ts: now };
  if (now - row.ts > WINDOW_MS) { row.count = 0; row.ts = now; }
  row.count += 1;
  BUCKET[key] = row;
  return row.count <= (ROUTE_LIMITS[route] ?? MAX_REQS);
}

/** Test-only: drop all counters so cases cannot bleed into each other. */
export function __resetRateLimits() {
  for (const key of Object.keys(BUCKET)) delete BUCKET[key];
  limiters.clear();
}

export function isBotHoneypot(honeypot?: string) {
  return !!honeypot && honeypot.trim().length > 0;
}

/**
 * Time-to-complete check. A missing `ttc_ms` fails exactly like a too-fast one:
 * treating "absent" as "skip the check" made the guard opt-out for any caller
 * that simply omitted the field, which is precisely what a bot would do.
 */
export function minTimeOk(ttcMs?: unknown, minMs = 5000) {
  return typeof ttcMs === "number" && Number.isFinite(ttcMs) && ttcMs >= minMs;
}