'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { dollarsPerKwhFromCents } from '@/lib/rate';
import { annualTargetKwh, applyAdjust, panelsForTarget } from '@/lib/sizing';

/**
 * Size the array, once.
 *
 * Sizing answers "how many panels to cover this bill", which depends on the
 * bill, the rate, the offset, the panel tier and the production curve — but
 * deliberately NOT on the azimuth the customer ends up choosing. Re-sizing on
 * rotation meant the array grew and shrank under the finger while they turned
 * it, which is alarming and makes the ± control meaningless.
 *
 * Rotation changes the production readout and the vs-south figure. It does not
 * change how many panels there are.
 */
export function useSizing() {
  const step = useQuoteStore((s) => s.currentStepIndex);
  const avgValue = useQuoteStore((s) => s.avgValue);
  const rateCents = useQuoteStore((s) => s.rateCentsPerKwh);
  const percentage = useQuoteStore((s) => s.percentage);
  const panelAdjust = useQuoteStore((s) => s.panelAdjust);
  const tier = useQuoteStore((s) => s.panelTier);
  const curve = useQuoteStore((s) => s.productionCurve);
  const sizedPanels = useQuoteStore((s) => s.sizedPanels);
  const sizedAzimuth = useQuoteStore((s) => s.sizedAzimuth);
  const billAnnualKwh = useQuoteStore((s) => s.billAnnualKwh);

  // Re-size when the inputs to sizing change, or on first arrival at the
  // design step. Azimuth is not in the dependency list on purpose.
  useEffect(() => {
    if (step < 3) return;

    // A year read off their own bill beats a monthly dollar figure divided by
    // an assumed rate, so it wins when we have one.
    const target =
      billAnnualKwh && billAnnualKwh > 0
        ? billAnnualKwh * (percentage / 100)
        : annualTargetKwh(avgValue, dollarsPerKwhFromCents(rateCents), percentage);
    const sized = panelsForTarget(curve, target, sizedAzimuth, tier);
    if (sized <= 0 || sized === sizedPanels) return;

    useQuoteStore.getState().setSized(sized, sizedAzimuth);
  }, [step, avgValue, rateCents, percentage, tier, curve, sizedPanels, sizedAzimuth, billAnnualKwh]);

  // The count the rest of the app sees: what sizing produced, plus whatever the
  // customer added or removed by hand.
  useEffect(() => {
    if (sizedPanels <= 0) return;
    const next = applyAdjust(sizedPanels, panelAdjust);
    if (next !== useQuoteStore.getState().totalPanels) {
      useQuoteStore.getState().setTotalPanels(next);
    }
  }, [sizedPanels, panelAdjust]);
}
