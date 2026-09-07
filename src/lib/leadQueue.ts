// src/lib/leadQueue.ts
const KEY = "gm_lead_queue_v1";
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 10; // Prevent queue from growing too large
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours - drop old items

type Payload = {
  id: string;            // lead_id (UUID)
  state: string;         // "TX" etc.
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  source?: string;       // brand domain for Airtable Source field
  quote?: unknown;
  ts: number;
  honeypot?: string;     // spam prevention
  ttc_ms?: number;       // time to complete (milliseconds)
  mapScreenshot?: string; // base64 PNG of map with panel placement
  resend?: boolean;      // email-only retry for a lead that is already filed
  _retries?: number;     // internal retry count
};

const load = (): Payload[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Payload[]; } catch { return []; }
};
const save = (items: Payload[]) => localStorage.setItem(KEY, JSON.stringify(items));

// Clean stale/old items from queue
function cleanQueue(): void {
  const q = load();
  const now = Date.now();
  const cleaned = q.filter(item => {
    // Remove items older than MAX_AGE_MS
    if (now - item.ts > MAX_AGE_MS) return false;
    // Remove items that have exceeded retries
    if ((item._retries ?? 0) >= MAX_RETRIES) return false;
    return true;
  });
  // Limit queue size
  if (cleaned.length > MAX_QUEUE_SIZE) {
    cleaned.splice(0, cleaned.length - MAX_QUEUE_SIZE);
  }
  if (cleaned.length !== q.length) {
    save(cleaned);
    console.log(`[LEAD_QUEUE] Cleaned ${q.length - cleaned.length} stale items`);
  }
}

// Track if flush is already running to prevent concurrent flushes
let isFlushRunning = false;
let lastFlushTime = 0;
const MIN_FLUSH_INTERVAL = 2000; // Minimum 2s between flushes

export interface SendResult {
  /** The server accepted the lead right now. */
  ok: boolean;
  /** It was put on the offline queue and will be retried. */
  queued: boolean;
  status?: number;
  /**
   * What the route reported. One request now files the lead and sends the
   * customer's email, and either half can succeed alone, so the retry decision
   * is driven by these rather than by the status code.
   */
  body?: {
    leadFiled?: boolean;
    emailSent?: boolean;
    priceLow?: number;
    priceHigh?: number;
    lineItems?: Array<{ key: string; label: string; detail?: string; amount: number }>;
  };
}

/**
 * Send a lead, falling back to the offline queue.
 *
 * Returns what actually happened rather than swallowing it. The caller decides
 * what to tell the customer: a queued lead is not a delivered one, and clearing
 * their design on a 500 loses work they cannot get back.
 */
/**
 * Headers a real client sends, so the pre-parse guards apply to it.
 *
 * The honeypot travels in the body too — the server checks both — but the
 * server's cheap check runs before it reads the body, and a guard that only
 * real clients fail to trigger is a guard that only stops honest traffic.
 */
function leadHeaders(payload: Payload): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payload.honeypot) headers["x-gm-hp"] = payload.honeypot.slice(0, 64);
  return headers;
}

/** First retry after a server-side failure. Doubles from there in flushQueue. */
const RETRY_DELAY_MS = 3000;

export async function enqueueOrSend(
  payload: Payload,
  url = "/api/leads"
): Promise<SendResult> {
  let status: number | undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: leadHeaders(payload),
      body: JSON.stringify(payload),
    });
    status = res.status;

    if (res.ok) {
      // The body carries what actually happened: the lead is filed, and the
      // email may or may not have gone with it.
      const body = await res.json().catch(() => ({}));
      return { ok: true, queued: false, status, body };
    }

    // 4xx means this payload will never work. Queuing it would burn retries on
    // something the server has already refused on its merits.
    if (res.status < 500) {
      console.warn("[LEAD_QUEUE] Server refused the lead:", payload.id, res.status);
      return { ok: false, queued: false, status };
    }

    throw new Error("net");
  } catch {
    const q = load(); q.push({ ...payload, _retries: 0 }); save(q);

    /**
     * Chase it ourselves rather than waiting to be woken.
     *
     * The queue only flushed on an `online` event or the tab becoming visible.
     * A customer who submits, gets a 503 because something held the lease for
     * a moment, and then sits looking at the same tab would have waited
     * indefinitely — the two events that trigger a flush are exactly the two
     * that do not happen when nothing changes.
     */
    if (typeof setTimeout === "function") {
      setTimeout(() => flushQueue(url), RETRY_DELAY_MS);
    }

    return { ok: false, queued: true, status };
  }
}

export function flushQueue(url = "/api/leads") {
  // Prevent concurrent flushes
  if (isFlushRunning) return;

  // Rate limit flushes
  const now = Date.now();
  if (now - lastFlushTime < MIN_FLUSH_INTERVAL) return;

  // Clean stale items first
  cleanQueue();

  const q = load();
  if (!q.length) return;

  isFlushRunning = true;
  lastFlushTime = now;
  const next = q.shift()!;
  save(q);

  fetch(url, {
    method: "POST",
    headers: leadHeaders(next),
    body: JSON.stringify(next),
  })
  .then(async r => {
    if (!r.ok) {
      // 4xx is the server saying this request will never work: a malformed
      // payload, a resend for a lead it has no record of, or another instance
      // already mid-write. Retrying is pointless and, for a duplicate, wrong.
      //
      // 5xx is the server saying it could not do it *this time* — Airtable,
      // Redis or Resend unreachable — which is precisely what a queue is for.
      if (r.status < 500) {
        console.warn("[LEAD_QUEUE] Dropping lead the server refused:", next.id, r.status);
        return;
      }
      throw new Error("net");
    }

    // A 200 does not mean the whole submit succeeded. One request files the
    // lead and sends the customer's email, and the email can fail on its own —
    // in which case the lead is safe and the queue must chase the email alone.
    // Re-queuing the whole payload would file a second record.
    const body = (await r.json().catch(() => ({}))) as {
      leadFiled?: boolean;
      emailSent?: boolean;
    };
    if (body.leadFiled && body.emailSent === false && !next.resend) {
      console.warn("[LEAD_QUEUE] Lead filed, email did not send; queueing a resend:", next.id);
      const cur = load();
      cur.push({ ...next, resend: true, _retries: (next._retries ?? 0) + 1 });
      save(cur);
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

  // Clean any stale/corrupted items on init
  cleanQueue();

  window.addEventListener("online", () => flushQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushQueue();
  });
  // kick initial flush shortly after page load
  setTimeout(() => flushQueue(), 2000);
}

// Export for manual queue clearing if needed
export function clearLeadQueue() {
  save([]);
  console.log("[LEAD_QUEUE] Queue cleared manually");
}