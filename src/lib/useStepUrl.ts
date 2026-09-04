'use client';

import { useEffect } from 'react';
import { useQuoteStore, clearPersistedQuote } from '@/store/quoteStore';

export const MAX_STEP = 5;

/**
 * Steps that describe the design. Once the lead is filed these are settled —
 * editing them would leave the Airtable record describing something the
 * customer no longer sees, so every route back into them is refused.
 */
export const DESIGN_STEPS = [1, 2, 3, 4, 5];

/** Where a blocked navigation lands: the contact step it came from. */
const LOCKED_LANDING = MAX_STEP;

/** True when the lead behind this funnel run is already in Airtable. */
function designIsLocked(): boolean {
  const s = useQuoteStore.getState();
  return s.leadFiled !== null && s.leadFiled === s.leadId;
}

/**
 * Clamp a requested step against the filed-lead lock.
 *
 * The progress bar is not the only way in: the browser back button and a
 * hand-typed ?step= both land here too, so the rule lives at the routing layer
 * rather than in the click handler.
 */
export function allowedStep(requested: number): number {
  if (!designIsLocked()) return requested;
  return DESIGN_STEPS.includes(requested) ? LOCKED_LANDING : requested;
}

function stepFromLocation(): number | null {
  const raw = new URLSearchParams(window.location.search).get('step');
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= MAX_STEP ? n : null;
}

/**
 * Keep the current step in the URL so the phone's back button steps backwards
 * through the funnel instead of leaving the page — which, inside an iframe,
 * means leaving the host site entirely.
 *
 * Uses pushState on forward moves so there is history to go back through, and
 * replaceState on the first render so a refresh does not stack duplicates.
 * Other query params (?source=, ?zipcode=) are preserved untouched.
 */
export function useStepUrl() {
  const step = useQuoteStore((s) => s.currentStepIndex);
  const setStep = useQuoteStore((s) => s.setCurrentStepIndex);

  /**
   * ?reset=1 wipes the funnel and starts clean.
   *
   * For demos and for the owner testing on a phone, where clearing site data by
   * hand is a nuisance. The parameter is stripped afterwards so a refresh does
   * not silently wipe the run a second time.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('reset') !== '1') return;

    useQuoteStore.getState().resetQuote();
    clearPersistedQuote();

    url.searchParams.delete('reset');
    url.searchParams.set('step', '0');
    window.history.replaceState({ step: 0 }, '', url);
    useQuoteStore.getState().setCurrentStepIndex(0);
  }, []);

  // Adopt ?step= on first load, before anything else reads the store.
  useEffect(() => {
    const fromUrl = stepFromLocation();
    if (fromUrl === null) return;
    const target = allowedStep(fromUrl);
    if (target !== useQuoteStore.getState().currentStepIndex) setStep(target);
    if (target !== fromUrl) useQuoteStore.getState().setDesignLockNotice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror store -> URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('step') === String(step)) return;

    url.searchParams.set('step', String(step));
    const first = stepFromLocation() === null;
    window.history[first ? 'replaceState' : 'pushState']({ step }, '', url);
  }, [step]);

  // Mirror URL -> store when the user presses back.
  useEffect(() => {
    const onPop = () => {
      const fromUrl = stepFromLocation();
      if (fromUrl === null) return;
      const target = allowedStep(fromUrl);
      setStep(target);
      if (target !== fromUrl) useQuoteStore.getState().setDesignLockNotice(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setStep]);
}
