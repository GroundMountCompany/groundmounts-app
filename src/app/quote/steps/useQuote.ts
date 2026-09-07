'use client';

import { useMemo } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { priceQuote, type Quote } from '@/lib/pricing';

/**
 * The current price, derived from whatever the customer has designed and chosen.
 *
 * Recomputed rather than stored: a price kept in state is a price that can drift
 * out of step with the design it describes.
 */
export function useQuote(): Quote {
  const panelCount = useQuoteStore((s) => s.totalPanels);
  const tier = useQuoteStore((s) => s.panelTier);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);
  const batteryUnits = useQuoteStore((s) => s.batteryUnits);
  const needsClearing = useQuoteStore((s) => s.needsClearing);
  // The customer's own answers, not the survey's. From Phase 9 the terrain and
  // soil lookups pre-select these and are recorded on the lead, but the price
  // follows what the person standing on the land said.
  const slopeAnswer = useQuoteStore((s) => s.slopeAnswer);
  const rocky = useQuoteStore((s) => s.rocky);

  return useMemo(
    () =>
      priceQuote(
        { panelCount, tier, trenchFeet },
        { batteryUnits, needsClearing },
        { slopeAnswer, rocky }
      ),
    [panelCount, tier, trenchFeet, batteryUnits, needsClearing, slopeAnswer, rocky]
  );
}
