'use client';

/**
 * Whether the design coach has already played.
 *
 * Kept out of the quote store on purpose. The store is the customer's funnel —
 * it is cleared on the success screen and by Start over, and somebody who has
 * already been shown how to drag the array does not need teaching again just
 * because they filed a lead. This is a fact about the person at the phone, not
 * about the quote in progress.
 *
 * localStorage can throw outright in a private window or with site data
 * blocked, so every access is guarded: the failure mode is the coach playing
 * again, which is survivable, rather than the design step not rendering.
 */

export const COACH_SEEN_KEY = 'gm:coach-seen';

export function coachSeen(): boolean {
  try {
    return window.localStorage.getItem(COACH_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCoachSeen(): void {
  try {
    window.localStorage.setItem(COACH_SEEN_KEY, '1');
  } catch {
    /* A coach that plays twice is better than a step that throws. */
  }
}

/** Cleared by ?reset=1, so the owner can see it again on a real phone. */
export function clearCoachSeen(): void {
  try {
    window.localStorage.removeItem(COACH_SEEN_KEY);
  } catch {
    /* nothing to clear */
  }
}
