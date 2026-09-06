import { PANELS, type PanelTier } from '@/config/pricing';
import { annualKwh, percentOfSouth, type ProductionCurve } from './production';
import { panelsForTarget } from './sizing';

/**
 * What turning the array away from south costs, in panels.
 *
 * Rotation deliberately does not re-size the array — watching the count tick up
 * and down under your finger is alarming, and it makes the +/- control
 * meaningless (see useSizing). But the customer still turned the array, and at
 * 90 degrees it makes noticeably less power than the count was chosen for.
 *
 * So the trade is stated instead of hidden: how far off south they are, and
 * exactly how many panels would put them back on their offset target. Adding
 * them is one tap and entirely their choice.
 */
export interface Shortfall {
  /** How far below due-south production this azimuth sits, as a whole percent. */
  offSouthPct: number;
  /** Panels to add to reach the target again at this azimuth. Always >= 1. */
  addPanels: number;
}

export function rotationShortfall(input: {
  curve: ProductionCurve;
  targetAnnualKwh: number;
  azimuth: number;
  tier: PanelTier;
  totalPanels: number;
}): Shortfall | null {
  const { curve, targetAnnualKwh, azimuth, tier, totalPanels } = input;
  if (targetAnnualKwh <= 0 || totalPanels <= 0) return null;

  const kw = (totalPanels * PANELS[tier].watts) / 1000;
  // Already covering the target at this angle — including at due south, where
  // the array was sized, and anywhere the customer has added panels of their
  // own. Nothing to say.
  if (annualKwh(curve, kw, azimuth) >= targetAnnualKwh) return null;

  const needed = panelsForTarget(curve, targetAnnualKwh, azimuth, tier);
  const addPanels = needed - totalPanels;
  if (addPanels <= 0) return null;

  return { offSouthPct: 100 - percentOfSouth(curve, azimuth), addPanels };
}
