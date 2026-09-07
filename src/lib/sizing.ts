import { PANELS, DEFAULTS, type PanelTier } from '@/config/pricing';
import { kwForTarget, type ProductionCurve } from './production';

/**
 * Panel count from an annual kWh target.
 *
 * Sized against the PVWatts reference for the customer's own coordinates and
 * the azimuth they actually chose, rather than a national rule of thumb. v1
 * used a flat 0.18 capacity factor, which is a guess dressed as a number.
 */
export function panelsForTarget(
  curve: ProductionCurve,
  targetAnnualKwh: number,
  azimuth: number,
  tier: PanelTier
): number {
  if (targetAnnualKwh <= 0) return 0;
  const kw = kwForTarget(curve, targetAnnualKwh, azimuth);
  if (kw <= 0) return 0;
  return Math.max(1, Math.ceil((kw * 1000) / PANELS[tier].watts));
}

/**
 * The annual kWh the array is sized to cover.
 *
 * One function, because two callers have to agree: the sizing effect that
 * chooses the panel count, and the rotation shortfall on the map that says how
 * many panels a turn costs. If they computed the target separately they would
 * drift, and the HUD would offer to add panels the sizing did not think were
 * missing.
 *
 * A year read off the customer's own bill beats a monthly dollar figure divided
 * by an assumed rate, so it wins when we have one.
 */
export function targetAnnualKwh(input: {
  billAnnualKwh: number | null;
  monthlyBillUsd: number;
  ratePerKwh: number;
  offsetPercent: number;
}): number {
  const { billAnnualKwh, monthlyBillUsd, ratePerKwh, offsetPercent } = input;
  if (billAnnualKwh !== null && billAnnualKwh > 0) {
    return billAnnualKwh * (offsetPercent / 100);
  }
  return annualTargetKwh(monthlyBillUsd, ratePerKwh, offsetPercent);
}

/** Annual kWh a bill implies, at a given rate and offset. */
export function annualTargetKwh(
  monthlyBillUsd: number,
  ratePerKwh: number,
  offsetPercent: number
): number {
  const rate = ratePerKwh > 0 ? ratePerKwh : DEFAULTS.ratePerKwh;
  if (monthlyBillUsd <= 0) return 0;
  return (monthlyBillUsd / rate) * 12 * (offsetPercent / 100);
}

/**
 * Re-size for a different panel tier, holding the target constant.
 *
 * A more powerful panel means fewer of them for the same output, which is the
 * whole reason the premium tier is worth offering.
 */
export function resizeForTier(
  curve: ProductionCurve,
  targetAnnualKwh: number,
  azimuth: number,
  tier: PanelTier
): number {
  return panelsForTarget(curve, targetAnnualKwh, azimuth, tier);
}

/**
 * The customer's own +/- adjustment on top of a sized count.
 *
 * Shared so the design step, the option deltas and the sizing effect cannot
 * disagree about what "31 panels, minus two" means.
 */
export function applyAdjust(sizedPanels: number, panelAdjust: number): number {
  return Math.max(1, sizedPanels + panelAdjust);
}

/**
 * How many panels this design would have if it were built with `tier`.
 *
 * Switching tier re-sizes: a 460 W panel covers the same bill with fewer of
 * them. The option card has to price that, not the current count with a
 * different price per watt, or the quoted delta is not the change the customer
 * gets when they tap it.
 */
export function sizedCountForTier(
  curve: ProductionCurve,
  targetAnnualKwh: number,
  azimuth: number,
  tier: PanelTier,
  panelAdjust: number
): number {
  const sized = resizeForTier(curve, targetAnnualKwh, azimuth, tier);
  return sized <= 0 ? 0 : applyAdjust(sized, panelAdjust);
}
