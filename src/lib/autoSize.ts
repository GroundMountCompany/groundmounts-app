import { type PanelTier } from '@/config/pricing';
import { type ProductionCurve } from './production';
import { panelsForTarget } from './sizing';
import { isFacingSouth } from './easeAzimuth';
import type { SizingMode } from '@/store/quoteStore';

/**
 * Re-size the array for the direction it now points.
 *
 * The array is sized to cover a target, and how much power it makes depends on
 * which way it faces. Turning it east without changing the count leaves the
 * customer quietly short of the offset they asked for; turning it back to south
 * leaves them paying for panels they no longer need.
 *
 * This runs only when a rotation *finishes*. Mid-gesture the count is left
 * alone: watching panels appear and disappear under your finger while you turn
 * the array is alarming, and it makes the +/- control meaningless.
 *
 * And it never runs on a count the customer set by hand. That is the whole
 * point of `mode` — see setPanelAdjust.
 */
export interface Resize {
  /** The count the array should now have. */
  panels: number;
  /** Positive when panels were added, negative when removed. Never zero. */
  delta: number;
}

export function resizeForAzimuth(input: {
  mode: SizingMode;
  curve: ProductionCurve;
  targetAnnualKwh: number;
  azimuth: number;
  tier: PanelTier;
  currentPanels: number;
}): Resize | null {
  const { mode, curve, targetAnnualKwh, azimuth, tier, currentPanels } = input;
  if (mode !== 'auto') return null;
  if (targetAnnualKwh <= 0 || currentPanels <= 0) return null;

  const panels = panelsForTarget(curve, targetAnnualKwh, azimuth, tier);
  if (panels <= 0 || panels === currentPanels) return null;

  return { panels, delta: panels - currentPanels };
}

/** The eight compass points, as the toast names them. */
export type CompassPoint =
  'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';

const POINTS: CompassPoint[] = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
];

/**
 * Which way the array faces, in words.
 *
 * Eight points rather than sixteen: "south-southeast" is not a direction anyone
 * pictures, and the toast has one line to make itself understood.
 */
export function compassPoint(azimuth: number): CompassPoint {
  const normalised = ((azimuth % 360) + 360) % 360;
  return POINTS[Math.round(normalised / 45) % 8];
}

/** True when the toast should say "back to south" rather than name a heading. */
export function isBackToSouth(azimuth: number): boolean {
  return isFacingSouth(azimuth);
}
