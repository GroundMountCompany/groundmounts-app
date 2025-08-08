// src/lib/guard.ts
type RateEntry = { count: number; ts: number };
const BUCKET: Record<string, RateEntry> = {};
const WINDOW_MS = 60_000;   // 1 minute
const MAX_REQS = 20;        // per IP per minute (tune as needed)

export function getClientIp(req: Request | { headers: Headers }): string {
  const h = "headers" in req ? req.headers : req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export function rateLimitOk(ip: string) {
  const now = Date.now();
  const row = BUCKET[ip] || { count: 0, ts: now };
  if (now - row.ts > WINDOW_MS) { row.count = 0; row.ts = now; }
  row.count += 1;
  BUCKET[ip] = row;
  return row.count <= MAX_REQS;
}

export function isBotHoneypot(honeypot?: string) {
  return !!honeypot && honeypot.trim().length > 0;
}

export function minTimeOk(ttcMs?: number, minMs = 5000) {
  // Humans rarely finish correctly in < 5s; adjust if needed
  return typeof ttcMs === "number" && ttcMs >= minMs;
}