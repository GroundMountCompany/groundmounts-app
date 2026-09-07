import {
  BATTERY,
  PANELS,
  SITE,
  type PanelTier,
  type SlopeAnswer,
  type SlopeTierName,
} from '@/config/pricing';
import { availableOnly, priceQuote, subtotals, spread, type Quote } from './pricing';
import { TX_FALLBACK_CURVE, annualKwh, type ProductionCurve } from './production';

/**
 * The inputs a quote is computed from, and nothing else.
 *
 * Prices are never accepted from a browser. The client describes the design it
 * drew — panels, tier, trench, options, where on the earth it sits — and the
 * server prices it. Anything else means the number in the customer's email and
 * the number in the owner's Airtable are whatever the page was told to say.
 *
 * The production curve is not in here either, for the same reason. It used to
 * be, and five samples of 9,999 kWh/kW made a 16-panel array produce 69,593
 * kWh a year. The server looks the curve up itself from `arrayCenter`.
 */
export interface QuoteInputs {
  panelCount: number;
  tier: PanelTier;
  trenchFeet: number;
  batteryUnits: number;
  needsClearing: boolean;
  /**
   * The customer's own answers about the ground. These, and only these, price
   * the site adders — see PricingSite.
   */
  slopeAnswer: SlopeAnswer;
  rocky: boolean;
  /** Recorded on the lead, priced nowhere. */
  batteryInterest: boolean;
  /**
   * What the surveys found. Recorded for the owner, and used to pre-select the
   * answers above on the options step. Never priced.
   */
  slopePercent: number | null;
  slopeTier: SlopeTierName | null;
  soilClass: string | null;
  azimuth: number;
  /** [lng, lat] of the array, so the server can look up its own curve. */
  arrayCenter: [number, number] | null;
}

export interface PricedQuote {
  quote: Quote;
  systemSizeKw: number;
  annualProductionKwh: number;
  equipment: { low: number; high: number };
  trench: { low: number; high: number };
}

/**
 * Bounds on a design that a person could actually be quoted for.
 *
 * These are sanity limits, not business rules: the point is that a tampered
 * payload cannot make the server do arithmetic on a million panels or a trench
 * to the moon. A real design is nowhere near any of them.
 */
const MAX_PANELS = 2000;
const MAX_TRENCH_FEET = 20_000;
const MAX_SLOPE_PERCENT = 200;
const MAX_SOIL_CLASS_CHARS = 120;

const SLOPE_TIER_NAMES: SlopeTierName[] = ['Flat', 'Rolling', 'Steep', 'Unknown'];

/** The only three slope answers that price anything. */
const SLOPE_ANSWERS = Object.keys(SITE.slopeAnswers) as SlopeAnswer[];

/**
 * The customer's slope answer, bounded.
 *
 * A value we do not recognise is a tampered or broken payload and is refused.
 * An *absent* one is not: a browser running a cached bundle from before this
 * shipped should still get a quote, on the answer that adds nothing, rather
 * than a 400 it cannot explain.
 */
function parseSlopeAnswer(value: unknown): SlopeAnswer {
  if (value === undefined || value === null) return 'flat';
  if (typeof value !== 'string' || !SLOPE_ANSWERS.includes(value as SlopeAnswer)) {
    throw new InvalidQuoteInputs('unknown slope answer');
  }
  return value as SlopeAnswer;
}

export class InvalidQuoteInputs extends Error {}

function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') throw new InvalidQuoteInputs('quote inputs missing');
  return raw as Record<string, unknown>;
}

function requireCount(value: unknown, name: string, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    throw new InvalidQuoteInputs(`${name} out of range`);
  }
  return Math.round(n);
}

/**
 * Where the array sits, if the payload says anything usable.
 *
 * Null rather than an error: a design with no coordinates still has a price,
 * it just gets the reference curve for its production figure.
 */
function parseArrayCenter(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [lng, lat] = value.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

/** Validate a client payload into inputs the pricing engine will accept. */
export function parseQuoteInputs(raw: unknown): QuoteInputs {
  const obj = asRecord(raw);

  const panelCount = requireCount(obj.panelCount, 'panelCount', MAX_PANELS);
  if (panelCount < 1) throw new InvalidQuoteInputs('panelCount out of range');

  const tier = obj.tier;
  if (typeof tier !== 'string' || !(tier in PANELS)) {
    throw new InvalidQuoteInputs('unknown panel tier');
  }

  const slopePercentRaw = obj.slopePercent;
  let slopePercent: number | null = null;
  if (slopePercentRaw !== null && slopePercentRaw !== undefined) {
    const n = Number(slopePercentRaw);
    if (!Number.isFinite(n) || n < 0 || n > MAX_SLOPE_PERCENT) {
      throw new InvalidQuoteInputs('slopePercent out of range');
    }
    slopePercent = n;
  }

  const slopeTierRaw = obj.slopeTier;
  const slopeTier =
    typeof slopeTierRaw === 'string' && SLOPE_TIER_NAMES.includes(slopeTierRaw as SlopeTierName)
      ? (slopeTierRaw as SlopeTierName)
      : null;

  const soilRaw = obj.soilClass;
  const soilClass =
    typeof soilRaw === 'string' && soilRaw.trim() !== ''
      ? soilRaw.trim().slice(0, MAX_SOIL_CLASS_CHARS)
      : null;

  const azimuthRaw = Number(obj.azimuth);
  const azimuth = Number.isFinite(azimuthRaw) ? ((azimuthRaw % 360) + 360) % 360 : 180;

  return {
    panelCount,
    tier: tier as PanelTier,
    trenchFeet: requireCount(obj.trenchFeet, 'trenchFeet', MAX_TRENCH_FEET),
    batteryUnits: requireCount(obj.batteryUnits, 'batteryUnits', BATTERY.maxUnits),
    needsClearing: obj.needsClearing === true,
    slopeAnswer: parseSlopeAnswer(obj.slopeAnswer),
    rocky: obj.rocky === true,
    batteryInterest: obj.batteryInterest === true,
    slopePercent,
    slopeTier,
    soilClass,
    azimuth,
    arrayCenter: parseArrayCenter(obj.arrayCenter),
  };
}

/**
 * Price a validated design.
 *
 * The curve is a parameter, and on the server it always comes from the site
 * lookup rather than the request. It defaults to the Texas reference so the
 * price — which does not depend on the curve at all — can be computed without
 * a network call.
 */
export function priceFromInputs(
  inputs: QuoteInputs,
  curve: ProductionCurve = TX_FALLBACK_CURVE
): PricedQuote {
  // Normalised once, here, so the systemSizeKw below and the record that gets
  // written describe the same design the price describes.
  const buildable = availableOnly(
    { panelCount: inputs.panelCount, tier: inputs.tier, trenchFeet: inputs.trenchFeet },
    { batteryUnits: inputs.batteryUnits, needsClearing: inputs.needsClearing }
  );

  const quote = priceQuote(buildable.design, buildable.options, {
    slopeAnswer: inputs.slopeAnswer,
    rocky: inputs.rocky,
  });

  const parts = subtotals(quote);

  return {
    quote,
    systemSizeKw: Number(
      ((buildable.design.panelCount * PANELS[buildable.design.tier].watts) / 1000).toFixed(2)
    ),
    annualProductionKwh: annualKwh(curve, quote.systemKw, inputs.azimuth),
    equipment: spread(parts.equipment),
    trench: spread(parts.trench),
  };
}

/** What the server will actually build, after disabled options are dropped. */
export function buildableInputs(inputs: QuoteInputs): QuoteInputs {
  const { design, options } = availableOnly(
    { panelCount: inputs.panelCount, tier: inputs.tier, trenchFeet: inputs.trenchFeet },
    { batteryUnits: inputs.batteryUnits, needsClearing: inputs.needsClearing }
  );
  return { ...inputs, ...design, ...options };
}
