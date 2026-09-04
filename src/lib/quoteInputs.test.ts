import { describe, it, expect } from 'vitest';
import { parseQuoteInputs, priceFromInputs, InvalidQuoteInputs } from './quoteInputs';
import { TX_FALLBACK_CURVE, REFERENCE_AZIMUTHS } from './production';
import { BATTERY, PANELS } from '@/config/pricing';

const GOOD = {
  panelCount: 16,
  tier: 'standard',
  trenchFeet: 113,
  batteryUnits: 0,
  needsClearing: false,
  slopePercent: 3,
  slopeTier: 'Flat',
  soilClass: 'clay loam',
  azimuth: 180,
  productionCurve: TX_FALLBACK_CURVE,
};

describe('parsing what a browser claims its design is', () => {
  it('accepts an ordinary design unchanged', () => {
    expect(parseQuoteInputs(GOOD)).toEqual({ ...GOOD, tier: 'standard' });
  });

  it('rejects a design that could not exist', () => {
    const bad: Array<[string, unknown]> = [
      ['nothing at all', undefined],
      ['a string', 'panelCount=16'],
      ['no panels', { ...GOOD, panelCount: 0 }],
      ['negative panels', { ...GOOD, panelCount: -1 }],
      ['a million panels', { ...GOOD, panelCount: 1_000_000 }],
      ['NaN panels', { ...GOOD, panelCount: 'lots' }],
      ['an invented tier', { ...GOOD, tier: 'platinum' }],
      ['a negative trench', { ...GOOD, trenchFeet: -1 }],
      ['a trench to the moon', { ...GOOD, trenchFeet: 1_000_000 }],
      ['more batteries than we sell', { ...GOOD, batteryUnits: BATTERY.maxUnits + 1 }],
      ['an impossible slope', { ...GOOD, slopePercent: 1_000 }],
    ];

    for (const [what, input] of bad) {
      expect(() => parseQuoteInputs(input), what).toThrow(InvalidQuoteInputs);
    }
  });

  it('normalises an azimuth rather than rejecting it', () => {
    // Rotation wraps; a 450 degree heading is just south-east and harmless.
    expect(parseQuoteInputs({ ...GOOD, azimuth: 450 }).azimuth).toBe(90);
    expect(parseQuoteInputs({ ...GOOD, azimuth: -90 }).azimuth).toBe(270);
    expect(parseQuoteInputs({ ...GOOD, azimuth: 'south' }).azimuth).toBe(180);
  });

  it('ignores a slope tier it does not recognise', () => {
    expect(parseQuoteInputs({ ...GOOD, slopeTier: 'Vertical' }).slopeTier).toBeNull();
    expect(parseQuoteInputs({ ...GOOD, slopeTier: 'Steep' }).slopeTier).toBe('Steep');
  });

  it('trims and bounds the soil description', () => {
    const long = 'x'.repeat(500);
    expect(parseQuoteInputs({ ...GOOD, soilClass: `  rock  ` }).soilClass).toBe('rock');
    expect(parseQuoteInputs({ ...GOOD, soilClass: '' }).soilClass).toBeNull();
    expect(parseQuoteInputs({ ...GOOD, soilClass: long }).soilClass!.length).toBeLessThan(200);
  });

  it('replaces a curve it cannot use instead of trusting it', () => {
    const unusable = [
      { 180: 1500 }, // incomplete
      Object.fromEntries(REFERENCE_AZIMUTHS.map((a) => [a, -5])), // negative
      Object.fromEntries(REFERENCE_AZIMUTHS.map((a) => [a, 1e9])), // absurd
      'not a curve',
      null,
    ];
    for (const curve of unusable) {
      expect(parseQuoteInputs({ ...GOOD, productionCurve: curve }).productionCurve).toEqual(
        TX_FALLBACK_CURVE
      );
    }

    // A genuine PVWatts-shaped answer is kept.
    const real = Object.fromEntries(REFERENCE_AZIMUTHS.map((a) => [a, 1600]));
    expect(parseQuoteInputs({ ...GOOD, productionCurve: real }).productionCurve).toEqual(real);
  });

  it('prices from the parsed inputs and nothing else', () => {
    const priced = priceFromInputs(parseQuoteInputs(GOOD));

    expect(priced.systemSizeKw).toBe((16 * PANELS.standard.watts) / 1000);
    expect(priced.quote.estimate).toBe(
      priced.quote.lineItems.reduce((total, item) => total + item.amount, 0)
    );
    expect(priced.quote.low).toBeLessThan(priced.quote.estimate);
    expect(priced.quote.high).toBeGreaterThan(priced.quote.estimate);
    expect(priced.equipment.low).toBeLessThan(priced.equipment.high);
    expect(priced.annualProductionKwh).toBeGreaterThan(0);
  });
});
