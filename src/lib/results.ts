import { RESULTS, type ResultsAssumptions } from '@/config/results';

/**
 * Twenty-five years of paying the utility, against twenty-five years of owning
 * the array.
 *
 * The point of this is sticker shock, answered. A customer who has just been
 * shown a five-figure number needs to see it next to the five-figure number
 * they are already paying and had never added up.
 *
 * Pure, and every assumption is an argument: the screen prints the same values
 * it passes in, so there is nothing here the customer cannot see.
 */

export interface ResultsInput {
  /** The monthly bill they typed in on step 2. */
  monthlyBillUsd: number;
  /** The estimate they were just shown. Not a loan — see FINANCING_INCLUDED. */
  systemPriceUsd: number;
  /** How much of their power the array covers, 0..1, before degradation. */
  offsetFraction: number;
  /** The inflation figure, as the slider has it. */
  inflationPct: number;
  /** Year one of the comparison. Passed in so this stays pure. */
  startYear: number;
  assumptions?: ResultsAssumptions;
}

export interface ResultsYear {
  /** 1-based, so year 1 is the first twelve months. */
  year: number;
  calendarYear: number;
  /** What a month costs that year, on each path. */
  withoutMonthly: number;
  withMonthly: number;
  /** Everything paid from year one to the end of this year. */
  cumulativeWithout: number;
  cumulativeWith: number;
}

export interface ResultsModel {
  rows: ResultsYear[];
  /**
   * The first year in which owning has cost less in total than not owning.
   *
   * Null when it does not happen inside the horizon, which the screen says
   * plainly rather than hiding.
   */
  breakEvenYear: number | null;
  /** Everything the utility takes over the horizon, if nothing is built. */
  totalWithout: number;
  /** Everything owning costs over the horizon, including the system. */
  totalWith: number;
  systemPriceUsd: number;
  /** The last year of the horizon, for the one-line comparison. */
  final: ResultsYear;
  /** Echoed back so the screen and the email print what was actually used. */
  inflationPct: number;
  assumptions: ResultsAssumptions;
}

const round = (n: number) => Math.round(n);

/**
 * Build the comparison.
 *
 * Without solar: the bill they gave us, grown by inflation once a year.
 *
 * With solar: the system spread evenly across the horizon, plus whatever the
 * grid still charges them — the share the array does not cover, at that year's
 * inflated rate. The covered share shrinks slightly each year as the panels
 * age, so the grid portion grows for two reasons rather than one.
 */
export function projectResults(input: ResultsInput): ResultsModel {
  const assumptions = input.assumptions ?? RESULTS;
  const { horizonYears, degradationPctPerYear } = assumptions;

  const inflation = input.inflationPct / 100;
  const degradation = degradationPctPerYear / 100;
  const monthlyBill = Math.max(0, input.monthlyBillUsd);
  const systemPrice = Math.max(0, input.systemPriceUsd);
  // A design covering more than everything still only saves what is on the
  // bill: the utility does not pay them for the surplus in this model.
  const offset = Math.min(1, Math.max(0, input.offsetFraction));

  const monthlySystem = horizonYears > 0 ? systemPrice / (horizonYears * 12) : 0;

  const rows: ResultsYear[] = [];
  let cumulativeWithout = 0;
  let cumulativeWith = 0;
  let breakEvenYear: number | null = null;

  for (let year = 1; year <= horizonYears; year++) {
    const inflated = monthlyBill * Math.pow(1 + inflation, year - 1);
    const covered = offset * Math.pow(1 - degradation, year - 1);
    const gridPortion = Math.max(0, 1 - covered) * inflated;

    const withoutMonthly = inflated;
    const withMonthly = monthlySystem + gridPortion;

    cumulativeWithout += withoutMonthly * 12;
    cumulativeWith += withMonthly * 12;

    if (breakEvenYear === null && cumulativeWith <= cumulativeWithout) {
      breakEvenYear = year;
    }

    rows.push({
      year,
      calendarYear: input.startYear + year - 1,
      withoutMonthly: round(withoutMonthly),
      withMonthly: round(withMonthly),
      cumulativeWithout: round(cumulativeWithout),
      cumulativeWith: round(cumulativeWith),
    });
  }

  const final = rows[rows.length - 1];

  return {
    rows,
    breakEvenYear,
    totalWithout: round(cumulativeWithout),
    totalWith: round(cumulativeWith),
    systemPriceUsd: round(systemPrice),
    final,
    inflationPct: input.inflationPct,
    assumptions,
  };
}
