import { describe, it, expect } from 'vitest';
import { projectResults } from './results';
import { RESULTS } from '@/config/results';

/**
 * Twenty-five years, both ways.
 *
 * The number on the quote is only frightening on its own. These cover the
 * arithmetic that puts it next to what the utility is going to take anyway.
 */

/** An ordinary Texas customer, on the shipped assumptions. */
const ORDINARY = {
  monthlyBillUsd: 240,
  systemPriceUsd: 32390,
  offsetFraction: 1,
  inflationPct: RESULTS.utilityInflationPct,
  startYear: 2026,
};

describe('the twenty-five year comparison', () => {
  const model = projectResults(ORDINARY);

  it('runs for the whole horizon and no further', () => {
    expect(model.rows).toHaveLength(RESULTS.horizonYears);
    expect(model.rows[0].year).toBe(1);
    expect(model.rows[0].calendarYear).toBe(2026);
    expect(model.final.year).toBe(RESULTS.horizonYears);
    expect(model.final.calendarYear).toBe(2026 + RESULTS.horizonYears - 1);
  });

  it('starts year one on the bill they actually typed in', () => {
    expect(model.rows[0].withoutMonthly).toBe(240);
  });

  it('grows the utility bill by inflation, once a year', () => {
    const rate = 1 + RESULTS.utilityInflationPct / 100;
    expect(model.rows[1].withoutMonthly).toBe(Math.round(240 * rate));
    expect(model.rows[9].withoutMonthly).toBe(Math.round(240 * Math.pow(rate, 9)));
  });

  it('spreads the system evenly and adds back the grid share', () => {
    // Year one at a full offset: the array covers everything, so the only cost
    // is the system spread across the horizon.
    const monthlySystem = ORDINARY.systemPriceUsd / (RESULTS.horizonYears * 12);
    expect(model.rows[0].withMonthly).toBe(Math.round(monthlySystem));

    // By year ten the panels have aged, so a slice of the bill comes back.
    const covered = Math.pow(1 - RESULTS.degradationPctPerYear / 100, 9);
    const inflated = 240 * Math.pow(1 + RESULTS.utilityInflationPct / 100, 9);
    expect(model.rows[9].withMonthly).toBe(
      Math.round(monthlySystem + (1 - covered) * inflated)
    );
  });

  it('accumulates twelve months of each year, on both paths', () => {
    // Within a dollar a month of the rounded figures on screen: the running
    // total is kept unrounded and rounded once, so summing the displayed
    // monthlies can differ by the rounding on each of them.
    const closeTo = (actual: number, expected: number, months: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(months);

    closeTo(model.rows[0].cumulativeWithout, model.rows[0].withoutMonthly * 12, 12);
    closeTo(
      model.rows[1].cumulativeWithout,
      (model.rows[0].withoutMonthly + model.rows[1].withoutMonthly) * 12,
      24
    );
    closeTo(model.rows[0].cumulativeWith, model.rows[0].withMonthly * 12, 12);

    // And it only ever goes up.
    for (let i = 1; i < model.rows.length; i++) {
      expect(model.rows[i].cumulativeWithout).toBeGreaterThanOrEqual(
        model.rows[i - 1].cumulativeWithout
      );
      expect(model.rows[i].cumulativeWith).toBeGreaterThan(model.rows[i - 1].cumulativeWith);
    }
  });

  it('breaks even the first year owning has cost less in total', () => {
    expect(model.breakEvenYear).not.toBeNull();
    const row = model.rows[model.breakEvenYear! - 1];
    expect(row.cumulativeWith).toBeLessThanOrEqual(row.cumulativeWithout);

    // And not before: the year before it must still be behind.
    if (model.breakEvenYear! > 1) {
      const previous = model.rows[model.breakEvenYear! - 2];
      expect(previous.cumulativeWith).toBeGreaterThan(previous.cumulativeWithout);
    }
  });

  it('matches its snapshot', () => {
    // Locks the model and the arithmetic together. Changing an assumption
    // should move these; a refactor should not.
    expect({
      breakEvenYear: model.breakEvenYear,
      totalWithout: model.totalWithout,
      totalWith: model.totalWith,
      systemPriceUsd: model.systemPriceUsd,
      finalYear: model.final.calendarYear,
      finalWithoutMonthly: model.final.withoutMonthly,
      finalWithMonthly: model.final.withMonthly,
    }).toMatchInlineSnapshot(`
      {
        "breakEvenYear": 1,
        "finalWithMonthly": 158,
        "finalWithoutMonthly": 548,
        "finalYear": 2050,
        "systemPriceUsd": 32390,
        "totalWith": 38369,
        "totalWithout": 112176,
      }
    `);

    /*
      Break-even in year one, and that is the model working as specified.

      There is no financing here: the system is spread evenly across the
      horizon, so the comparison is monthly outlay against monthly outlay
      rather than cash out of pocket against savings. The system above over
      three hundred months comes to less than half what this customer is
      already handing the utility every month, so they are ahead immediately.

      A classic payback figure — years until the savings have repaid the
      cheque — is a different number and would need the price treated as an
      upfront outlay.
    */
  });
});

describe('when it does not pay for itself', () => {
  it('reports no break-even rather than inventing one', () => {
    // A small bill and a large array: the utility never catches up inside the
    // horizon, and the screen has to say so plainly.
    const model = projectResults({
      ...ORDINARY,
      monthlyBillUsd: 40,
      systemPriceUsd: 60000,
    });

    expect(model.breakEvenYear).toBeNull();
    expect(model.totalWith).toBeGreaterThan(model.totalWithout);
  });

  it('never reports a break-even the cumulative figures do not support', () => {
    for (const bill of [0, 25, 80, 240, 600]) {
      const model = projectResults({ ...ORDINARY, monthlyBillUsd: bill });
      if (model.breakEvenYear === null) {
        expect(
          model.rows.every((r) => r.cumulativeWith > r.cumulativeWithout),
          `bill ${bill} claimed no break-even but crossed anyway`
        ).toBe(true);
      } else {
        const row = model.rows[model.breakEvenYear - 1];
        expect(row.cumulativeWith, `bill ${bill}`).toBeLessThanOrEqual(row.cumulativeWithout);
      }
    }
  });
});

describe('the inflation the customer chooses', () => {
  it('brings break-even forward as the rate rises', () => {
    const at = (inflationPct: number) =>
      projectResults({ ...ORDINARY, inflationPct }).breakEvenYear ?? Infinity;

    expect(at(RESULTS.inflationMaxPct)).toBeLessThanOrEqual(at(RESULTS.utilityInflationPct));
    expect(at(RESULTS.utilityInflationPct)).toBeLessThanOrEqual(at(RESULTS.inflationMinPct));
  });

  it('holds the bill flat at zero, which is the honest floor', () => {
    const model = projectResults({ ...ORDINARY, inflationPct: 0 });
    expect(model.rows[0].withoutMonthly).toBe(240);
    expect(model.final.withoutMonthly).toBe(240);
    expect(model.totalWithout).toBe(240 * 12 * RESULTS.horizonYears);
  });

  it('echoes back the figure it was given, so the screen prints the truth', () => {
    expect(projectResults({ ...ORDINARY, inflationPct: 6 }).inflationPct).toBe(6);
  });
});

describe('degradation', () => {
  it('gives back a slice of the bill as the panels age', () => {
    const model = projectResults({ ...ORDINARY, inflationPct: 0 });
    // With inflation held at zero, the only thing that can move the grid
    // portion is the panels making less.
    expect(model.final.withMonthly).toBeGreaterThan(model.rows[0].withMonthly);
  });

  it('leaves the bill alone when there is no degradation', () => {
    const model = projectResults({
      ...ORDINARY,
      inflationPct: 0,
      assumptions: { ...RESULTS, degradationPctPerYear: 0 },
    });
    expect(model.final.withMonthly).toBe(model.rows[0].withMonthly);
  });
});

describe('edge cases', () => {
  it('handles a customer with no bill without dividing by zero', () => {
    const model = projectResults({ ...ORDINARY, monthlyBillUsd: 0 });
    expect(model.totalWithout).toBe(0);
    expect(model.breakEvenYear).toBeNull();
    expect(Number.isFinite(model.totalWith)).toBe(true);
  });

  it('treats a free system as paying for itself at once', () => {
    const model = projectResults({ ...ORDINARY, systemPriceUsd: 0 });
    expect(model.breakEvenYear).toBe(1);
  });

  it('clamps an offset outside nought to one', () => {
    const over = projectResults({ ...ORDINARY, offsetFraction: 3 });
    const full = projectResults({ ...ORDINARY, offsetFraction: 1 });
    expect(over.totalWith).toBe(full.totalWith);

    const under = projectResults({ ...ORDINARY, offsetFraction: -1 });
    const none = projectResults({ ...ORDINARY, offsetFraction: 0 });
    expect(under.totalWith).toBe(none.totalWith);
  });

  it('pays the whole bill when the array covers nothing', () => {
    const model = projectResults({ ...ORDINARY, offsetFraction: 0 });
    const monthlySystem = ORDINARY.systemPriceUsd / (RESULTS.horizonYears * 12);
    expect(model.rows[0].withMonthly).toBe(Math.round(monthlySystem + 240));
  });
});
