import { describe, it, expect } from 'vitest';
import { projectResults } from './results';
import { INFLATION_MARKS, RESULTS } from '@/config/results';

/**
 * The rate the worked example was checked by hand at.
 *
 * Pinned rather than read from the config: the arithmetic below was verified
 * against this figure, and moving the shipped default should not silently
 * re-point a check somebody did on paper.
 */
const HAND_CHECKED_INFLATION_PCT = 3.5;

/**
 * Twenty-five years, both ways.
 *
 * The number on the quote is only frightening on its own. These cover the
 * arithmetic that puts it next to what the utility is going to take anyway —
 * and, above all, that the cheque is written on day one rather than smeared
 * across the horizon.
 */

/** An ordinary Texas customer, on the shipped assumptions. */
const ORDINARY = {
  monthlyBillUsd: 240,
  systemPriceUsd: 32390,
  offsetFraction: 1,
  inflationPct: HAND_CHECKED_INFLATION_PCT,
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
    const rate = 1 + HAND_CHECKED_INFLATION_PCT / 100;
    expect(model.rows[1].withoutMonthly).toBe(Math.round(240 * rate));
    expect(model.rows[9].withoutMonthly).toBe(Math.round(240 * Math.pow(rate, 9)));
  });

  it('charges the whole system on day one', () => {
    // Not spread across the horizon. Money spent today is not money spent in
    // 2049, and a comparison that smears it puts payback in year one for
    // almost everybody.
    const firstYearResidual = model.rows[0].residualMonthly * 12;
    expect(model.rows[0].cumulativeWith).toBe(ORDINARY.systemPriceUsd + firstYearResidual);
    expect(model.rows[0].cumulativeWith).toBeGreaterThanOrEqual(ORDINARY.systemPriceUsd);
  });

  it('charges nothing but the residual after that', () => {
    // Year one covers everything, so at a full offset there is no residual at
    // all and later years add only what the ageing panels give back.
    expect(model.rows[0].residualMonthly).toBe(0);

    const covered = Math.pow(1 - RESULTS.degradationPctPerYear / 100, 9);
    const inflated = 240 * Math.pow(1 + HAND_CHECKED_INFLATION_PCT / 100, 9);
    expect(model.rows[9].residualMonthly).toBe(Math.round((1 - covered) * inflated));
  });

  it('is paid back in year 10, which is where the hand calculation puts it', () => {
    // The worked example, checked against the owner's arithmetic.
    //
    // By the end of year 9 the utility has taken $29,861 and the residual
    // bills have come to $500, so the array is $29,361 ahead of where it
    // started — still short of its $32,390 price. By the end of year 10 that
    // figure is $33,147, which has passed it. So: year 10.
    //
    // (Line comments rather than a block: the money-location guard strips
    // those, and a block comment full of dollar figures reads to it as prices
    // escaping pricing.ts.)
    expect(model.paybackYear).toBe(10);
    expect(model.paybackCalendarYear).toBe(2035);

    const netAfter = (year: number) => {
      const row = model.rows[year - 1];
      return row.cumulativeWithout - (row.cumulativeWith - model.systemPriceUsd);
    };
    expect(netAfter(9)).toBe(29361);
    expect(netAfter(10)).toBe(33147);
    expect(netAfter(9)).toBeLessThan(model.systemPriceUsd);
    expect(netAfter(10)).toBeGreaterThan(model.systemPriceUsd);
  });

  it('finds the month inside that year, not the year boundary', () => {
    // The lines meet partway through: rounding to the boundary would move
    // payback by up to a year in either direction.
    expect(model.paybackMonth).not.toBeNull();
    expect(Math.ceil(model.paybackMonth! / 12)).toBe(model.paybackYear);
    expect(model.paybackMonth).toBeGreaterThan(9 * 12);
    expect(model.paybackMonth).toBeLessThanOrEqual(10 * 12);
  });

  it('accumulates in one direction only, on both paths', () => {
    for (let i = 1; i < model.rows.length; i++) {
      expect(model.rows[i].cumulativeWithout).toBeGreaterThanOrEqual(
        model.rows[i - 1].cumulativeWithout
      );
      expect(model.rows[i].cumulativeWith).toBeGreaterThanOrEqual(
        model.rows[i - 1].cumulativeWith
      );
    }
  });

  it('reports the monthly equivalent as arithmetic, not as a payment', () => {
    expect(model.monthlyEquivalent).toBe(
      Math.round(ORDINARY.systemPriceUsd / (RESULTS.horizonYears * 12))
    );
  });

  it('matches its snapshot', () => {
    // Locks the model and the arithmetic together. Changing an assumption
    // should move these; a refactor should not.
    expect({
      paybackYear: model.paybackYear,
      paybackCalendarYear: model.paybackCalendarYear,
      paybackMonth: model.paybackMonth,
      totalWithout: model.totalWithout,
      totalWith: model.totalWith,
      systemPriceUsd: model.systemPriceUsd,
      monthlyEquivalent: model.monthlyEquivalent,
      finalYear: model.final.calendarYear,
      finalWithoutMonthly: model.final.withoutMonthly,
      finalResidualMonthly: model.final.residualMonthly,
    }).toMatchInlineSnapshot(`
      {
        "finalResidualMonthly": 50,
        "finalWithoutMonthly": 548,
        "finalYear": 2050,
        "monthlyEquivalent": 108,
        "paybackCalendarYear": 2035,
        "paybackMonth": 118,
        "paybackYear": 10,
        "systemPriceUsd": 32390,
        "totalWith": 38369,
        "totalWithout": 112176,
      }
    `);
  });
});

describe('when it is never paid back', () => {
  it('says so rather than inventing a year', () => {
    // A small bill and a large array: the utility never takes enough inside
    // the horizon to cover the cheque.
    const model = projectResults({
      ...ORDINARY,
      monthlyBillUsd: 40,
      systemPriceUsd: 60000,
    });

    expect(model.paybackMonth).toBeNull();
    expect(model.paybackYear).toBeNull();
    expect(model.paybackCalendarYear).toBeNull();
    expect(model.totalWith).toBeGreaterThan(model.totalWithout);
  });

  it('never claims a payback the cumulative figures do not support', () => {
    for (const bill of [0, 25, 80, 240, 600]) {
      const model = projectResults({ ...ORDINARY, monthlyBillUsd: bill });
      if (model.paybackYear === null) {
        expect(
          model.rows.every((r) => r.cumulativeWithout < r.cumulativeWith),
          `bill ${bill} claimed no payback but crossed anyway`
        ).toBe(true);
      } else {
        const row = model.rows[model.paybackYear - 1];
        expect(row.cumulativeWithout, `bill ${bill}`).toBeGreaterThanOrEqual(row.cumulativeWith);
        if (model.paybackYear > 1) {
          const previous = model.rows[model.paybackYear - 2];
          expect(previous.cumulativeWithout, `bill ${bill}`).toBeLessThan(previous.cumulativeWith);
        }
      }
    }
  });

  it('pays a fixed price back sooner on a bigger bill', () => {
    // Which is the whole shape of the argument.
    const small = projectResults({ ...ORDINARY, monthlyBillUsd: 150 }).paybackYear ?? Infinity;
    const large = projectResults({ ...ORDINARY, monthlyBillUsd: 400 }).paybackYear ?? Infinity;
    expect(large).toBeLessThan(small);
  });
});

describe('the inflation the customer chooses', () => {
  it('brings payback forward as the rate rises', () => {
    const at = (inflationPct: number) =>
      projectResults({ ...ORDINARY, inflationPct }).paybackYear ?? Infinity;

    expect(at(RESULTS.inflationMaxPct)).toBeLessThanOrEqual(at(HAND_CHECKED_INFLATION_PCT));
    expect(at(HAND_CHECKED_INFLATION_PCT)).toBeLessThanOrEqual(at(RESULTS.inflationMinPct));
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
    // With inflation held at zero, the only thing that can move the residual
    // is the panels making less.
    expect(model.final.residualMonthly).toBeGreaterThan(model.rows[0].residualMonthly);
  });

  it('leaves the residual at nothing when there is no degradation', () => {
    const model = projectResults({
      ...ORDINARY,
      inflationPct: 0,
      assumptions: { ...RESULTS, degradationPctPerYear: 0 },
    });
    expect(model.final.residualMonthly).toBe(0);
    // With no residual and no inflation, payback is the price divided by the
    // bill: $32,390 at $240 a month is 135 months, which lands in year 12.
    expect(model.paybackMonth).toBe(135);
    expect(model.paybackYear).toBe(12);
  });

  it('pushes payback out, never pulls it in', () => {
    const withDegradation = projectResults(ORDINARY).paybackMonth!;
    const without = projectResults({
      ...ORDINARY,
      assumptions: { ...RESULTS, degradationPctPerYear: 0 },
    }).paybackMonth!;
    expect(withDegradation).toBeGreaterThanOrEqual(without);
  });
});

describe('edge cases', () => {
  it('handles a customer with no bill without dividing by zero', () => {
    const model = projectResults({ ...ORDINARY, monthlyBillUsd: 0 });
    expect(model.totalWithout).toBe(0);
    expect(model.paybackYear).toBeNull();
    expect(Number.isFinite(model.totalWith)).toBe(true);
  });

  it('treats a free system as paid back in the first month', () => {
    const model = projectResults({ ...ORDINARY, systemPriceUsd: 0 });
    expect(model.paybackMonth).toBe(1);
    expect(model.paybackYear).toBe(1);
  });

  it('clamps an offset outside nought to one', () => {
    const over = projectResults({ ...ORDINARY, offsetFraction: 3 });
    const full = projectResults({ ...ORDINARY, offsetFraction: 1 });
    expect(over.totalWith).toBe(full.totalWith);

    const under = projectResults({ ...ORDINARY, offsetFraction: -1 });
    const none = projectResults({ ...ORDINARY, offsetFraction: 0 });
    expect(under.totalWith).toBe(none.totalWith);
  });

  it('never pays back an array that covers nothing', () => {
    // They pay the whole bill and the whole system, so the utility can never
    // get ahead.
    const model = projectResults({ ...ORDINARY, offsetFraction: 0 });
    expect(model.rows[0].residualMonthly).toBe(240);
    expect(model.paybackYear).toBeNull();
  });
});

describe('the rates the customer can tap', () => {
  it('offers four readings of the same question', () => {
    expect(INFLATION_MARKS.map((m) => ({ pct: m.pct, label: m.label }))).toMatchInlineSnapshot(`
      [
        {
          "label": "25y",
          "pct": 2.9,
        },
        {
          "label": "10y",
          "pct": 3.9,
        },
        {
          "label": "since '21",
          "pct": 4.6,
        },
        {
          "label": "EIA",
          "pct": 5,
        },
      ]
    `);
  });

  it('defaults to the ten-year Texas average', () => {
    // Long enough to average out a bad year, short enough to describe the
    // present. Whatever it is, it has to be a mark the slider can land on.
    expect(RESULTS.utilityInflationPct).toBe(3.9);
    expect(INFLATION_MARKS.map((m) => m.pct)).toContain(RESULTS.utilityInflationPct);
  });

  it('keeps every mark inside the slider, on a step it can reach', () => {
    for (const mark of INFLATION_MARKS) {
      expect(mark.pct, mark.label).toBeGreaterThanOrEqual(RESULTS.inflationMinPct);
      expect(mark.pct, mark.label).toBeLessThanOrEqual(RESULTS.inflationMaxPct);
      // Tapping a mark must land on it exactly, not a step either side.
      const steps = (mark.pct - RESULTS.inflationMinPct) / RESULTS.inflationStepPct;
      expect(Math.abs(steps - Math.round(steps)), `${mark.label} is off-step`).toBeLessThan(1e-9);
    }
  });

  it('rises in order, and every one says where it came from', () => {
    for (let i = 1; i < INFLATION_MARKS.length; i++) {
      expect(INFLATION_MARKS[i].pct).toBeGreaterThan(INFLATION_MARKS[i - 1].pct);
    }
    for (const mark of INFLATION_MARKS) {
      expect(mark.label.length, `${mark.label} is too long for a tick`).toBeLessThanOrEqual(10);
      expect(mark.detail.length, `${mark.label} has no source`).toBeGreaterThan(20);
    }
  });
});
