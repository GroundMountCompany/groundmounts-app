/**
 * What each fixture bill actually prints, read off the image by hand.
 *
 * The source of truth for `scripts/eval-bills.ts`: not what the model returned,
 * which is the thing being judged, but what a person sees on the page. If the
 * two disagree, the model is wrong.
 */

export interface ExpectedBill {
  file: string;
  /** What kind of bill this is, for the report. */
  description: string;
  /** Every period printed, newest first. */
  months: Array<{ month: string; kwh: number }>;
  /**
   * The blended price: the period's electricity total over its kilowatt-hours.
   * Null when the bill shows no cost to divide.
   */
  ratePerKwh: number | null;
  /** How many periods we expect back after the twelve-month cap. */
  expectedMonthCount: number;
}

export const EXPECTED_BILLS: ExpectedBill[] = [
  {
    file: 'bill-retail.png',
    description: 'Retail REP statement with a 13-bar usage history chart',
    months: [
      { month: 'Aug 26', kwh: 1842 },
      { month: 'Jul 26', kwh: 2040 },
      { month: 'Jun 26', kwh: 1710 },
      { month: 'May 26', kwh: 1490 },
      { month: 'Apr 26', kwh: 1375 },
      { month: 'Mar 26', kwh: 1280 },
      { month: 'Feb 26', kwh: 1195 },
      { month: 'Jan 26', kwh: 1080 },
      { month: 'Dec 25', kwh: 950 },
      { month: 'Nov 25', kwh: 910 },
      { month: 'Oct 25', kwh: 980 },
      { month: 'Sep 25', kwh: 1045 },
      // Aug 25 (1,120) is the thirteenth and is expected to be dropped.
    ],
    // $296.41 total current charges over 1,842 kWh. The bill prints 12.9c,
    // which is the energy charge only.
    ratePerKwh: 0.1609,
    expectedMonthCount: 12,
  },
  {
    file: 'bill-coop.png',
    description: 'Electric cooperative statement with a 12-month usage table',
    months: [
      { month: 'Aug 2026', kwh: 2315 },
      { month: 'Jul 2026', kwh: 2240 },
      { month: 'Jun 2026', kwh: 2010 },
      { month: 'May 2026', kwh: 1625 },
      { month: 'Apr 2026', kwh: 1480 },
      { month: 'Mar 2026', kwh: 1375 },
      { month: 'Feb 2026', kwh: 1295 },
      { month: 'Jan 2026', kwh: 1410 },
      { month: 'Dec 2025', kwh: 1325 },
      { month: 'Nov 2025', kwh: 1090 },
      { month: 'Oct 2025', kwh: 1185 },
      { month: 'Sep 2025', kwh: 1260 },
    ],
    // $312.77 total due over 2,315 kWh, against 10.8c printed.
    ratePerKwh: 0.1351,
    expectedMonthCount: 12,
  },
  {
    file: 'bill-municipal.png',
    description: 'Municipal combined statement — electricity, water and trash',
    months: [{ month: 'Jul 2026', kwh: 1560 }],
    // $195.62 of ELECTRIC over 1,560 kWh. The $278.87 total includes water
    // and trash and must not be used.
    ratePerKwh: 0.1254,
    expectedMonthCount: 1,
  },
  {
    file: 'bill-photo-blurry.png',
    description: 'The municipal statement photographed on a worktop at an angle',
    months: [{ month: 'Jul 2026', kwh: 1560 }],
    ratePerKwh: 0.1254,
    expectedMonthCount: 1,
  },
];
