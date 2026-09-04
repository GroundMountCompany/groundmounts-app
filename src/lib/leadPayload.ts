import { useQuoteStore } from '@/store/quoteStore';
import { captureMap } from './screenshot';
import { mapRef } from '@/store/mapRefs';
import type { QuoteInputs } from './quoteInputs';

export interface LeadQuote {
  /**
   * Everything the price is computed from. The server prices these itself.
   *
   * No price of any kind is sent from the browser: whatever this page believes
   * it costs is a display concern, and a payload that carried the money would
   * be a payload anyone could edit.
   */
  inputs: QuoteInputs;

  // --- Context, not money. The customer's own answers and where they are. ---
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
  /** Present only when they uploaded a bill and confirmed what we read. */
  billMonths: Array<{ month: string; kwh: number; cost: number | null }> | null;
  billAnnualKwh: number | null;
  coordinates: { latitude: number; longitude: number };
  arrayCenter: [number, number] | null;
  meter: [number, number] | null;
  batteryUnits: number;
  needsClearing: boolean;
}

export interface LeadPayload {
  id: string;
  state: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string;
  brand?: string;
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
  /** Where the visitor came from. Recorded, and nothing more. */
  source: string;
  /** Which brand the funnel wears. Never derived from `source`. */
  brand?: string;
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
  const inputs: QuoteInputs = {
    panelCount: s.totalPanels,
    tier: s.panelTier,
    trenchFeet: s.trenchFeet,
    batteryUnits: s.batteryUnits,
    needsClearing: s.needsClearing,
    slopePercent: s.slopePercent,
    slopeTier: s.slopeTier,
    soilClass: s.soilClass,
    azimuth: Math.round(s.azimuth),
    arrayCenter: s.arrayCenter,
  };

  return {
    id: s.leadId,
    state: contact.state,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    address: s.address,
    source: contact.source,
    brand: contact.brand,
    quote: {
      inputs,
      totalPanels: s.totalPanels,
      trenchFeet: s.trenchFeet,
      azimuth: Math.round(s.azimuth),
      panelTier: s.panelTier,
      slopePercent: s.slopePercent,
      slopeTier: s.slopeTier,
      soilClass: s.soilClass,
      percentage: s.percentage,
      avgBill: s.avgValue,
      highBill: s.highestValue,
      billMonths: s.billMonths,
      billAnnualKwh: s.billAnnualKwh,
      coordinates: s.coordinates,
      arrayCenter: s.arrayCenter,
      meter: s.electricalMeterPosition,
      batteryUnits: s.batteryUnits,
      needsClearing: s.needsClearing,
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
