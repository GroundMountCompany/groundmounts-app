import { twMerge } from "tailwind-merge";
import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Retry with exponential backoff. Jitter keeps calls from syncing up.
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
  baseMs = 400
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      if (i < attempts - 1) { // Don't wait after the last attempt
        const wait = baseMs * Math.pow(2, i) + Math.floor(Math.random() * 150);
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[RETRY_FAIL]", i + 1, "of", attempts, msg);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}