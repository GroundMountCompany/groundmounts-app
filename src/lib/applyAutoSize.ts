import { useQuoteStore } from '@/store/quoteStore';
import { dollarsPerKwhFromCents } from './rate';
import { targetAnnualKwh } from './sizing';
import { resizeForAzimuth } from './autoSize';

/**
 * Apply the automatic resize, once a rotation has finished.
 *
 * Called from two places, because there are two ways to finish turning the
 * array: letting go of the compass grip, and the end of the Face-south ease.
 * Both are "the customer has decided which way it points", and both have to
 * settle the count the same way — a resize that only happened for one of them
 * would leave the two routes disagreeing about how many panels a heading needs.
 *
 * Outside React on purpose: the grip's pointerup handler runs from a map event
 * listener, not a component.
 */
export function applyAutoSize(): void {
  const s = useQuoteStore.getState();

  const resize = resizeForAzimuth({
    mode: s.sizingMode,
    curve: s.productionCurve,
    // The same target the sizing effect uses, from the same function.
    targetAnnualKwh: targetAnnualKwh({
      billAnnualKwh: s.billAnnualKwh,
      monthlyBillUsd: s.avgValue,
      ratePerKwh: dollarsPerKwhFromCents(s.rateCentsPerKwh),
      offsetPercent: s.percentage,
    }),
    azimuth: s.azimuth,
    tier: s.panelTier,
    currentPanels: s.totalPanels,
  });
  if (!resize) return;

  // setSized, not setTotalPanels: the count and the angle it was chosen for
  // move together, or the sizing effect recomputes and immediately undoes this.
  s.setSized(resize.panels, s.azimuth);
  s.setSizeNotice({
    delta: resize.delta,
    azimuth: s.azimuth,
    // A monotonic id rather than a timestamp, so two resizes with the same
    // delta are still two separate toasts and neither needs a clock.
    id: (s.sizeNotice?.id ?? 0) + 1,
  });
}
