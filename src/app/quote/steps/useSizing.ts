'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { dollarsPerKwhFromCents } from '@/lib/solar';
import { annualTargetKwh, panelsForTarget } from '@/lib/sizing';

/**
 * Keep the panel count in step with the bill, the offset, the panel tier and
 * any manual adjustment the customer made on the design step.
 *
 * Sized against the PVWatts curve for their own coordinates rather than a flat
 * capacity factor, so changing tier or turning the array re-sizes properly.
 */
export function useSizing() {
  const avgValue = useQuoteStore((s) => s.avgValue);
  const rateCents = useQuoteStore((s) => s.rateCentsPerKwh);
  const percentage = useQuoteStore((s) => s.percentage);
  const panelAdjust = useQuoteStore((s) => s.panelAdjust);
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const setTotalPanels = useQuoteStore((s) => s.setTotalPanels);
  const tier = useQuoteStore((s) => s.panelTier);
  const azimuth = useQuoteStore((s) => s.azimuth);
  const curve = useQuoteStore((s) => s.productionCurve);

  useEffect(() => {
    const target = annualTargetKwh(avgValue, dollarsPerKwhFromCents(rateCents), percentage);
    const sized = panelsForTarget(curve, target, azimuth, tier);
    if (sized <= 0) return;

    const next = Math.max(1, sized + panelAdjust);
    if (next !== totalPanels) setTotalPanels(next);
  }, [avgValue, rateCents, percentage, panelAdjust, tier, azimuth, curve, totalPanels, setTotalPanels]);
}
