/**
 * The only file in the codebase that may contain product dimensions or money.
 *
 * The owner edits this and nothing else. A unit test greps the repository and
 * fails on any dollar figure or dollars-per-watt found outside it.
 *
 * Every figure below is owner-confirmed. Anything added later that is not
 * should be marked PLACEHOLDER and, if it prices an option, shipped with
 * `enabled: false` — a card quoting a number nobody stands behind is worse
 * than no card.
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
    enabled: true,
    name: 'REC Alpha Pure-RX 460W',
    watts: 460,
    widthIn: 44.6,
    heightIn: 68.0,
    pricePerWatt: 4.0,
    warranty: '25-year product and performance',
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
  conduits: number;
  sizeIn: number;
  /** Multiplier on the base trench rate. */
  multiplier: number;
}

export interface TrenchConfig {
  /** Open, backfill and conduit for the simplest run. */
  basePerFt: number;
  /**
   * More copper needs more or bigger conduit. First matching row wins,
   * scanning in order.
   */
  conduitSchedule: ConduitRun[];
  /** A battery adds a second run alongside, whatever the system size. */
  batteryMultiplierAdder: number;
}

export const TRENCH: TrenchConfig = {
  basePerFt: 45,
  conduitSchedule: [
    { maxKw: 10, conduits: 1, sizeIn: 1.5, multiplier: 1.0 },
    { maxKw: 20, conduits: 1, sizeIn: 2, multiplier: 1.05 },
    { maxKw: Infinity, conduits: 2, sizeIn: 2, multiplier: 1.2 },
  ],
  batteryMultiplierAdder: 0.05,
};

// --- Battery ---------------------------------------------------------------

export interface BatteryConfig {
  enabled: boolean;
  name: string;
  kwh: number;
  /**
   * The first one carries the inverter and the install; the second is mostly
   * the battery itself, so it is cheaper. Pricing every unit at the first
   * unit's price would over-quote anybody wanting two.
   */
  firstUnit: number;
  additionalUnit: number;
  maxUnits: number;
}

export const BATTERY: BatteryConfig = {
  enabled: true,
  name: 'Tesla Powerwall 3',
  kwh: 13.5,
  firstUnit: 14500,
  additionalUnit: 9500,
  maxUnits: 2,
};

/** What a given number of batteries costs, first unit dearer than the rest. */
export function batteryPrice(units: number): number {
  if (units <= 0) return 0;
  return BATTERY.firstUnit + (units - 1) * BATTERY.additionalUnit;
}

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
    /** Flat charge covering mobilisation and the first `baseAcres`. */
    baseCharge: number;
    baseAcres: number;
    /** Charged per acre beyond `baseAcres`. */
    perAcre: number;
    /** Working room around the array when computing the cleared area, in feet. */
    marginFt: number;
  };
}

export const SITE: SiteConfig = {
  slopeTiers: [
    { name: 'Flat', maxPercent: 5, adderPct: 0 },
    { name: 'Rolling', maxPercent: 12, adderPct: 0.05 },
    { name: 'Steep', maxPercent: Infinity, adderPct: 0.12 },
  ],
  /**
   * Only the ground that costs more to build on is listed.
   *
   * Clay, loam and sand are not here on purpose: they carry no adder, and an
   * explicit zero invites somebody to "tidy up" the config by giving them one.
   */
  soilAdders: {
    caliche: 0.08,
    rock: 0.15,
    'rock outcrop': 0.15,
    limestone: 0.15,
  },
  defaultSoilAdderPct: 0,
  vegetationClearing: {
    enabled: true,
    /** Covers mobilisation and anything up to a quarter of an acre. */
    baseCharge: 1500,
    baseAcres: 0.25,
    /** Charged on whatever is cleared beyond that. */
    perAcre: 2500,
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
