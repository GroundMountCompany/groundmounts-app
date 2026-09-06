import {
  PANELS,
  TRENCH,
  BATTERY,
  SITE,
  RANGE_SPREAD_PCT,
  RACKING,
  type PanelTier,
  type RackingConfig,
  type SlopeAnswer,
  batteryPrice,
} from '@/config/pricing';
import { footprintFt } from './geo/array';

/**
 * What the customer designed.
 */
export interface PricingDesign {
  panelCount: number;
  tier: PanelTier;
  trenchFeet: number;
}

/**
 * What they chose on the options step.
 */
export interface PricingOptions {
  batteryUnits: number;
  /** The ground needs brush or trees taken out before anything is built. */
  needsClearing: boolean;
}

/**
 * What the customer told us about the ground.
 *
 * Not what the survey found. The terrain and soil lookups still run and still
 * reach the lead, but from Phase 9 they only *pre-select* these answers — the
 * price follows the person standing on the land. A DEM tile sampled at 200 ft
 * was deciding a five-figure number on their behalf, and it has no way to know
 * about the ledge under the corner of the field.
 */
export interface PricingSite {
  slopeAnswer: SlopeAnswer;
  rocky: boolean;
}

export interface LineItem {
  key: string;
  /** Shown to the customer. */
  label: string;
  /** Shown under the label, when there is something worth saying. */
  detail?: string;
  amount: number;
}

export interface Quote {
  low: number;
  high: number;
  /** The midpoint the range is built around. */
  estimate: number;
  lineItems: LineItem[];
  systemKw: number;
  /** The answers the price was built from, for the record. */
  slopeAnswer: SlopeAnswer;
  rocky: boolean;
  /** Percentage adders that were applied, for the record. */
  slopeAdderPct: number;
  rockyAdderPct: number;
}

const round = (n: number) => Math.round(n);

/** How each slope answer reads on the line item. */
const SLOPE_DETAIL: Record<SlopeAnswer, string> = {
  flat: 'flat ground',
  slight: 'slight slope',
  big: 'big slope',
};

/** Which conduit row applies to this system. */
export function conduitFor(systemKw: number, hasBattery: boolean) {
  const row =
    TRENCH.conduitSchedule.find((r) => systemKw <= r.maxKw) ??
    // The schedule ends with an Infinity row, so this is only reachable if the
    // config is edited into an incomplete state.
    TRENCH.conduitSchedule[TRENCH.conduitSchedule.length - 1];

  // A battery adds a run alongside whatever the system size called for.
  return {
    ...row,
    conduits: hasBattery ? row.conduits + 1 : row.conduits,
    multiplier: hasBattery ? row.multiplier + TRENCH.batteryMultiplierAdder : row.multiplier,
  };
}

/** What the customer's slope answer adds to the groundwork. */
export function slopeAdderFor(answer: SlopeAnswer): number {
  return SITE.slopeAnswers[answer] ?? SITE.slopeAnswers.flat;
}

/** What answering "rocky" adds to the groundwork. */
export function rockyAdderFor(rocky: boolean): number {
  return rocky ? SITE.rockyAdderPct : 0;
}

/**
 * Whether a soil survey description should pre-select "Rocky".
 *
 * SSURGO returns free text like "Tarrant rock outcrop complex", so the hints
 * are matched by substring. This only decides which button starts pressed —
 * the customer's answer is what prices.
 */
export function looksRocky(soilClass: string | null): boolean {
  if (!soilClass) return false;
  const text = soilClass.toLowerCase();
  return SITE.rockySoilHints.some((hint) => text.includes(hint));
}

/** Acres to clear: the array footprint plus working room on every side. */
/**
 * What clearing costs for a given area.
 *
 * A flat charge covers turning up and anything up to a quarter of an acre —
 * most arrays — and only the excess is charged by the acre.
 */
export function clearingPrice(acres: number): number {
  const { baseCharge, baseAcres, perAcre } = SITE.vegetationClearing;
  if (acres <= baseAcres) return baseCharge;
  return baseCharge + (acres - baseAcres) * perAcre;
}

export function clearingAcres(
  panelCount: number,
  tier: PanelTier,
  racking: RackingConfig = RACKING
): number {
  const fp = footprintFt(panelCount, tier, racking);
  if (fp.widthFt === 0) return 0;
  const margin = SITE.vegetationClearing.marginFt * 2;
  const sqFt = (fp.widthFt + margin) * (fp.depthFt + margin);
  return sqFt / 43_560;
}

/**
 * Price a design.
 *
 * Pure, so it can be tested without a browser and audited by reading it. Every
 * number it uses comes from pricing.ts; nothing here is a literal.
 */
/**
 * The design as it can actually be built today.
 *
 * A disabled option cannot be priced, so a payload asking for one is treated
 * as not having asked. This is the single place that decision is made, so the
 * screen, the quote and the record cannot disagree about what was ordered.
 */
export interface OptionAvailability {
  premiumPanels: boolean;
  battery: boolean;
  sitePrep: boolean;
}

/** What pricing.ts currently says is on offer. */
export function currentAvailability(): OptionAvailability {
  return {
    premiumPanels: PANELS.premium.enabled,
    battery: BATTERY.enabled,
    sitePrep: SITE.vegetationClearing.enabled,
  };
}

export function availableOnly(
  design: { panelCount: number; tier: PanelTier; trenchFeet: number },
  options: { batteryUnits: number; needsClearing: boolean },
  // Injectable so both states can be tested without editing the config the
  // rest of the suite asserts against.
  available: OptionAvailability = currentAvailability()
): {
  design: { panelCount: number; tier: PanelTier; trenchFeet: number };
  options: { batteryUnits: number; needsClearing: boolean };
} {
  const tierAvailable = design.tier === 'premium' ? available.premiumPanels : true;

  return {
    design: { ...design, tier: tierAvailable ? design.tier : 'standard' },
    options: {
      batteryUnits: available.battery ? options.batteryUnits : 0,
      needsClearing: available.sitePrep ? options.needsClearing : false,
    },
  };
}

export function priceQuote(
  rawDesign: PricingDesign,
  rawOptions: PricingOptions,
  site: PricingSite,
  availability: OptionAvailability = currentAvailability()
): Quote {
  // Whatever was asked for, priced as it can be built. An option the owner has
  // not switched on is not a thing anybody can buy today.
  const available = availableOnly(rawDesign, rawOptions, availability);
  const design: PricingDesign = { ...rawDesign, ...available.design };
  const options: PricingOptions = { ...rawOptions, ...available.options };

  const product = PANELS[design.tier];
  const systemKw = (design.panelCount * product.watts) / 1000;
  const hasBattery = options.batteryUnits > 0;

  const lineItems: LineItem[] = [];

  // Equipment and installation, priced per watt.
  const equipment = systemKw * 1000 * product.pricePerWatt;
  lineItems.push({
    key: 'equipment',
    label: 'Panels and installation',
    detail: `${design.panelCount} x ${product.watts}W ${product.name}`,
    amount: round(equipment),
  });

  // Trenching, at a rate that rises with what has to go down the trench.
  const conduit = conduitFor(systemKw, hasBattery);
  const trench = design.trenchFeet * TRENCH.basePerFt * conduit.multiplier;
  lineItems.push({
    key: 'trench',
    label: 'Trenching',
    detail: `${design.trenchFeet} ft, ${conduit.conduits} x ${conduit.sizeIn}" conduit`,
    amount: round(trench),
  });

  if (hasBattery) {
    const battery = batteryPrice(options.batteryUnits);
    lineItems.push({
      key: 'battery',
      label: 'Battery',
      detail: `${options.batteryUnits} x ${BATTERY.kwh} kWh`,
      amount: round(battery),
    });
  }

  // Site adders apply to the work already priced, not to the battery: a harder
  // slope does not make the battery cost more.
  const groundwork = equipment + trench;

  const slopeAdderPct = slopeAdderFor(site.slopeAnswer);
  if (slopeAdderPct > 0) {
    lineItems.push({
      key: 'slope',
      label: 'Slope',
      detail: SLOPE_DETAIL[site.slopeAnswer],
      amount: round(groundwork * slopeAdderPct),
    });
  }

  const rockyAdderPct = rockyAdderFor(site.rocky);
  if (rockyAdderPct > 0) {
    lineItems.push({
      key: 'soil',
      label: 'Ground conditions',
      detail: 'rocky ground',
      amount: round(groundwork * rockyAdderPct),
    });
  }

  if (options.needsClearing) {
    const acres = clearingAcres(design.panelCount, design.tier);
    lineItems.push({
      key: 'clearing',
      label: 'Clearing',
      detail: `${acres.toFixed(2)} acres`,
      amount: round(clearingPrice(acres)),
    });
  }

  const estimate = lineItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    estimate,
    low: round(estimate * (1 - RANGE_SPREAD_PCT)),
    high: round(estimate * (1 + RANGE_SPREAD_PCT)),
    lineItems,
    systemKw: Number(systemKw.toFixed(2)),
    slopeAnswer: site.slopeAnswer,
    rocky: site.rocky,
    slopeAdderPct,
    rockyAdderPct,
  };
}

/** Equipment and trench subtotals, for the Airtable columns that split them. */
export function subtotals(quote: Quote): {
  equipment: number;
  trench: number;
} {
  const find = (key: string) => quote.lineItems.find((i) => i.key === key)?.amount ?? 0;
  return { equipment: find('equipment'), trench: find('trench') };
}

/** Apply the range spread to any single figure, for the split-out columns. */
export function spread(amount: number): { low: number; high: number } {
  return {
    low: round(amount * (1 - RANGE_SPREAD_PCT)),
    high: round(amount * (1 + RANGE_SPREAD_PCT)),
  };
}
