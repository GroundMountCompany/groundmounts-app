// src/lib/leadQueue.ts
const KEY = "gm_lead_queue_v1";

type Payload = {
  id: string;            // lead_id (UUID)
  state: string;         // "TX" etc.
  email?: string;
  phone?: string;
  address?: string;
  quote?: any;
  ts: number;
};

const load = (): Payload[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
};
const save = (items: Payload[]) => localStorage.setItem(KEY, JSON.stringify(items));

export async function enqueueOrSend(payload: Payload, url = "/api/leads") {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("net");
  } catch {
    const q = load(); q.push(payload); save(q);
  }
}

export function flushQueue(url = "/api/leads") {
  const q = load();
  if (!q.length) return;
  const next = q.shift()!;
  save(q);
  fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(next),
  })
  .then(r => { if (!r.ok) throw new Error("net"); })
  .catch(() => { const cur = load(); cur.unshift(next); save(cur); })
  .finally(() => { if (load().length) setTimeout(() => flushQueue(url), 1500); });
}

export function initLeadQueue() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => flushQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushQueue();
  });
  // kick initial flush shortly after page load
  setTimeout(() => flushQueue(), 2000);
}