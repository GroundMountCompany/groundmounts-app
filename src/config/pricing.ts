/**
 * The only file in the codebase that may contain product dimensions or money.
 *
 * Phase 2 seeds the panel and racking sections because the array geometry needs
 * real dimensions. Phase 3 adds trench, battery, site conditions and the pure
 * pricing function. Values marked PLACEHOLDER are owner-confirmable guesses.
 */

export interface PanelProduct {
  name: string;
  watts: number;
  /** Short edge, inches. */
  widthIn: number;
  /** Long edge, inches. */
  heightIn: number;
  pricePerWatt: number;
  warranty: string;
}

export type PanelTier = 'standard' | 'premium';

export const PANELS: Record<PanelTier, PanelProduct> = {
  standard: {
    name: 'Mission Solar MSX10-435HN0B',
    watts: 435,
    widthIn: 44.7,
    heightIn: 67.8,
    pricePerWatt: 3.5,
    warranty: '25-year product and performance',
  },
  premium: {
    // PLACEHOLDER - owner to confirm make, wattage, dimensions and price.
    name: 'Premium 460W (TBD)',
    watts: 460,
    widthIn: 44.6,
    heightIn: 71.5,
    pricePerWatt: 3.95,
    warranty: '30-year product and performance',
  },
};

export type RackingPreset = 'ironridge' | 'gft';

export interface RackingConfig {
  name: string;
  /**
   * How each panel sits on the rails. Landscape puts the panel's long edge
   * across the table; portrait stands it on the short edge.
   */
  orientation: 'landscape' | 'portrait';
  /** Panels stacked up the slope. One continuous table — there are no row gaps. */
  panelsHigh: number;
  /** Clamp gap between adjacent panels, both directions. */
  panelGapIn: number;
  /**
   * Tilt off horizontal. Only affects the *ground footprint*: a tilted panel
   * covers less ground than its slant length.
   * PLACEHOLDER - owner to confirm the real tilt for each racking type.
   */
  tiltDeg: number;
}

export const RACKING_PRESETS: Record<RackingPreset, RackingConfig> = {
  ironridge: {
    name: 'IronRidge',
    orientation: 'landscape',
    panelsHigh: 4,
    panelGapIn: 0.25,
    tiltDeg: 25,
  },
  gft: {
    name: 'Unirac GFT / Sinclair',
    orientation: 'portrait',
    panelsHigh: 2,
    panelGapIn: 0.25,
    tiltDeg: 25,
  },
};

export const DEFAULT_RACKING: RackingPreset = 'ironridge';

export const RACKING: RackingConfig = RACKING_PRESETS[DEFAULT_RACKING];

/** Feet per inch, so panel dimensions convert in one place. */
export const INCHES_PER_FOOT = 12;

export function panelWidthFt(p: PanelProduct): number {
  return p.widthIn / INCHES_PER_FOOT;
}

export function panelHeightFt(p: PanelProduct): number {
  return p.heightIn / INCHES_PER_FOOT;
}
