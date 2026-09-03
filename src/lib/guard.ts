// src/lib/guard.ts
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
 * Fixed-window limiter, keyed on IP *and* route.
 *
 * A shared per-IP budget let a burst against one endpoint lock a legitimate user
 * out of the others — submitting a lead would spend the same allowance as
 * sending the quote email. Each route now gets its own window.
 *
 * Still in-memory, so it resets per serverless instance and is not shared across
 * them. Phase 7 swaps this for a durable Upstash sliding window.
 */
export function rateLimitOk(ip: string, route: string) {
  const key = `${route}|${ip}`;
  const now = Date.now();
  const row = BUCKET[key] || { count: 0, ts: now };
  if (now - row.ts > WINDOW_MS) { row.count = 0; row.ts = now; }
  row.count += 1;
  BUCKET[key] = row;
  return row.count <= MAX_REQS;
}

/** Test-only: drop all counters so cases cannot bleed into each other. */
export function __resetRateLimits() {
  for (const key of Object.keys(BUCKET)) delete BUCKET[key];
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