import { describe, it, expect } from 'vitest';
import { priceAt, priceCallouts, priceGrowthPct } from './history';
import { ERCOT_FORECAST, HISTORY, PRICE_CALLOUTS } from '@/config/history';

/**
 * The history chart's arithmetic, and the shape of the data behind it.
 *
 * Codex checks the figures against EIA and ERCOT. These check that what the
 * chart says about them follows from them — the failure the rate marks had was
 * a label and a number drifting apart with nothing in between to notice.
 */

describe('the annotations on the price line', () => {
  it('recomputes from the series rather than repeating a constant', () => {
    const callouts = priceCallouts();
    expect(callouts).toHaveLength(2);

    for (const c of callouts) {
      const from = priceAt(c.fromYear)!;
      const to = priceAt(c.toYear)!;
      const expected = (Math.pow(to / from, 1 / (c.toYear - c.fromYear)) - 1) * 100;
      expect(c.pct, `${c.fromYear}-${c.toYear}`).toBe(Number(expected.toFixed(1)));
    }
  });

  it('is the pair of spans the owner asked for, at the rates they imply', () => {
    // 7.96¢ to 11.56¢ over 15 years, and 12.11¢ to 15.47¢ over 4.
    expect(priceCallouts()).toEqual([
      { fromYear: 2000, toYear: 2015, pct: 2.5 },
      { fromYear: 2021, toYear: 2025, pct: 6.3 },
    ]);
  });

  it('says the recent run is the steeper one', () => {
    const [early, recent] = priceCallouts();
    expect(recent.pct).toBeGreaterThan(early.pct);
  });

  it('drops a span the series cannot support instead of inventing one', () => {
    expect(priceGrowthPct(1975, 2025)).toBeNull();
    expect(priceGrowthPct(2025, 2000)).toBeNull();
    expect(priceGrowthPct(2020, 2020)).toBeNull();
  });
});

describe('the series behind the chart', () => {
  it('runs the years the comments say, with no gaps', () => {
    expect(HISTORY[0].year).toBe(2000);
    expect(HISTORY[HISTORY.length - 1].year).toBe(2025);
    expect(HISTORY).toHaveLength(26);
    for (let i = 1; i < HISTORY.length; i++) {
      expect(HISTORY[i].year, 'a year is missing').toBe(HISTORY[i - 1].year + 1);
    }
  });

  it('has a price for every year and demand from 2001', () => {
    for (const row of HISTORY) {
      expect(row.priceCents, `${row.year} price`).toBeGreaterThan(0);
      if (row.year === 2000) {
        // The EIA sales series starts in 2001; the chart shows a gap rather
        // than a number nobody published.
        expect(row.demandTwh).toBeNull();
      } else {
        expect(row.demandTwh, `${row.year} demand`).toBeGreaterThan(0);
      }
    }
  });

  it("carries ERCOT's own anchor and five forecast years, rising", () => {
    // Six points: ERCOT's 2025 actual, then 2026-2030 forecast. The anchor is
    // there so the dashed line is ERCOT net energy for load along its whole
    // length rather than starting on the EIA figure beside it.
    expect(ERCOT_FORECAST).toHaveLength(6);
    expect(ERCOT_FORECAST[0].year).toBe(HISTORY[HISTORY.length - 1].year);
    expect(ERCOT_FORECAST.filter((f) => f.year > HISTORY[HISTORY.length - 1].year)).toHaveLength(5);

    // And it is ERCOT's number, not the EIA one on the same year.
    const eia = HISTORY[HISTORY.length - 1].demandTwh!;
    expect(ERCOT_FORECAST[0].ercotTwh).toBeLessThan(eia);
    for (let i = 1; i < ERCOT_FORECAST.length; i++) {
      expect(ERCOT_FORECAST[i].year).toBe(ERCOT_FORECAST[i - 1].year + 1);
      expect(ERCOT_FORECAST[i].ercotTwh).toBeGreaterThan(ERCOT_FORECAST[i - 1].ercotTwh);
    }
  });

  it('anchors every callout to a year that exists', () => {
    const years = new Set(HISTORY.map((r) => r.year));
    for (const c of PRICE_CALLOUTS) {
      expect(years.has(c.fromYear), `${c.fromYear}`).toBe(true);
      expect(years.has(c.toYear), `${c.toYear}`).toBe(true);
    }
  });
});
