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
  /**
   * Which line to show under the slider while this mark is selected.
   *
   * A key rather than the sentence: the words live in copy.ts with the rest of
   * the copy, where the banned-words test can see them.
   */
  explainKey: 'rateExplain2000' | 'rateExplain2015' | 'rateExplain2021' | 'rateExplainEia';
}

export const INFLATION_MARKS: InflationMark[] = [
  /*
    All three Texas figures come from one EIA series — the annual average
    retail price of electricity to residential customers, Total Electric
    Industry — so the endpoints are comparable. An earlier version mixed an
    annual figure with a year-to-date one and produced rates that could not be
    reconciled with either.

    Series: EIA Open Data, electricity/retail-sales, frequency=annual,
    data=price, facets stateid=TX and sectorid=RES. (v1 series id
    ELEC.PRICE.TX-RES.A.) The same numbers appear in the Electric Power Annual
    and in Sales, Revenue and Average Price Table 4 once those publications
    catch up; the API carries the most recent year first.

      2000  7.96¢
      2015 11.56¢
      2021 12.11¢
      2025 15.47¢

    Each rate is (end / start) ^ (1 / years) - 1, rounded to a tenth.
  */
  {
    // (15.47 / 7.96) ^ (1/25) - 1 = 2.6935%
    pct: 2.7,
    label: '2000–25',
    detail: 'Texas, 25 years: 7.96¢ in 2000 to 15.47¢ in 2025 (EIA annual)',
    explainKey: 'rateExplain2000',
  },
  {
    // (15.47 / 11.56) ^ (1/10) - 1 = 2.9564%. The default: long enough to
    // average out a bad year, short enough to still describe the present.
    pct: 3.0,
    label: '2015–25',
    detail: 'Texas, 10 years: 11.56¢ in 2015 to 15.47¢ in 2025 (EIA annual)',
    explainKey: 'rateExplain2015',
  },
  {
    // EIA Short-Term Energy Outlook 2026: residential prices up about 5% in
    // 2026. National, not Texas — the only forward-looking figure here.
    pct: 5.0,
    label: "EIA '26",
    detail: 'EIA Short-Term Energy Outlook: US residential prices up 5% in 2026 (national)',
    explainKey: 'rateExplainEia',
  },
  {
    // (15.47 / 12.11) ^ (1/4) - 1 = 6.3130%. Four years off the post-2021
    // base, so a short window and a steep one.
    pct: 6.3,
    label: '2021–25',
    detail: 'Texas, 4 years: 12.11¢ in 2021 to 15.47¢ in 2025 (EIA annual)',
    explainKey: 'rateExplain2021',
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
  // Texas 2015-2025, the ten-year compound rate. Long enough to average out a
  // bad year, short enough to still describe the present. See INFLATION_MARKS.
  utilityInflationPct: 3.0,
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
