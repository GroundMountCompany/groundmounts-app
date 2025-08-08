// src/lib/fb.ts

// Safe call that queues until fb script is ready
export function fbqSafe(...args: any[]) {
  if (typeof window === "undefined") return;
  const win = window as any;
  if (typeof win.fbq === "function") {
    win.fbq(...args);
  } else {
    win._fbqQueue = win._fbqQueue || [];
    win._fbqQueue.push(args);
  }
}

// Drain queued events once fbq exists
export function flushFbqQueue() {
  if (typeof window === "undefined") return;
  const win = window as any;
  if (!win._fbqQueue || typeof win.fbq !== "function") return;
  for (const args of win._fbqQueue) {
    try { win.fbq(...args); } catch {}
  }
  win._fbqQueue = [];
}