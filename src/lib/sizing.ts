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
