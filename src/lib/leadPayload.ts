import { useQuoteStore } from '@/store/quoteStore';
import { captureMap } from './screenshot';
import { mapRef } from '@/store/mapRefs';
import { PANELS } from '@/config/pricing';

export interface LeadQuote {
  quotation: number;
  totalPanels: number;
  additionalCost: number;
  /** Trench run in feet, straight from the map. The single source of truth. */
  trenchFeet: number;
  azimuth: number;
  panelTier: string;
  slopePercent: number | null;
  slopeTier: string;
  percentage: number;
  avgBill: number;
  highBill: number;
  systemSizeKw: number;
  coordinates: { latitude: number; longitude: number };
  arrayCenter: [number, number] | null;
  meter: [number, number] | null;
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
  return {
    id: s.leadId,
    state: contact.state,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    address: s.address,
    source: contact.source,
    quote: {
      quotation: s.quotation,
      totalPanels: s.totalPanels,
      additionalCost: s.additionalCost,
      trenchFeet: s.trenchFeet,
      azimuth: Math.round(s.azimuth),
      panelTier: s.panelTier,
      slopePercent: s.slopePercent,
      slopeTier: s.slopeTier,
      percentage: s.percentage,
      avgBill: s.avgValue,
      highBill: s.highestValue,
      systemSizeKw: Number(((s.totalPanels * watts) / 1000).toFixed(2)),
      coordinates: s.coordinates,
      arrayCenter: s.arrayCenter,
      meter: s.electricalMeterPosition,
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
