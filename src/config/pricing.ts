/**
 * The only file in the codebase that may contain product dimensions or money.
 *
 * The owner edits this and nothing else. A unit test greps the repository and
 * fails on any dollar figure or dollars-per-watt found outside it.
 *
 * Values marked PLACEHOLDER are seeds, not quotes. They are plausible enough to
 * exercise the maths and wrong enough that nobody should send them to a
 * customer without confirming them first.
 */

export interface PanelProduct {
  /**
   * Whether customers may choose this.
   *
   * A placeholder price is not a quote. An option whose numbers the owner has
   * not confirmed does not appear on the options step, is not priced, and does
   * not reach the lead — rather than being shown with a figure nobody stands
   * behind.
   */
  enabled: boolean;
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
    enabled: true,
    name: 'Mission Solar MSX10-435HN0B',
    watts: 435,
    widthIn: 44.7,
    heightIn: 67.8,
    pricePerWatt: 3.5,
    warranty: '25-year product and performance',
  },
  premium: {
    // PLACEHOLDER - owner to confirm make, wattage, dimensions and price.
    // Off until they do.
    enabled: false,
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
   * covers less ground than its slant length. Confirmed by the owner.
   */
  tiltDeg: number;
}

export const RACKING_PRESETS: Record<RackingPreset, RackingConfig> = {
  ironridge: {
    name: 'IronRidge',
    orientation: 'landscape',
    panelsHigh: 4,
    panelGapIn: 0.25,
    tiltDeg: 30,
  },
  gft: {
    name: 'Unirac GFT / Sinclair',
    orientation: 'portrait',
    panelsHigh: 2,
    panelGapIn: 0.25,
    tiltDeg: 30,
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

// --- Trenching -------------------------------------------------------------

export interface ConduitRun {
  /** Applies up to this system size, in kW. */
  maxKw: number;
  /** Whether this row is for a system with a battery. */
  hasBattery: boolean;
  conduits: number;
  sizeIn: number;
  /** Multiplier on the base trench rate. */
  multiplier: number;
}

export interface TrenchConfig {
  /** Open, backfill and conduit for the simplest run. */
  basePerFt: number;
  /**
   * More copper needs more or bigger conduit, and a battery adds a second run.
   * First matching row wins, scanning in order.
   */
  conduitSchedule: ConduitRun[];
}

export const TRENCH: TrenchConfig = {
  basePerFt: 45,
  conduitSchedule: [
    // PLACEHOLDER - owner to confirm the real conduit schedule and multipliers.
    { maxKw: 10, hasBattery: false, conduits: 1, sizeIn: 1.5, multiplier: 1 },
    { maxKw: 20, hasBattery: false, conduits: 1, sizeIn: 2, multiplier: 1.15 },
    { maxKw: Infinity, hasBattery: false, conduits: 2, sizeIn: 2, multiplier: 1.35 },
    { maxKw: 10, hasBattery: true, conduits: 2, sizeIn: 2, multiplier: 1.4 },
    { maxKw: 20, hasBattery: true, conduits: 2, sizeIn: 2, multiplier: 1.55 },
    { maxKw: Infinity, hasBattery: true, conduits: 3, sizeIn: 2, multiplier: 1.75 },
  ],
};

// --- Battery ---------------------------------------------------------------

export interface BatteryConfig {
  /** Off until the owner confirms the product and the price. */
  enabled: boolean;
  name: string;
  kwh: number;
  pricePerUnit: number;
  maxUnits: number;
}

export const BATTERY: BatteryConfig = {
  // PLACEHOLDER - owner to confirm make, capacity and price.
  enabled: false,
  name: 'Home battery (TBD)',
  kwh: 13.5,
  pricePerUnit: 12500,
  maxUnits: 2,
};

// --- Site conditions -------------------------------------------------------

export type SlopeTierName = 'Flat' | 'Rolling' | 'Steep' | 'Unknown';

export interface SlopeTier {
  name: SlopeTierName;
  /** Applies up to this grade, as a percentage. */
  maxPercent: number;
  /** Added to the equipment and trench subtotal. */
  adderPct: number;
}

export interface SiteConfig {
  slopeTiers: SlopeTier[];
  /**
   * Soil that costs more to auger or drive pile into. Keys are matched against
   * the SSURGO texture description, lowercased, by substring.
   */
  soilAdders: Record<string, number>;
  /** Used when the soil lookup fails or returns something unrecognised. */
  defaultSoilAdderPct: number;
  vegetationClearing: {
    /** Whether site prep is offered as a choice on the options step. */
    enabled: boolean;
    /** Charged on the array footprint plus a working margin. */
    perAcre: number;
    /** Minimum charge for any clearing at all. */
    minimum: number;
    /** Working room around the array when computing the cleared area, in feet. */
    marginFt: number;
  };
}

export const SITE: SiteConfig = {
  // PLACEHOLDER - owner to confirm the adders for slope, soil and clearing.
  slopeTiers: [
    { name: 'Flat', maxPercent: 5, adderPct: 0 },
    { name: 'Rolling', maxPercent: 12, adderPct: 0.06 },
    { name: 'Steep', maxPercent: Infinity, adderPct: 0.15 },
  ],
  soilAdders: {
    rock: 0.12,
    caliche: 0.1,
    clay: 0.02,
    'clay loam': 0.02,
    loam: 0,
    sand: 0,
    'sandy loam': 0,
  },
  defaultSoilAdderPct: 0,
  vegetationClearing: {
    // The one option whose numbers are close enough to offer today.
    enabled: true,
    perAcre: 3200,
    minimum: 850,
    marginFt: 15,
  },
};

// --- Defaults --------------------------------------------------------------

export interface QuoteDefaults {
  /** Texas residential average, dollars per kWh. */
  ratePerKwh: number;
  pvwatts: {
    /** Matches the racking tilt the owner installs. */
    tiltDeg: number;
    /** System losses, percent, as PVWatts expects it. */
    lossesPct: number;
    /** 0 = fixed open rack. */
    arrayType: number;
    /** 0 = standard module. */
    moduleType: number;
    /** Sampled once per location; everything between is interpolated. */
    referenceAzimuths: number[];
  };
  /** Used when PVWatts cannot be reached, kWh per kW per year. */
  fallbackKwhPerKwYear: number;
}

export const DEFAULTS: QuoteDefaults = {
  ratePerKwh: 0.14,
  pvwatts: {
    tiltDeg: 30,
    lossesPct: 14,
    arrayType: 0,
    moduleType: 0,
    referenceAzimuths: [90, 135, 180, 225, 270],
  },
  fallbackKwhPerKwYear: 1500,
};

/**
 * How far either side of the estimate the quoted range runs.
 *
 * The number on screen is a range because a real bid needs somebody standing on
 * the land. Narrower than this would be pretending to a precision we do not
 * have before a site visit.
 */
export const RANGE_SPREAD_PCT = 0.08;

// Deliberately no tax-credit key: the 30% federal credit expired in Dec 2025
// and there is nothing here to switch back on by accident.
