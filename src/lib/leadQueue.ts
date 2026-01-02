// src/lib/leadQueue.ts
const KEY = "gm_lead_queue_v1";
const MAX_RETRIES = 3;

type Payload = {
  id: string;            // lead_id (UUID)
  state: string;         // "TX" etc.
  email?: string;
  phone?: string;
  address?: string;
  quote?: unknown;
  ts: number;
  honeypot?: string;     // spam prevention
  ttc_ms?: number;       // time to complete (milliseconds)
  _retries?: number;     // internal retry count
};

const load = (): Payload[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Payload[]; } catch { return []; }
};
const save = (items: Payload[]) => localStorage.setItem(KEY, JSON.stringify(items));

// Track if flush is already running to prevent concurrent flushes
let isFlushRunning = false;

export async function enqueueOrSend(payload: Payload, url = "/api/leads") {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("net");
  } catch {
    const q = load(); q.push({ ...payload, _retries: 0 }); save(q);
  }
}

export function flushQueue(url = "/api/leads") {
  // Prevent concurrent flushes
  if (isFlushRunning) return;

  const q = load();
  if (!q.length) return;

  isFlushRunning = true;
  const next = q.shift()!;
  save(q);

  fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(next),
  })
  .then(r => {
    if (!r.ok) {
      // Don't retry on 400 (bad request) - data is invalid
      if (r.status === 400) {
        console.warn("[LEAD_QUEUE] Dropping invalid lead:", next.id);
        return;
      }
      throw new Error("net");
    }
  })
  .catch(() => {
    const retries = (next._retries ?? 0) + 1;
    if (retries < MAX_RETRIES) {
      // Put back with incremented retry count
      const cur = load();
      cur.push({ ...next, _retries: retries }); // Add to end, not front
      save(cur);
    } else {
      console.warn("[LEAD_QUEUE] Max retries reached, dropping:", next.id);
    }
  })
  .finally(() => {
    isFlushRunning = false;
    const remaining = load();
    if (remaining.length) {
      // Exponential backoff: 3s, 6s, 12s based on first item's retry count
      const delay = Math.min(30000, 3000 * Math.pow(2, remaining[0]?._retries ?? 0));
      setTimeout(() => flushQueue(url), delay);
    }
  });
}

export function initLeadQueue() {
  if (typeof window === "undefined") return;

  // Prevent multiple initializations
  if ((window as unknown as { __leadQueueInit?: boolean }).__leadQueueInit) return;
  (window as unknown as { __leadQueueInit?: boolean }).__leadQueueInit = true;

  window.addEventListener("online", () => flushQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushQueue();
  });
  // kick initial flush shortly after page load
  setTimeout(() => flushQueue(), 2000);
}