import { describe, it, expect } from 'vitest';
import { availableOnly, currentAvailability, priceQuote } from './pricing';
import { buildableInputs, parseQuoteInputs } from './quoteInputs';
import { PANELS, BATTERY, SITE } from '@/config/pricing';

/**
 * What the owner has actually switched on.
 *
 * Three options ship with placeholder numbers, and a placeholder is not a
 * quote. Rather than showing a customer a battery price nobody stands behind,
 * a disabled option is absent from the screen, absent from the price, and
 * absent from the record — including when a payload asks for it directly.
 */

const DESIGN = { panelCount: 16, tier: 'standard' as const, trenchFeet: 113 };
const SITE_CONDITIONS = { slopePercent: 3, soilClass: 'clay loam' };

describe('what ships enabled', () => {
  it('is standard panels and site prep, and nothing else', () => {
    // Change these and the tests below change with them; this is the record of
    // what the owner has confirmed as of this commit.
    expect(PANELS.standard.enabled).toBe(true);
    expect(PANELS.premium.enabled).toBe(false);
    expect(BATTERY.enabled).toBe(false);
    expect(SITE.vegetationClearing.enabled).toBe(true);
  });
});

describe('a design asking for something that is not on offer', () => {
  it('is priced as though it had not asked', () => {
    const asked = priceQuote(
      { ...DESIGN, tier: 'premium' },
      { batteryUnits: 2, needsClearing: false },
      SITE_CONDITIONS
    );
    const plain = priceQuote(DESIGN, { batteryUnits: 0, needsClearing: false }, SITE_CONDITIONS);

    expect(asked.estimate).toBe(plain.estimate);
    expect(asked.lineItems.map((i) => i.key)).not.toContain('battery');
    // Priced on the standard panel, whatever the tier said.
    expect(asked.lineItems[0].detail).toContain(PANELS.standard.name);
  });

  it('keeps the option that is enabled', () => {
    const withClearing = priceQuote(
      DESIGN,
      { batteryUnits: 0, needsClearing: true },
      SITE_CONDITIONS
    );
    expect(withClearing.lineItems.map((i) => i.key)).toContain('clearing');
  });

  it('normalises the design itself, not just the price', () => {
    const { design, options } = availableOnly(
      { ...DESIGN, tier: 'premium' },
      { batteryUnits: 2, needsClearing: true }
    );
    expect(design.tier).toBe('standard');
    expect(options.batteryUnits).toBe(0);
    expect(options.needsClearing).toBe(true);
  });

  it('reaches the lead as what will be built', () => {
    // Otherwise the owner rings a customer about a battery nobody sold them.
    const inputs = buildableInputs(
      parseQuoteInputs({
        panelCount: 16,
        tier: 'premium',
        trenchFeet: 113,
        batteryUnits: 2,
        needsClearing: true,
        azimuth: 180,
        arrayCenter: [-97.32, 32.75],
      })
    );

    expect(inputs.tier).toBe('standard');
    expect(inputs.batteryUnits).toBe(0);
    expect(inputs.needsClearing).toBe(true);
  });
});

describe('when the owner switches an option on', () => {
  const ALL_ON = { premiumPanels: true, battery: true, sitePrep: true };

  it('keeps what the customer asked for', () => {
    const { design, options } = availableOnly(
      { ...DESIGN, tier: 'premium' },
      { batteryUnits: 2, needsClearing: true },
      ALL_ON
    );

    expect(design.tier).toBe('premium');
    expect(options.batteryUnits).toBe(2);
    expect(options.needsClearing).toBe(true);
  });

  it('turns them off one at a time, not all or nothing', () => {
    const onlyBattery = { premiumPanels: false, battery: true, sitePrep: false };
    const { design, options } = availableOnly(
      { ...DESIGN, tier: 'premium' },
      { batteryUnits: 1, needsClearing: true },
      onlyBattery
    );

    expect(design.tier).toBe('standard');
    expect(options.batteryUnits).toBe(1);
    expect(options.needsClearing).toBe(false);
  });

  it('prices the battery line once it is on offer', () => {
    // The same priceQuote the screen and the record use, told the option is
    // available — which is exactly what changes the day the price is confirmed.
    const priced = priceQuote(
      DESIGN,
      { batteryUnits: 2, needsClearing: false },
      SITE_CONDITIONS,
      ALL_ON
    );
    const line = priced.lineItems.find((i) => i.key === 'battery');

    expect(line, 'no battery line with the option enabled').toBeTruthy();
    expect(line!.amount).toBe(2 * BATTERY.pricePerUnit);
  });

  it('reports what is currently on offer', () => {
    expect(currentAvailability()).toEqual({
      premiumPanels: PANELS.premium.enabled,
      battery: BATTERY.enabled,
      sitePrep: SITE.vegetationClearing.enabled,
    });
  });
});
