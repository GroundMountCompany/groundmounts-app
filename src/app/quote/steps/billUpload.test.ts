import { describe, it, expect } from 'vitest';
import { annualFromMonths } from './BillUpload';

/**
 * A year of usage from however many months the bill showed.
 *
 * Most Texas bills show one month; some show a twelve-month history graph.
 * Both have to produce a number the array can be sized against, and the
 * customer has to be told which of the two they are looking at.
 */

const month = (kwh: number) => ({ month: 'x', kwh, cost: null });

describe('annual usage from confirmed months', () => {
  it('sums twelve months without scaling', () => {
    const months = Array.from({ length: 12 }, () => month(1000));
    expect(annualFromMonths(months)).toEqual({ annual: 12_000, scaled: false });
  });

  it('scales a partial year up, and says it did', () => {
    // One month at 1,450 kWh is 17,400 a year — a projection, not a reading,
    // and the screen labels it as such.
    expect(annualFromMonths([month(1450)])).toEqual({ annual: 17_400, scaled: true });
    expect(annualFromMonths([month(1000), month(1200), month(800)])).toEqual({
      annual: 12_000,
      scaled: true,
    });
  });

  it('ignores rows the customer emptied', () => {
    // Editing a row to nothing removes it rather than counting a zero month,
    // which would drag the average down and under-size the array.
    expect(annualFromMonths([month(1000), month(0), month(1000)])).toEqual({
      annual: 12_000,
      scaled: true,
    });
  });

  it('returns nothing rather than zero when there is nothing to add up', () => {
    expect(annualFromMonths([])).toEqual({ annual: 0, scaled: false });
    expect(annualFromMonths([month(0)])).toEqual({ annual: 0, scaled: false });
  });

  it('handles more than twelve months without scaling them', () => {
    const months = Array.from({ length: 13 }, () => month(1000));
    expect(annualFromMonths(months)).toEqual({ annual: 13_000, scaled: false });
  });
});
