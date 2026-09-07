/**
 * What the twenty-five year comparison assumes.
 *
 * Every one of these is printed on the screen under "Our assumptions", because
 * a chart that goes up and to the right is worthless if nobody can see what it
 * was told to assume. The customer can move the inflation figure themselves;
 * the rest are ours to justify.
 *
 * No money lives here, so this file is not subject to the pricing.ts rule —
 * these are rates and a horizon, not prices.
 */

/**
 * A rate the customer can tap instead of dragging to.
 *
 * Four readings of the same question — what has the utility actually done, and
 * what is it about to do — so the number on the chart is somebody's published
 * figure rather than ours. Each carries its source, and the assumptions panel
 * prints all four.
 */
export interface InflationMark {
  /** Percent a year. */
  pct: number;
  /** On the tick, under the slider. Room for about eight characters. */
  label: string;
  /** In the assumptions panel, where there is room to say where it came from. */
  detail: string;
}

export const INFLATION_MARKS: InflationMark[] = [
  {
    // EIA state-level residential average, Texas: 7.58 cents/kWh in 2000 to
    // 16.11 cents in 2026. Twenty-six years of compounding works out at 2.9%.
    pct: 2.9,
    label: '25y',
    detail: 'Texas average over 25 years (7.58¢ in 2000 to 16.11¢ in 2026)',
  },
  {
    // The same series over the last full decade: 10.99 cents in 2016 to 15.47
    // in 2025. The default, because a decade is long enough to average out a
    // bad year and short enough to still describe the present.
    pct: 3.9,
    label: '10y',
    detail: 'Texas average over 10 years (10.99¢ in 2016 to 15.47¢ in 2025)',
  },
  {
    // Since the winter storm and the gas-price shock that followed it: 12.85
    // cents in 2021 to 16.11 in 2026.
    pct: 4.6,
    label: "since '21",
    detail: 'Texas since 2021 (12.85¢ to 16.11¢)',
  },
  {
    // EIA Short-Term Energy Outlook: residential prices up about 5% in 2026.
    pct: 5.0,
    label: 'EIA',
    detail: 'EIA Short-Term Energy Outlook, residential prices up 5% in 2026',
  },
];

export interface ResultsAssumptions {
  /** How much the utility puts its rates up each year, as a percentage. */
  utilityInflationPct: number;
  /** The slider bounds the customer can move that figure between. */
  inflationMinPct: number;
  inflationMaxPct: number;
  inflationStepPct: number;
  /**
   * How much less the panels make each year, as a percentage of the previous
   * year. Manufacturer warranties are written around this figure.
   */
  degradationPctPerYear: number;
  /** How far out the comparison runs. */
  horizonYears: number;
}

export const RESULTS: ResultsAssumptions = {
  // The ten-year Texas average. Long enough to average out a bad year, short
  // enough to still describe the present. See INFLATION_MARKS.
  utilityInflationPct: 3.9,
  inflationMinPct: 0,
  inflationMaxPct: 8,
  /*
    A tenth, not a half.

    The marks are published figures — 2.9 and 4.6 among them — and neither is
    a multiple of 0.5. On a half-point step, tapping "25-yr" would snap to 3.0
    and the chart would quietly disagree with the label that had just been
    pressed. The step exists to keep the slider tidy, not to round somebody
    else's data.
  */
  inflationStepPct: 0.1,
  degradationPctPerYear: 0.4,
  horizonYears: 25,
};

/**
 * There is no financing in this model, deliberately.
 *
 * The system price is spread evenly across the horizon so the two lines can be
 * compared month against month. That is not a loan payment and must not be
 * described as one — a real loan has interest, a term that is not 25 years,
 * and a credit decision behind it. This is arithmetic, and the assumptions
 * panel says so.
 */
export const FINANCING_INCLUDED = false;
