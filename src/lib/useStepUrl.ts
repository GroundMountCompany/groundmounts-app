'use client';

import { useEffect, useRef } from 'react';
import { useQuoteStore, clearPersistedQuote } from '@/store/quoteStore';

export const MAX_STEP = 5;

/**
 * Every step before the contact form. Once the lead is filed these are all
 * settled — including the address, which is on the record — so every route back
 * into them is refused and the customer is offered a fresh start instead.
 */
export const DESIGN_STEPS = [0, 1, 2, 3, 4];

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

/**
 * Write a history entry without throwing away Next's router state.
 *
 * The App Router patches history.pushState/replaceState during hydration and
 * stamps each entry with its own marker and route tree. Child effects run
 * before parent ones, so this hook's first write happened before that patch was
 * installed and produced an entry holding nothing but `{ step: 0 }`.
 *
 * Next reads that back on popstate, finds no router state, and concludes the
 * entry belongs to somebody else — so the back button did a full document
 * reload instead of a soft step back. On a phone that is a white flash and a
 * re-download of the whole app; in the suite it was a back-navigation that
 * missed its budget whenever the machine was busy, and passed in isolation.
 *
 * Spreading the existing state keeps whatever Next has already put there, and
 * every later write goes through the patched functions anyway.
 */
function writeStep(kind: 'pushState' | 'replaceState', url: URL, step: number): void {
  window.history[kind]({ ...window.history.state, step }, '', url);
}

const pushStep = (url: URL, step: number) => writeStep('pushState', url, step);
const replaceStep = (url: URL, step: number) => writeStep('replaceState', url, step);

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
   * The URL is authoritative on load, so nothing may write to it until it has
   * been read. Without this the store rehydrated a stale step and pushed it
   * over the top of the address the browser was still navigating to.
   */
  const adopted = useRef(false);

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
    replaceStep(url, 0);
    useQuoteStore.getState().setCurrentStepIndex(0);
  }, []);

  // Adopt ?step= on first load, before anything else reads the store.
  useEffect(() => {
    const fromUrl = stepFromLocation();
    if (fromUrl !== null) {
      const target = allowedStep(fromUrl);
      if (target !== useQuoteStore.getState().currentStepIndex) setStep(target);
      if (target !== fromUrl) useQuoteStore.getState().setDesignLockNotice(true);
    }
    adopted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror store -> URL, but never before the URL has been adopted.
  useEffect(() => {
    if (!adopted.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('step') === String(step)) return;

    url.searchParams.set('step', String(step));
    if (stepFromLocation() === null) replaceStep(url, step);
    else pushStep(url, step);
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
