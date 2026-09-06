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
  utilityInflationPct: 3.5,
  inflationMinPct: 0,
  inflationMaxPct: 8,
  inflationStepPct: 0.5,
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
