import { describe, it, expect, beforeEach } from 'vitest';
import { useQuoteStore } from '@/store/quoteStore';
import { buildLeadPayload } from './leadPayload';
import { buildTrench } from './geo/trench';
import { autoPlaceArray } from './geo/place';
import type { LngLat } from './geo/units';
import { TRENCH } from '@/config/pricing';
import { conduitFor } from './pricing';
import { parseQuoteInputs, priceFromInputs } from './quoteInputs';

const METER: LngLat = [-97.3208, 32.7555];

const contact = {
  name: 'Bert Ortiz',
  email: 'bert@example.com',
  phone: '469-555-0100',
  state: 'TX',
  source: 'groundmounts.com',
  honeypot: '',
};

beforeEach(() => {
  useQuoteStore.setState({
    leadId: 'lead-1234-5678',
    address: '123 Main St, Fort Worth, TX 76131',
    startedAt: 1_000_000,
    totalPanels: 40,
    panelTier: 'standard',
    avgValue: 240,
    highestValue: 320,
    percentage: 100,
    quotation: 60_900,
    arrayCenter: null,
    electricalMeterPosition: null,
    trenchFeet: 0,
    additionalCost: 0,
    azimuth: 180,
    slopePercent: null,
    slopeTier: 'Unknown',
    mapScreenshot: null,
  });
});

describe('lead payload carries the design the customer actually saw', () => {
  it('sends the same trench distance the map displays', () => {
    // Walk the real flow: place the meter, auto-place the array, let the map
    // compute the trench, then build the payload from the same store.
    const s = useQuoteStore.getState();
    s.setElectricalMeterPosition(METER);

    const { center } = autoPlaceArray({
      meter: METER,
      panelCount: 40,
      tier: 'standard',
      azimuth: 180,
    });
    s.setArrayCenter(center);

    // This is exactly what MapCanvas.syncFromStore writes back.
    const onMap = buildTrench(
      { center, azimuth: 180, panelCount: 40, tier: 'standard' },
      METER
    ).feet;
    useQuoteStore.getState().setTrenchFeet(onMap);

    const payload = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);

    expect(onMap).toBeGreaterThan(0);
    expect(payload.quote.trenchFeet).toBe(onMap);
  });

  it('carries the trench distance the price will be computed from', () => {
    useQuoteStore.getState().setTrenchFeet(120);
    const payload = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);

    // The payload names the design, not the money. Pricing it here is the same
    // arithmetic the server will do when it receives this.
    expect(payload.quote.inputs.trenchFeet).toBe(120);
    const priced = priceFromInputs(parseQuoteInputs(payload.quote.inputs));
    const trench = priced.quote.lineItems.find((i) => i.key === 'trench')!;
    expect(trench.detail).toContain('120 ft');
    // Base rate times the conduit multiplier the schedule picks for this system
    // size — both from pricing.ts, neither repeated here.
    const multiplier = conduitFor(priced.systemSizeKw, false).multiplier;
    expect(trench.amount).toBe(Math.round(TRENCH.basePerFt * 120 * multiplier));
  });

  it('sends no price of any kind', () => {
    useQuoteStore.getState().setTrenchFeet(113);
    const payload = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);

    // A browser cannot be allowed to name the number the owner quotes from, so
    // there must be nothing money-shaped in the payload at all.
    const flat = JSON.stringify(payload.quote);
    for (const key of [
      'priceLow',
      'priceHigh',
      'estimate',
      'lineItems',
      'equipmentLow',
      'trenchingLow',
      'systemSizeKw',
    ]) {
      expect(flat, `payload still carries ${key}`).not.toContain(key);
    }

    // And the inputs it does carry price to something sensible.
    const priced = priceFromInputs(parseQuoteInputs(payload.quote.inputs));
    expect(priced.quote.low).toBeLessThan(priced.quote.estimate);
    expect(priced.quote.high).toBeGreaterThan(priced.quote.estimate);
  });

  it('follows the trench as the array is dragged away', () => {
    const s = useQuoteStore.getState();
    s.setElectricalMeterPosition(METER);

    const near: LngLat = [METER[0], METER[1] - 0.0003];
    const far: LngLat = [METER[0], METER[1] - 0.0012];
    const feetFor = (c: LngLat) =>
      buildTrench({ center: c, azimuth: 180, panelCount: 40, tier: 'standard' }, METER).feet;

    s.setArrayCenter(near);
    useQuoteStore.getState().setTrenchFeet(feetFor(near));
    const first = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);

    s.setArrayCenter(far);
    useQuoteStore.getState().setTrenchFeet(feetFor(far));
    const second = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);

    expect(second.quote.trenchFeet).toBeGreaterThan(first.quote.trenchFeet);
    expect(second.quote.trenchFeet).toBe(feetFor(far));
  });

  it('carries the rest of the design state', () => {
    const s = useQuoteStore.getState();
    s.setAzimuth(215);
    s.setSlope(6.4, 'Rolling');
    s.setArrayCenter([-97.32, 32.75]);
    s.setElectricalMeterPosition(METER);

    const payload = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);

    expect(payload.quote.azimuth).toBe(215);
    expect(payload.quote.slopePercent).toBe(6.4);
    expect(payload.quote.slopeTier).toBe('Rolling');
    expect(payload.quote.panelTier).toBe('standard');
    expect(priceFromInputs(parseQuoteInputs(payload.quote.inputs)).systemSizeKw).toBe(17.4);
    expect(payload.quote.arrayCenter).toEqual([-97.32, 32.75]);
    expect(payload.quote.meter).toEqual(METER);
  });

  it('derives ttc_ms from the session start so the guard can judge it', () => {
    const payload = buildLeadPayload(useQuoteStore.getState(), contact, 1_060_000);
    expect(payload.ttc_ms).toBe(60_000);
    expect(payload.id).toBe('lead-1234-5678');
  });
});
