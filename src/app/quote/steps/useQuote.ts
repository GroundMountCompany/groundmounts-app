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
  const slopePercent = useQuoteStore((s) => s.slopePercent);
  const slopeTier = useQuoteStore((s) => s.slopeTier);
  const soilClass = useQuoteStore((s) => s.soilClass);

  return useMemo(
    () =>
      priceQuote(
        { panelCount, tier, trenchFeet },
        { batteryUnits, needsClearing },
        { slopePercent, slopeTier, soilClass }
      ),
    [panelCount, tier, trenchFeet, batteryUnits, needsClearing, slopePercent, slopeTier, soilClass]
  );
}
