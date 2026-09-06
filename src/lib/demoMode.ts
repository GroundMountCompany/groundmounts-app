'use client';

import { useEffect, useRef } from 'react';
import { useQuoteStore, type QuoteState } from '@/store/quoteStore';

/**
 * A way to look at the finished screens without filing a lead.
 *
 * The results section only exists after a submit, so reviewing a wording
 * change meant putting a real name and a real email through the real route and
 * leaving a real record in the owner's Airtable. This opens the same screen
 * from a URL, seeded, with no request made at all.
 *
 * Gated on a build flag rather than on a guessable parameter, because the
 * screen it opens claims a lead was filed. In production the flag is unset,
 * the comparison inlines to `false`, and `?demo=` does nothing whatsoever.
 */
export function demoParamsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_PARAMS === '1';
}

/** The demo the URL is asking for, if it is asking for one we allow. */
export function demoFromParam(raw: string | null): 'results' | null {
  if (!demoParamsEnabled()) return null;
  return raw === 'results' ? 'results' : null;
}

/**
 * The worked example, as a store seed.
 *
 * A bill, an offset, a trench and a spot on the map — the inputs, not the
 * outputs. The panel count and the price are left to the app to work out, so
 * the screen is self-consistent by construction: a hard-coded price beside a
 * design that sizing had re-derived would show a total that did not match its
 * own line items.
 */
export const DEMO_RESULTS_SEED: Partial<QuoteState> = {
  currentStepIndex: 5,
  address: '123 Main St, Fort Worth, TX 76131',
  coordinates: { latitude: 32.7555, longitude: -97.3208 },
  electricalMeterPosition: [-97.3208, 32.7556],
  arrayCenter: [-97.3208, 32.7553],
  avgValue: 240,
  percentage: 100,
  azimuth: 180,
  sizedAzimuth: 180,
  trenchFeet: 113,
  panelTier: 'standard',
  slopeAnswer: 'flat',
  rocky: true,
  batteryInterest: false,
  needsClearing: false,
  sizingMode: 'auto',
  panelAdjust: 0,
  // Not filed, and deliberately so: nothing was sent, so nothing may claim to
  // have been. The funnel is not marked done and the design is not locked.
  leadFiled: null,
};

/**
 * Seed the worked example and jump to the last step.
 *
 * Runs once, and only when the flag is on and the URL asks. It overwrites
 * whatever funnel was in progress, which is the point: the owner is asking to
 * see a specific screen, not to resume their own session.
 */
export function useDemoSeed(): void {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    // Read from the effect rather than through useSearchParams: this runs in
    // the shell, which is not inside a Suspense boundary, and the hook makes
    // the whole page bail out of prerendering. The parameter is a client-side
    // concern and the effect is the right place to read it.
    const demo = demoFromParam(new URLSearchParams(window.location.search).get('demo'));
    if (demo !== 'results') return;
    applied.current = true;
    useQuoteStore.setState({ ...DEMO_RESULTS_SEED, hydrated: true });
  }, []);
}
