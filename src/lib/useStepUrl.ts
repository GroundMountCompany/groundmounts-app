'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';

export const MAX_STEP = 5;

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

  // Adopt ?step= on first load, before anything else reads the store.
  useEffect(() => {
    const fromUrl = stepFromLocation();
    if (fromUrl !== null && fromUrl !== useQuoteStore.getState().currentStepIndex) {
      setStep(fromUrl);
    }
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
      if (fromUrl !== null) setStep(fromUrl);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setStep]);
}
