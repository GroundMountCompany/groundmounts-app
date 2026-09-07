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
  /*
    All three Texas figures come from one EIA series — the annual average
    retail price of electricity to residential customers, Total Electric
    Industry — so the endpoints are comparable. An earlier version mixed an
    annual figure with a year-to-date one and produced rates that could not be
    reconciled with either.

    Values, and where each was read:
      2000  7.96¢  "Average Price by State by Provider, 1990-2020",
                   eia.gov/electricity/data/state/avgprice_annual.xlsx
      2015 11.56¢  Sales, Revenue and Average Price, Table 4, 2015 edition
      2021 12.11¢  Sales, Revenue and Average Price, Table 4, 2021 edition
      2024 14.94¢  Sales, Revenue and Average Price, Table 4, 2024 edition
                   (released 7 October 2025; matches Electric Power Annual
                   Table 2.10, "2024 and 2023")

    2024 is the end year because it is the most recent year EIA has published
    an annual state price for. The monthly table carries newer year-to-date
    figures, but a part-year average is not the same measurement and mixing
    the two is what went wrong before.

    Each rate is (end / start) ^ (1 / years) - 1, rounded to a tenth.
  */
  {
    // (14.94 / 7.96) ^ (1/24) - 1 = 2.657%
    pct: 2.7,
    label: '2000–24',
    detail: 'Texas, 24 years: 7.96¢ in 2000 to 14.94¢ in 2024 (EIA annual)',
  },
  {
    // (14.94 / 11.56) ^ (1/9) - 1 = 2.887%. The default: long enough to
    // average out a bad year, short enough to still describe the present.
    pct: 2.9,
    label: '2015–24',
    detail: 'Texas, 9 years: 11.56¢ in 2015 to 14.94¢ in 2024 (EIA annual)',
  },
  {
    // EIA Short-Term Energy Outlook 2026: residential prices up about 5% in
    // 2026. National, not Texas — the only forward-looking figure here.
    pct: 5.0,
    label: "EIA '26",
    detail: 'EIA Short-Term Energy Outlook: US residential prices up 5% in 2026 (national)',
  },
  {
    // (14.94 / 12.11) ^ (1/3) - 1 = 7.256%. Three years off the post-2021
    // base, so a short window and a steep one.
    pct: 7.3,
    label: '2021–24',
    detail: 'Texas, 3 years: 12.11¢ in 2021 to 14.94¢ in 2024 (EIA annual)',
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
  // Texas 2015-2024, the nine-year compound rate. Long enough to average out
  // a bad year, short enough to still describe the present. See
  // INFLATION_MARKS.
  utilityInflationPct: 2.9,
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
