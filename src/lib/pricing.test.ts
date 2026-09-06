import { describe, it, expect } from 'vitest';
import {
  priceQuote,
  conduitFor,
  slopeAdderFor,
  rockyAdderFor,
  looksRocky,
  clearingAcres,
  clearingPrice,
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

/**
 * The worked example from the brief, on ground that costs something.
 *
 * The customer said the ground is rocky. From Phase 9 that is what prices the
 * soil adder — the SSURGO description only pre-selects the button — so the
 * example is stated as an answer rather than as a survey result.
 */
const EXAMPLE = {
  design: { panelCount: 16, tier: 'standard' as const, trenchFeet: 113 },
  options: { batteryUnits: 0, needsClearing: false },
  site: { slopeAnswer: 'flat' as const, rocky: true },
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
    expect(quote.slopeAnswer).toBe('flat');
    expect(quote.slopeAdderPct).toBe(0);
    expect(quote.lineItems.some((i) => i.key === 'slope')).toBe(false);
  });

  it('adds the rocky rate to the groundwork only', () => {
    const groundwork = quote.lineItems[0].amount + quote.lineItems[1].amount;
    expect(quote.rocky).toBe(true);
    expect(quote.rockyAdderPct).toBe(SITE.rockyAdderPct);
    expect(quote.lineItems[2].amount).toBe(Math.round(groundwork * quote.rockyAdderPct));
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
          "amount": 2945,
          "detail": "rocky ground",
          "key": "soil",
          "label": "Ground conditions",
        },
      ]
    `);
    // 16 x 435W at $3.50/W = $24,360, plus 113 ft at $45 x1.00 = $5,085,
    // plus 10% for rocky ground on the $29,445 of groundwork = $2,945.
    // Spread +/-8%.
    expect({ low: quote.low, estimate: quote.estimate, high: quote.high }).toEqual({
      low: 29799,
      estimate: 32390,
      high: 34981,
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
  it('adds what the customer answered, and nothing for flat', () => {
    expect(slopeAdderFor('flat')).toBe(0);
    expect(slopeAdderFor('slight')).toBe(SITE.slopeAnswers.slight);
    expect(slopeAdderFor('big')).toBe(SITE.slopeAnswers.big);
    expect(slopeAdderFor('big')).toBeGreaterThan(slopeAdderFor('slight'));
  });

  it('charges for rocky ground only when they say it is rocky', () => {
    expect(rockyAdderFor(false)).toBe(0);
    expect(rockyAdderFor(true)).toBe(SITE.rockyAdderPct);
  });

  it('reads a soil survey as a hint about which button to pre-select', () => {
    // SSURGO returns free text, matched by substring. This decides nothing
    // about the price — only which answer starts pressed.
    expect(looksRocky('Tarrant rock outcrop complex')).toBe(true);
    expect(looksRocky('Rocky, very gravelly')).toBe(true);
    expect(looksRocky('Eckrant limestone')).toBe(true);
  });

  it('leaves ordinary ground unpressed', () => {
    for (const soil of ['Windthorst clay loam', 'Sandy loam', 'Silty clay', 'Fine sand']) {
      expect(looksRocky(soil), soil).toBe(false);
    }
    expect(looksRocky(null)).toBe(false);
    expect(looksRocky('something we have never heard of')).toBe(false);
  });

  it('prices the survey out of it entirely', () => {
    // The same design on the same ground, quoted twice: once by somebody who
    // says it is flat and not rocky, once by somebody who says otherwise. The
    // survey is not an argument in either call.
    const said = (slopeAnswer: 'flat' | 'slight' | 'big', rocky: boolean) =>
      priceQuote(EXAMPLE.design, EXAMPLE.options, { slopeAnswer, rocky }).estimate;

    expect(said('flat', false)).toBeLessThan(said('slight', false));
    expect(said('slight', false)).toBeLessThan(said('big', false));
    expect(said('flat', false)).toBeLessThan(said('flat', true));
  });

  it('scales clearing with the array footprint', () => {
    expect(clearingAcres(40, 'standard')).toBeGreaterThan(clearingAcres(16, 'standard'));
    expect(clearingAcres(0, 'standard')).toBe(0);
  });

  it('charges the flat rate for anything up to a quarter acre', () => {
    // Most arrays. The flat charge covers turning up.
    const quote = priceQuote(
      { panelCount: 4, tier: 'standard', trenchFeet: 20 },
      { batteryUnits: 0, needsClearing: true },
      { slopeAnswer: 'flat', rocky: false },
      ALL_ON
    );
    const clearing = quote.lineItems.find((i) => i.key === 'clearing')!;
    expect(clearingAcres(4, 'standard')).toBeLessThan(SITE.vegetationClearing.baseAcres);
    expect(clearing.amount).toBe(SITE.vegetationClearing.baseCharge);
  });

  it('charges by the acre only beyond the flat rate', () => {
    const { baseCharge, baseAcres, perAcre } = SITE.vegetationClearing;
    expect(clearingPrice(baseAcres)).toBe(baseCharge);
    expect(clearingPrice(baseAcres + 1)).toBe(baseCharge + perAcre);
    expect(clearingPrice(0)).toBe(baseCharge);

    // A big array — 200 panels is about a third of an acre once the working
    // margin is included. The excess is what costs.
    const acres = clearingAcres(200, 'standard');
    expect(acres).toBeGreaterThan(baseAcres);
    expect(clearingPrice(acres)).toBe(baseCharge + (acres - baseAcres) * perAcre);
  });
});

describe('options change the price', () => {
  const base = priceQuote(EXAMPLE.design, EXAMPLE.options, EXAMPLE.site);

  it('prices the second battery cheaper than the first', () => {
    // The first carries the inverter and the install; the second is mostly the
    // battery. Charging twice the first price would over-quote anybody
    // wanting two.
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

    expect(amount(one)).toBe(BATTERY.firstUnit);
    expect(amount(two)).toBe(BATTERY.firstUnit + BATTERY.additionalUnit);
    expect(amount(two)).toBeLessThan(amount(one) * 2);
  });

  it('a battery adds its own line and raises the trench rate', () => {
    const withBattery = priceQuote(
      EXAMPLE.design,
      { batteryUnits: 1, needsClearing: false },
      EXAMPLE.site,
      ALL_ON
    );
    const line = withBattery.lineItems.find((i) => i.key === 'battery')!;
    expect(line.amount).toBe(BATTERY.firstUnit);
    // A battery adds a second run alongside, whatever the system size.
    expect(conduitFor(withBattery.systemKw, true).multiplier).toBe(
      conduitFor(withBattery.systemKw, false).multiplier + TRENCH.batteryMultiplierAdder
    );
    expect(subtotals(withBattery).trench).toBeGreaterThan(subtotals(base).trench);
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

  it('a big slope costs more than a flat one', () => {
    const steep = priceQuote(EXAMPLE.design, EXAMPLE.options, {
      ...EXAMPLE.site,
      slopeAnswer: 'big',
    });
    expect(steep.estimate).toBeGreaterThan(base.estimate);
    expect(steep.slopeAnswer).toBe('big');
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
      { slopeAnswer: 'flat', rocky: false }
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
      { slopeAnswer: 'flat', rocky: false }
    );
    expect(subtotals(quote).trench).toBe(0);
    expect(quote.estimate).toBeGreaterThan(0);
  });

  it('spreads a single figure the same way as the total', () => {
    expect(spread(1000)).toEqual({ low: 920, high: 1080 });
  });
});

describe('the ground is what the customer says it is', () => {
  const design = { panelCount: 40, tier: 'standard' as const, trenchFeet: 100 };
  const options = { batteryUnits: 0, needsClearing: false };

  it('takes three answers and prices each of them', () => {
    const at = (slopeAnswer: 'flat' | 'slight' | 'big') =>
      priceQuote(design, options, { slopeAnswer, rocky: false });

    expect(at('flat').estimate).toBeLessThan(at('slight').estimate);
    expect(at('slight').estimate).toBeLessThan(at('big').estimate);
    expect(at('flat').lineItems.some((i) => i.key === 'slope')).toBe(false);
    expect(at('big').lineItems.find((i) => i.key === 'slope')?.detail).toBe('big slope');
  });

  it('applies the adders to the groundwork, not to the whole quote', () => {
    const plain = priceQuote(design, options, { slopeAnswer: 'flat', rocky: false });
    const groundwork = subtotals(plain).equipment + subtotals(plain).trench;

    const big = priceQuote(design, options, { slopeAnswer: 'big', rocky: false });
    expect(big.lineItems.find((i) => i.key === 'slope')!.amount).toBe(
      Math.round(groundwork * SITE.slopeAnswers.big)
    );

    const rocky = priceQuote(design, options, { slopeAnswer: 'flat', rocky: true });
    expect(rocky.lineItems.find((i) => i.key === 'soil')!.amount).toBe(
      Math.round(groundwork * SITE.rockyAdderPct)
    );
  });

  it('stacks slope and rock', () => {
    const both = priceQuote(design, options, { slopeAnswer: 'big', rocky: true });
    expect(both.lineItems.filter((i) => i.key === 'slope' || i.key === 'soil')).toHaveLength(2);
    expect(both.slopeAdderPct).toBe(SITE.slopeAnswers.big);
    expect(both.rockyAdderPct).toBe(SITE.rockyAdderPct);
  });

  it('records the answers it priced from', () => {
    // The record has to say what the number was built on, or a disagreement
    // between the quote and the site visit has nothing to be settled against.
    const q = priceQuote(design, options, { slopeAnswer: 'slight', rocky: true });
    expect(q.slopeAnswer).toBe('slight');
    expect(q.rocky).toBe(true);
  });
});
