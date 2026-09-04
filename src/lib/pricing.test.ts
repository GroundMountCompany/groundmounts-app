import { describe, it, expect } from 'vitest';
import {
  priceQuote,
  conduitFor,
  slopeTierFor,
  soilAdderFor,
  clearingAcres,
  spread,
  subtotals,
} from './pricing';
import { PANELS, TRENCH, BATTERY, SITE, RANGE_SPREAD_PCT } from '@/config/pricing';

/**
 * These cases price options the owner ships switched off.
 *
 * The gating is asserted in optionGating.test.ts; here the question is whether
 * the arithmetic is right when an option *is* on offer, so availability is
 * passed in explicitly rather than read from the shipped config.
 */
const ALL_ON = { premiumPanels: true, battery: true, sitePrep: true };

/** The worked example from the brief. */
const EXAMPLE = {
  design: { panelCount: 16, tier: 'standard' as const, trenchFeet: 113 },
  options: { batteryUnits: 0, needsClearing: false },
  site: { slopePercent: 3, soilClass: 'clay loam' },
};

describe('the worked example', () => {
  const quote = priceQuote(EXAMPLE.design, EXAMPLE.options, EXAMPLE.site);

  it('produces the expected line items in order', () => {
    expect(quote.lineItems.map((i) => i.key)).toEqual(['equipment', 'trench', 'soil']);
  });

  it('prices the panels per watt from config', () => {
    const equipment = quote.lineItems[0];
    expect(equipment.amount).toBe(16 * PANELS.standard.watts * PANELS.standard.pricePerWatt);
    expect(equipment.detail).toContain(PANELS.standard.name);
  });

  it('prices the trench at the base rate for a small system with no battery', () => {
    // 6.96 kW, no battery, so the first schedule row: one 1.5" conduit, x1.
    const row = conduitFor(quote.systemKw, false);
    expect(row.multiplier).toBe(1);
    expect(quote.lineItems[1].amount).toBe(113 * TRENCH.basePerFt);
  });

  it('adds nothing for flat ground', () => {
    expect(quote.slopeTier).toBe('Flat');
    expect(quote.slopeAdderPct).toBe(0);
    expect(quote.lineItems.some((i) => i.key === 'slope')).toBe(false);
  });

  it('adds the clay loam rate to the groundwork only', () => {
    const groundwork = quote.lineItems[0].amount + quote.lineItems[1].amount;
    expect(quote.soilAdderPct).toBe(SITE.soilAdders['clay loam']);
    expect(quote.lineItems[2].amount).toBe(Math.round(groundwork * quote.soilAdderPct));
  });

  it('is a range around the total, not a single number', () => {
    const total = quote.lineItems.reduce((s, i) => s + i.amount, 0);
    expect(quote.estimate).toBe(total);
    expect(quote.low).toBe(Math.round(total * (1 - RANGE_SPREAD_PCT)));
    expect(quote.high).toBe(Math.round(total * (1 + RANGE_SPREAD_PCT)));
    expect(quote.low).toBeLessThan(quote.high);
  });

  it('matches its line-item snapshot', () => {
    // Locks the shape and the arithmetic together. A config change should move
    // these numbers; a refactor should not.
    expect(
      quote.lineItems.map(({ key, label, detail, amount }) => ({ key, label, detail, amount }))
    ).toMatchInlineSnapshot(`
      [
        {
          "amount": 24360,
          "detail": "16 x 435W Mission Solar MSX10-435HN0B",
          "key": "equipment",
          "label": "Panels and installation",
        },
        {
          "amount": 5085,
          "detail": "113 ft, 1 x 1.5" conduit",
          "key": "trench",
          "label": "Trenching",
        },
        {
          "amount": 589,
          "detail": "clay loam",
          "key": "soil",
          "label": "Ground conditions",
        },
      ]
    `);
    expect({ low: quote.low, estimate: quote.estimate, high: quote.high }).toEqual({
      low: 27631,
      estimate: 30034,
      high: 32437,
    });
  });
});

describe('conduit schedule', () => {
  it('steps up with system size', () => {
    expect(conduitFor(8, false).multiplier).toBe(1);
    expect(conduitFor(15, false).multiplier).toBeGreaterThan(conduitFor(8, false).multiplier);
    expect(conduitFor(40, false).multiplier).toBeGreaterThan(conduitFor(15, false).multiplier);
  });

  it('costs more with a battery at the same size', () => {
    expect(conduitFor(8, true).multiplier).toBeGreaterThan(conduitFor(8, false).multiplier);
  });

  it('always finds a row, however large the system', () => {
    expect(conduitFor(1000, false)).toBeDefined();
    expect(conduitFor(1000, true)).toBeDefined();
  });
});

describe('site conditions', () => {
  it('maps grades to tiers', () => {
    expect(slopeTierFor(0).name).toBe('Flat');
    expect(slopeTierFor(4.9).name).toBe('Flat');
    expect(slopeTierFor(5).name).toBe('Rolling');
    expect(slopeTierFor(20).name).toBe('Steep');
  });

  it('adds nothing when the slope is unknown, rather than guessing', () => {
    expect(slopeTierFor(null)).toEqual({ name: 'Unknown', adderPct: 0 });
  });

  it('matches soil descriptions by substring, longest first', () => {
    // SSURGO returns free text, so "clay loam" must beat the shorter "clay".
    expect(soilAdderFor('Windthorst clay loam, 1 to 3 percent slopes')).toBe(
      SITE.soilAdders['clay loam']
    );
    expect(soilAdderFor('Rocky outcrop')).toBe(SITE.soilAdders.rock);
    expect(soilAdderFor('Caliche')).toBe(SITE.soilAdders.caliche);
  });

  it('falls back for unknown or missing soil', () => {
    expect(soilAdderFor(null)).toBe(SITE.defaultSoilAdderPct);
    expect(soilAdderFor('something we have never heard of')).toBe(SITE.defaultSoilAdderPct);
  });

  it('scales clearing with the array footprint', () => {
    expect(clearingAcres(40, 'standard')).toBeGreaterThan(clearingAcres(16, 'standard'));
    expect(clearingAcres(0, 'standard')).toBe(0);
  });

  it('never charges less than the clearing minimum', () => {
    const quote = priceQuote(
      { panelCount: 4, tier: 'standard', trenchFeet: 20 },
      { batteryUnits: 0, needsClearing: true },
      { slopePercent: 0, soilClass: 'loam' }
    );
    const clearing = quote.lineItems.find((i) => i.key === 'clearing')!;
    expect(clearing.amount).toBe(SITE.vegetationClearing.minimum);
  });
});

describe('options change the price', () => {
  const base = priceQuote(EXAMPLE.design, EXAMPLE.options, EXAMPLE.site);

  it('a battery adds its own line and raises the trench rate', () => {
    const withBattery = priceQuote(
      EXAMPLE.design,
      { batteryUnits: 1, needsClearing: false },
      EXAMPLE.site,
      ALL_ON
    );
    const line = withBattery.lineItems.find((i) => i.key === 'battery')!;
    expect(line.amount).toBe(BATTERY.pricePerUnit);
    expect(subtotals(withBattery).trench).toBeGreaterThan(subtotals(base).trench);
  });

  it('two batteries cost twice one', () => {
    const one = priceQuote(
      EXAMPLE.design,
      { batteryUnits: 1, needsClearing: false },
      EXAMPLE.site,
      ALL_ON
    );
    const two = priceQuote(
      EXAMPLE.design,
      { batteryUnits: 2, needsClearing: false },
      EXAMPLE.site,
      ALL_ON
    );
    const amount = (q: typeof one) => q.lineItems.find((i) => i.key === 'battery')!.amount;
    expect(amount(two)).toBe(amount(one) * 2);
  });

  it('premium panels cost more for the same count', () => {
    const premium = priceQuote(
      { ...EXAMPLE.design, tier: 'premium' },
      EXAMPLE.options,
      EXAMPLE.site,
      ALL_ON
    );
    expect(subtotals(premium).equipment).toBeGreaterThan(subtotals(base).equipment);
  });

  it('steep ground costs more than flat', () => {
    const steep = priceQuote(EXAMPLE.design, EXAMPLE.options, {
      ...EXAMPLE.site,
      slopePercent: 20,
    });
    expect(steep.estimate).toBeGreaterThan(base.estimate);
    expect(steep.slopeTier).toBe('Steep');
  });

  it('clearing adds a line', () => {
    const cleared = priceQuote(
      EXAMPLE.design,
      { batteryUnits: 0, needsClearing: true },
      EXAMPLE.site
    );
    expect(cleared.estimate).toBeGreaterThan(base.estimate);
  });
});

describe('edge cases', () => {
  it('prices an empty design as nothing, without dividing by zero', () => {
    const quote = priceQuote(
      { panelCount: 0, tier: 'standard', trenchFeet: 0 },
      { batteryUnits: 0, needsClearing: false },
      { slopePercent: null, soilClass: null }
    );
    expect(quote.estimate).toBe(0);
    expect(quote.low).toBe(0);
    expect(quote.high).toBe(0);
    expect(Number.isNaN(quote.systemKw)).toBe(false);
  });

  it('handles a zero-foot trench', () => {
    const quote = priceQuote(
      { panelCount: 16, tier: 'standard', trenchFeet: 0 },
      { batteryUnits: 0, needsClearing: false },
      { slopePercent: 0, soilClass: 'loam' }
    );
    expect(subtotals(quote).trench).toBe(0);
    expect(quote.estimate).toBeGreaterThan(0);
  });

  it('spreads a single figure the same way as the total', () => {
    expect(spread(1000)).toEqual({ low: 920, high: 1080 });
  });
});

describe('a slope the customer told us about', () => {
  const design = { panelCount: 40, tier: 'standard' as const, trenchFeet: 100 };
  const options = { batteryUnits: 0, needsClearing: false };

  it('prices a chosen tier exactly like a measured one', () => {
    const measured = priceQuote(design, options, { slopePercent: 8, soilClass: null });
    const chosen = priceQuote(design, options, {
      slopePercent: null,
      slopeTier: 'Rolling',
      soilClass: null,
    });

    expect(measured.slopeTier).toBe('Rolling');
    expect(chosen.slopeTier).toBe('Rolling');
    expect(chosen.estimate).toBe(measured.estimate);
  });

  it('costs more on steep ground than on flat, which is the point of asking', () => {
    const flat = priceQuote(design, options, {
      slopePercent: null,
      slopeTier: 'Flat',
      soilClass: null,
    });
    const steep = priceQuote(design, options, {
      slopePercent: null,
      slopeTier: 'Steep',
      soilClass: null,
    });
    const unanswered = priceQuote(design, options, { slopePercent: null, soilClass: null });

    expect(steep.estimate).toBeGreaterThan(flat.estimate);
    // No answer prices as no adder, so an unanswered steep site under-quotes —
    // which is exactly why the picker exists.
    expect(unanswered.slopeTier).toBe('Unknown');
    expect(unanswered.estimate).toBe(flat.estimate);
  });

  it('ignores a measured grade being present, since there is none to ignore', () => {
    // A measurement always wins: the picker only appears when there is none.
    const q = priceQuote(design, options, {
      slopePercent: 2,
      slopeTier: 'Steep',
      soilClass: null,
    });
    expect(q.slopeTier).toBe('Flat');
  });
});
