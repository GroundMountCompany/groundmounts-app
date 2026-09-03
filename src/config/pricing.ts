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

export interface RackingConfig {
  /** Panels are mounted in landscape rows; this is the gap between rows. */
  rowGapFt: number;
  /** Gap between panels within a row (rail clamp spacing). */
  panelGapFt: number;
  /** Default panels per row before starting a new row. */
  panelsPerRow: number;
}

export const RACKING: RackingConfig = {
  // PLACEHOLDER - owner to confirm real row spacing for their racking.
  rowGapFt: 4,
  panelGapFt: 0.08,
  panelsPerRow: 10,
};

/** Feet per inch, so panel dimensions convert in one place. */
export const INCHES_PER_FOOT = 12;

export function panelWidthFt(p: PanelProduct): number {
  return p.widthIn / INCHES_PER_FOOT;
}

export function panelHeightFt(p: PanelProduct): number {
  return p.heightIn / INCHES_PER_FOOT;
}
