// src/lib/fb.ts

type FbqArgs = unknown[];

declare global {
  interface Window {
    _fbqQueue?: FbqArgs[];
  }
}

// Safe call that queues until fb script is ready
export function fbqSafe(...args: FbqArgs) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") {
    window.fbq(...args);
  } else {
    window._fbqQueue = window._fbqQueue || [];
    window._fbqQueue.push(args);
  }
}

// Drain queued events once fbq exists
export function flushFbqQueue(): void {
  if (typeof window === "undefined") return;
  if (!window._fbqQueue || typeof window.fbq !== "function") return;
  for (const args of window._fbqQueue) {
    try { window.fbq(...args); } catch {}
  }
  window._fbqQueue = [];
}

// Fire DesignStart exactly once per session
export function fireDesignStartOnce(): void {
  if (typeof window === "undefined") return;
  const KEY = "gm_design_start_fired";
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, "1");
  fbqSafe("trackCustom", "DesignStart");
}