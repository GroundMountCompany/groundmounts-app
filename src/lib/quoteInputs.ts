import {
  BATTERY,
  PANELS,
  type PanelTier,
  type SlopeTierName,
} from '@/config/pricing';
import { priceQuote, subtotals, spread, type Quote } from './pricing';
import {
  REFERENCE_AZIMUTHS,
  TX_FALLBACK_CURVE,
  annualKwh,
  type ProductionCurve,
} from './production';

/**
 * The inputs a quote is computed from, and nothing else.
 *
 * Prices are never accepted from a browser. The client describes the design it
 * drew — panels, tier, trench, options, what we know about the ground — and the
 * server prices it. Anything else means the number in the customer's email and
 * the number in the owner's Airtable are whatever the page was told to say.
 */
export interface QuoteInputs {
  panelCount: number;
  tier: PanelTier;
  trenchFeet: number;
  batteryUnits: number;
  needsClearing: boolean;
  slopePercent: number | null;
  slopeTier: SlopeTierName | null;
  soilClass: string | null;
  azimuth: number;
  productionCurve: ProductionCurve;
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
 * A curve is only usable if it has a finite positive sample at every reference
 * azimuth. A partial or hostile one falls back to the Texas reference rather
 * than failing the request: it affects the production figure, not the price,
 * and the customer should still get their quote.
 */
function parseCurve(value: unknown): ProductionCurve {
  if (!value || typeof value !== 'object') return TX_FALLBACK_CURVE;
  const raw = value as Record<string, unknown>;
  const curve: ProductionCurve = {};

  for (const azimuth of REFERENCE_AZIMUTHS) {
    const sample = Number(raw[String(azimuth)]);
    if (!Number.isFinite(sample) || sample <= 0 || sample > 10_000) return TX_FALLBACK_CURVE;
    curve[azimuth] = sample;
  }
  return curve;
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
    slopePercent,
    slopeTier,
    soilClass,
    azimuth,
    productionCurve: parseCurve(obj.productionCurve),
  };
}

/** Price a validated design. The only place a server-side quote comes from. */
export function priceFromInputs(inputs: QuoteInputs): PricedQuote {
  const quote = priceQuote(
    { panelCount: inputs.panelCount, tier: inputs.tier, trenchFeet: inputs.trenchFeet },
    { batteryUnits: inputs.batteryUnits, needsClearing: inputs.needsClearing },
    {
      slopePercent: inputs.slopePercent,
      slopeTier: inputs.slopeTier,
      soilClass: inputs.soilClass,
    }
  );

  const parts = subtotals(quote);

  return {
    quote,
    systemSizeKw: Number(((inputs.panelCount * PANELS[inputs.tier].watts) / 1000).toFixed(2)),
    annualProductionKwh: annualKwh(inputs.productionCurve, quote.systemKw, inputs.azimuth),
    equipment: spread(parts.equipment),
    trench: spread(parts.trench),
  };
}
