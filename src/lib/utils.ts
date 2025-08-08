import { twMerge } from "tailwind-merge";
import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const updateSheet = async (column: string, value: string, cb?: () => void) => {
  let leadId = '';
  if (typeof window !== 'undefined') {
    leadId = localStorage.getItem('lead_id') || '';
    if (!leadId) {
      const timestamp = new Date().getTime();
      const randomNum = Math.floor(Math.random() * 1000000);
      leadId = `LEAD_${timestamp}_${randomNum}`;
      localStorage.setItem('lead_id', leadId);
    }
  }
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tabName: 'Sheet1', leadId, column, value }),
    });

    if (!response.ok) {
      throw new Error('Failed to update sheet with leadId');
    }
    if (cb) cb();

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error updating sheet with leadId:', msg);
  }
};

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
        // surface each failure during backoff
        // eslint-disable-next-line no-console
        console.error("[SHEETS_RETRY_FAIL]", i + 1, "of", attempts, msg);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}