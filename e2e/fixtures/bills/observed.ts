/**
 * What the deployed extractor actually returned for each fixture bill.
 *
 * Captured from live runs against /api/bill/extract with the real key on
 * 2026-09-04, not written by hand. Each was run three times and returned the
 * same figures every time. The e2e replays these so the customer's
 * path through a real answer is exercised without spending an API call or
 * depending on a model's mood.
 *
 * Re-capture with:
 *   curl -X POST -F "file=@e2e/fixtures/bills/bill-retail.png" <preview>/api/bill/extract
 */

export interface ObservedExtraction {
  months: Array<{ month: string; kwh: number; cost: number | null }>;
  ratePerKwh: number | null;
  confidence: 'high' | 'low';
}

/**
 * A retailer's usage-history chart of thirteen bars, of which the twelve most
 * recent come back, newest first.
 *
 * Getting here took two fixes found by running it: two-digit labels like
 * "Aug 25" would not parse, and the model was truncating its own oldest-first
 * list from the wrong end and losing August 2026 entirely.
 */
export const RETAIL: ObservedExtraction = {
  months: [
    { month: 'Aug 26', kwh: 1842, cost: null },
    { month: 'Jul 26', kwh: 2040, cost: null },
    { month: 'Jun 26', kwh: 1710, cost: null },
    { month: 'May 26', kwh: 1490, cost: null },
    { month: 'Apr 26', kwh: 1375, cost: null },
    { month: 'Mar 26', kwh: 1280, cost: null },
    { month: 'Feb 26', kwh: 1195, cost: null },
    { month: 'Jan 26', kwh: 1080, cost: null },
    { month: 'Dec 25', kwh: 950, cost: null },
    { month: 'Nov 25', kwh: 910, cost: null },
    { month: 'Oct 25', kwh: 980, cost: null },
    { month: 'Sep 25', kwh: 1045, cost: null },
  ],
  ratePerKwh: 0.129,
  confidence: 'high',
};

/** A cooperative's twelve-month table, newest first, with the period's total. */
export const COOP: ObservedExtraction = {
  months: [
    { month: 'Aug 2026', kwh: 2315, cost: 312.77 },
    { month: 'Jul 2026', kwh: 2240, cost: null },
    { month: 'Jun 2026', kwh: 2010, cost: null },
    { month: 'May 2026', kwh: 1625, cost: null },
    { month: 'Apr 2026', kwh: 1480, cost: null },
    { month: 'Mar 2026', kwh: 1375, cost: null },
    { month: 'Feb 2026', kwh: 1295, cost: null },
    { month: 'Jan 2026', kwh: 1410, cost: null },
    { month: 'Dec 2025', kwh: 1325, cost: null },
    { month: 'Nov 2025', kwh: 1090, cost: null },
    { month: 'Oct 2025', kwh: 1185, cost: null },
    { month: 'Sep 2025', kwh: 1260, cost: null },
  ],
  ratePerKwh: 0.108,
  confidence: 'high',
};

/** A municipal combined statement: one month of electricity among the water. */
export const MUNICIPAL: ObservedExtraction = {
  months: [{ month: 'Jul 2026', kwh: 1560, cost: 195.62 }],
  ratePerKwh: 0.1145,
  confidence: 'high',
};

/**
 * The same statement photographed on a worktop at an angle.
 *
 * Predicted to fail to manual entry; it read the figures perfectly. Kept as
 * the case it turned out to be.
 */
export const BLURRY_PHOTO: ObservedExtraction = {
  months: [{ month: 'Jul 2026', kwh: 1560, cost: 195.62 }],
  ratePerKwh: 0.1145,
  confidence: 'high',
};
