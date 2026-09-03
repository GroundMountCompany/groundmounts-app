'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef, mapContainerRef } from '@/store/mapRefs';

/**
 * Compatibility shim over the Zustand store.
 *
 * The funnel's nine call sites still destructure a single big object, exactly as
 * they did under the old context provider, so this hook preserves that shape
 * while the state itself now lives in `@/store/quoteStore` with persistence.
 * As each step is rewritten (Phases 2 and 4) it should subscribe to narrow
 * selectors directly and stop using this hook, which then goes away.
 */
export function useQuoteContext() {
  const state = useQuoteStore();

  const isAddressEmpty = state.address.length === 0;
  const isCoordinatesZero =
    state.coordinates.latitude === 0 && state.coordinates.longitude === 0;

  return {
    ...state,
    // Derived
    shouldContinueButtonDisabled: isAddressEmpty || isCoordinatesZero,
    isAddressCoordinatesCompleted: !isAddressEmpty && !isCoordinatesZero,
    shouldDrawPanels: state.totalPanels > 0,
    // Imperative Mapbox handles (module-level, never re-rendered)
    mapRef,
    mapContainerRef,
  };
}

export type QuoteContextValues = ReturnType<typeof useQuoteContext>;

/**
 * Restores persisted funnel state on mount. Rehydration is deferred to an effect
 * (rather than running during store creation) so the server-rendered markup and
 * the first client render agree; otherwise a returning user trips a hydration
 * mismatch on every field they had already filled in.
 */
export function QuoteStoreHydrator() {
  useEffect(() => {
    useQuoteStore.persist.rehydrate();
  }, []);
  return null;
}
