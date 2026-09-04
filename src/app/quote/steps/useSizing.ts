'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import {
  dollarsPerKwhFromCents,
  estimateMonthlyKWh,
  kWFromMonthlyKWh,
  panelsFromkW,
} from '@/lib/solar';

/**
 * Keep the panel count in step with the bill, the offset and any manual
 * adjustment the customer made on the design step.
 *
 * Lives outside the step components so the count is correct even when the
 * design step has not been opened yet — the auto-placement needs it.
 */
export function useSizing() {
  const avgValue = useQuoteStore((s) => s.avgValue);
  const rateCents = useQuoteStore((s) => s.rateCentsPerKwh);
  const percentage = useQuoteStore((s) => s.percentage);
  const panelAdjust = useQuoteStore((s) => s.panelAdjust);
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const setTotalPanels = useQuoteStore((s) => s.setTotalPanels);

  useEffect(() => {
    const monthlyKWh = estimateMonthlyKWh(avgValue, dollarsPerKwhFromCents(rateCents));
    const sized = panelsFromkW(kWFromMonthlyKWh(monthlyKWh * (percentage / 100)));
    const next = Math.max(1, sized + panelAdjust);
    if (sized > 0 && next !== totalPanels) setTotalPanels(next);
  }, [avgValue, rateCents, percentage, panelAdjust, totalPanels, setTotalPanels]);
}
