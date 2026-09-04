import { useQuoteStore } from '@/store/quoteStore';
import { captureMap } from './screenshot';
import { mapRef } from '@/store/mapRefs';
import { PANELS } from '@/config/pricing';
import { priceQuote, subtotals, spread } from './pricing';
import { annualKwh } from './production';

export interface LeadQuote {
  totalPanels: number;
  /** Trench run in feet, straight from the map. The single source of truth. */
  trenchFeet: number;
  azimuth: number;
  panelTier: string;
  slopePercent: number | null;
  slopeTier: string;
  soilClass: string | null;
  percentage: number;
  avgBill: number;
  highBill: number;
  systemSizeKw: number;
  coordinates: { latitude: number; longitude: number };
  arrayCenter: [number, number] | null;
  meter: [number, number] | null;

  // --- Pricing (Phase 3) ---
  batteryUnits: number;
  needsClearing: boolean;
  priceLow: number;
  priceHigh: number;
  equipmentLow: number;
  equipmentHigh: number;
  trenchingLow: number;
  trenchingHigh: number;
  /** The full breakdown, so the record shows how the number was reached. */
  lineItemsJson: string;
  /** The same line items, unserialised, for the email to render. */
  lineItems: Array<{ key: string; label: string; detail?: string; amount: number }>;
  estimate: number;
  annualProductionKwh: number;
}

export interface LeadPayload {
  id: string;
  state: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string;
  quote: LeadQuote;
  ts: number;
  honeypot: string;
  ttc_ms: number;
  mapScreenshot?: string;
}

type QuoteState = ReturnType<typeof useQuoteStore.getState>;

export interface LeadContact {
  name: string;
  email: string;
  phone: string;
  state: string;
  source: string;
  honeypot: string;
}

/**
 * Build the lead payload from store state.
 *
 * Extracted so the mapping is unit-testable: the trench distance the customer
 * saw on the map must be the number that reaches Airtable. v1 carried it inside
 * `electricalMeter.distanceInFeet`, which was written by three different code
 * paths and silently disagreed with the map.
 */
export function buildLeadPayload(
  s: QuoteState,
  contact: LeadContact,
  now: number
): LeadPayload {
  const watts = PANELS[s.panelTier].watts;

  // Priced here rather than passed in, so the record and the screen cannot
  // disagree: both derive from the same store state through the same function.
  const quote = priceQuote(
    { panelCount: s.totalPanels, tier: s.panelTier, trenchFeet: s.trenchFeet },
    { batteryUnits: s.batteryUnits, needsClearing: s.needsClearing },
    { slopePercent: s.slopePercent, slopeTier: s.slopeTier, soilClass: s.soilClass }
  );
  const parts = subtotals(quote);
  const equipment = spread(parts.equipment);
  const trenching = spread(parts.trench);

  return {
    id: s.leadId,
    state: contact.state,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    address: s.address,
    source: contact.source,
    quote: {
      totalPanels: s.totalPanels,
      trenchFeet: s.trenchFeet,
      azimuth: Math.round(s.azimuth),
      panelTier: s.panelTier,
      slopePercent: s.slopePercent,
      slopeTier: quote.slopeTier,
      soilClass: s.soilClass,
      percentage: s.percentage,
      avgBill: s.avgValue,
      highBill: s.highestValue,
      systemSizeKw: Number(((s.totalPanels * watts) / 1000).toFixed(2)),
      coordinates: s.coordinates,
      arrayCenter: s.arrayCenter,
      meter: s.electricalMeterPosition,
      batteryUnits: s.batteryUnits,
      needsClearing: s.needsClearing,
      priceLow: quote.low,
      priceHigh: quote.high,
      equipmentLow: equipment.low,
      equipmentHigh: equipment.high,
      trenchingLow: trenching.low,
      trenchingHigh: trenching.high,
      lineItemsJson: JSON.stringify(quote.lineItems),
      lineItems: quote.lineItems,
      estimate: quote.estimate,
      annualProductionKwh: annualKwh(s.productionCurve, quote.systemKw, s.azimuth),
    },
    ts: now,
    honeypot: contact.honeypot,
    ttc_ms: now - s.startedAt,
    mapScreenshot: s.mapScreenshot ?? undefined,
  };
}

/**
 * The only way out of the design step.
 *
 * Both the in-form button and the mobile sticky CTA call this, so the map is
 * always captured before the funnel advances. The sticky CTA used to bypass it
 * entirely and leads submitted from a phone arrived with no screenshot.
 */
export async function captureAndAdvance(next: number): Promise<void> {
  const { setMapScreenshot, setCurrentStepIndex } = useQuoteStore.getState();
  const { dataUrl, reason } = await captureMap(mapRef.current);
  if (dataUrl) {
    setMapScreenshot(dataUrl);
    console.log('[MAP_SCREENSHOT] captured', Math.round(dataUrl.length / 1024), 'KB');
  } else {
    console.warn('[MAP_SCREENSHOT] skipped:', reason);
  }
  setCurrentStepIndex(next);
}
