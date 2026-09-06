import { describe, it, expect } from 'vitest';
import { parseQuoteInputs, priceFromInputs, InvalidQuoteInputs } from './quoteInputs';
import { TX_FALLBACK_CURVE, annualKwh } from './production';
import { BATTERY, PANELS } from '@/config/pricing';

const GOOD = {
  panelCount: 16,
  tier: 'standard',
  trenchFeet: 113,
  batteryUnits: 0,
  needsClearing: false,
  slopeAnswer: 'flat',
  rocky: false,
  batteryInterest: false,
  slopePercent: 3,
  slopeTier: 'Flat',
  soilClass: 'clay loam',
  azimuth: 180,
  arrayCenter: [-97.3208, 32.7555],
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
      ['an invented slope answer', { ...GOOD, slopeAnswer: 'vertical' }],
      ['a slope answer that is not a string', { ...GOOD, slopeAnswer: 3 }],
    ];

    for (const [what, input] of bad) {
      expect(() => parseQuoteInputs(input), what).toThrow(InvalidQuoteInputs);
    }
  });

  it('defaults a missing slope answer rather than refusing the lead', () => {
    // A browser running a cached bundle from before this shipped should still
    // get a quote, on the answer that adds nothing — not a 400 it cannot
    // explain. An answer we do not recognise is a different matter and is
    // refused above.
    const { slopeAnswer, ...withoutAnswer } = GOOD;
    void slopeAnswer;
    expect(parseQuoteInputs(withoutAnswer).slopeAnswer).toBe('flat');
    expect(parseQuoteInputs({ ...GOOD, slopeAnswer: null }).slopeAnswer).toBe('flat');
  });

  it('treats the two booleans as booleans, not as anything truthy', () => {
    expect(parseQuoteInputs({ ...GOOD, rocky: 'yes' }).rocky).toBe(false);
    expect(parseQuoteInputs({ ...GOOD, rocky: true }).rocky).toBe(true);
    expect(parseQuoteInputs({ ...GOOD, batteryInterest: 1 }).batteryInterest).toBe(false);
    expect(parseQuoteInputs({ ...GOOD, batteryInterest: true }).batteryInterest).toBe(true);
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

  it('ignores a curve in the payload entirely', () => {
    // The reported attack: five samples of 9,999 kWh/kW/yr. There is nowhere
    // for it to land any more — the server looks the curve up itself.
    const parsed = parseQuoteInputs({
      ...GOOD,
      productionCurve: { 90: 9999, 135: 9999, 180: 9999, 225: 9999, 270: 9999 },
    });
    expect(parsed).not.toHaveProperty('productionCurve');
    expect(JSON.stringify(parsed)).not.toContain('9999');

    // And with no curve to hand, pricing falls back to the reference rather
    // than to anything the caller said.
    const priced = priceFromInputs(parsed);
    expect(priced.annualProductionKwh).toBe(
      annualKwh(TX_FALLBACK_CURVE, priced.quote.systemKw, 180)
    );
  });

  it('keeps the array coordinates the curve will be looked up from', () => {
    expect(parseQuoteInputs(GOOD).arrayCenter).toEqual([-97.3208, 32.7555]);

    // Anything that is not a coordinate pair is simply absent, not an error:
    // the design still has a price, it just gets the reference curve.
    for (const bad of [undefined, null, 'somewhere', [1], [0, 200], ['a', 'b'], [200, 0]]) {
      expect(parseQuoteInputs({ ...GOOD, arrayCenter: bad }).arrayCenter, String(bad)).toBeNull();
    }
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
    // The curve is a parameter, so a different one gives a different figure.
    const sunnier = Object.fromEntries(
      Object.entries(TX_FALLBACK_CURVE).map(([az, v]) => [az, v * 2])
    );
    expect(priceFromInputs(parseQuoteInputs(GOOD), sunnier).annualProductionKwh).toBeGreaterThan(
      priced.annualProductionKwh
    );
  });
});
