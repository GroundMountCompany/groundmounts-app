import {
  PANELS,
  TRENCH,
  BATTERY,
  SITE,
  RANGE_SPREAD_PCT,
  RACKING,
  type PanelTier,
  type RackingConfig,
  type SlopeTierName,
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
 * What we found out about the ground, or failed to.
 */
export interface PricingSite {
  slopePercent: number | null;
  /** SSURGO texture description, or null when the lookup failed. */
  soilClass: string | null;
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
  slopeTier: SlopeTierName;
  /** Percentage adders that were applied, for the record. */
  slopeAdderPct: number;
  soilAdderPct: number;
}

const round = (n: number) => Math.round(n);

/** Which conduit row applies to this system. */
export function conduitFor(systemKw: number, hasBattery: boolean) {
  return (
    TRENCH.conduitSchedule.find(
      (row) => row.hasBattery === hasBattery && systemKw <= row.maxKw
    ) ??
    // The schedule ends with an Infinity row for each battery case, so this is
    // only reachable if the config is edited into an incomplete state.
    TRENCH.conduitSchedule[TRENCH.conduitSchedule.length - 1]
  );
}

/** The slope tier a measured grade falls into. */
export function slopeTierFor(slopePercent: number | null): {
  name: SlopeTierName;
  adderPct: number;
} {
  if (slopePercent === null) return { name: 'Unknown', adderPct: 0 };
  const tier =
    SITE.slopeTiers.find((t) => slopePercent < t.maxPercent) ??
    SITE.slopeTiers[SITE.slopeTiers.length - 1];
  return { name: tier.name, adderPct: tier.adderPct };
}

/**
 * The adder for a soil description.
 *
 * SSURGO returns free text like "Windthorst fine sandy loam", so the config is
 * matched by substring. The longest match wins, so "clay loam" beats "clay".
 */
export function soilAdderFor(soilClass: string | null): number {
  if (!soilClass) return SITE.defaultSoilAdderPct;
  const text = soilClass.toLowerCase();

  const match = Object.keys(SITE.soilAdders)
    .filter((key) => text.includes(key))
    .sort((a, b) => b.length - a.length)[0];

  return match === undefined ? SITE.defaultSoilAdderPct : SITE.soilAdders[match];
}

/** Acres to clear: the array footprint plus working room on every side. */
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
export function priceQuote(
  design: PricingDesign,
  options: PricingOptions,
  site: PricingSite
): Quote {
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
    const battery = options.batteryUnits * BATTERY.pricePerUnit;
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

  const slope = slopeTierFor(site.slopePercent);
  if (slope.adderPct > 0) {
    lineItems.push({
      key: 'slope',
      label: 'Slope',
      detail: `${slope.name.toLowerCase()} ground`,
      amount: round(groundwork * slope.adderPct),
    });
  }

  const soilAdderPct = soilAdderFor(site.soilClass);
  if (soilAdderPct > 0) {
    lineItems.push({
      key: 'soil',
      label: 'Ground conditions',
      detail: site.soilClass ?? undefined,
      amount: round(groundwork * soilAdderPct),
    });
  }

  if (options.needsClearing) {
    const acres = clearingAcres(design.panelCount, design.tier);
    lineItems.push({
      key: 'clearing',
      label: 'Clearing',
      detail: `${acres.toFixed(2)} acres`,
      amount: round(
        Math.max(SITE.vegetationClearing.minimum, acres * SITE.vegetationClearing.perAcre)
      ),
    });
  }

  const estimate = lineItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    estimate,
    low: round(estimate * (1 - RANGE_SPREAD_PCT)),
    high: round(estimate * (1 + RANGE_SPREAD_PCT)),
    lineItems,
    systemKw: Number(systemKw.toFixed(2)),
    slopeTier: slope.name,
    slopeAdderPct: slope.adderPct,
    soilAdderPct,
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
