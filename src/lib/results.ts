import { RESULTS, type ResultsAssumptions } from '@/config/results';

/**
 * Twenty-five years of paying the utility, against buying the array outright.
 *
 * The point of this is sticker shock, answered. A customer who has just been
 * shown a five-figure number needs to see it next to the five-figure number
 * they are already paying and had never added up.
 *
 * The system is paid for at the start, because that is when it is paid for.
 * An earlier version of this spread the price evenly across the horizon and
 * compared monthly outlay against monthly outlay, which put payback in year
 * one for almost everybody — true in its own terms, and useless. Money spent
 * today is not money spent in 2049, and a payback figure that pretends
 * otherwise is not a payback figure.
 *
 * Pure, and every assumption is an argument: the screen prints the same values
 * it passes in, so there is nothing here the customer cannot see.
 */

export interface ResultsInput {
  /** The monthly bill they typed in on step 2. */
  monthlyBillUsd: number;
  /** The estimate they were just shown, paid up front. */
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
  /** What the utility charges a month that year, if nothing is built. */
  withoutMonthly: number;
  /** What the grid still charges a month that year, with the array up. */
  residualMonthly: number;
  /** Everything paid to the utility from year one to the end of this year. */
  cumulativeWithout: number;
  /** The system, plus every residual bill since. Starts at the price. */
  cumulativeWith: number;
}

export interface ResultsModel {
  rows: ResultsYear[];
  /**
   * The first month in which the utility has taken more than the whole array
   * cost, residual bills included. 1-based.
   *
   * Null when it does not happen inside the horizon, which the screen says
   * plainly rather than hiding.
   */
  paybackMonth: number | null;
  /** The year that month falls in, and the calendar year it lands on. */
  paybackYear: number | null;
  paybackCalendarYear: number | null;
  /** Everything the utility takes over the horizon, if nothing is built. */
  totalWithout: number;
  /** The system plus every residual bill over the horizon. */
  totalWith: number;
  systemPriceUsd: number;
  /**
   * The price divided across the horizon.
   *
   * A secondary figure and labelled as one. It is a way of feeling the size of
   * the number, not a payment and not a payback — nobody is offering to take
   * it monthly.
   */
  monthlyEquivalent: number;
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
 * With solar: the cheque on day one, and after that only whatever the grid
 * still charges them — the share the array does not cover, at that year's
 * inflated rate. That share grows slightly each year as the panels age.
 *
 * Accumulated month by month, because that is the resolution the crossing
 * happens at: on an ordinary bill the two lines meet nine or ten months into
 * a year, and rounding that to the year boundary moves payback by up to a year
 * in either direction.
 */
export function projectResults(input: ResultsInput): ResultsModel {
  const assumptions = input.assumptions ?? RESULTS;
  const { horizonYears, degradationPctPerYear } = assumptions;

  const inflation = input.inflationPct / 100;
  const degradation = degradationPctPerYear / 100;
  const monthlyBill = Math.max(0, input.monthlyBillUsd);
  const systemPrice = Math.max(0, input.systemPriceUsd);
  // A design covering more than everything still only saves what is on the
  // bill: the utility does not pay them for the surplus in this model. This
  // cap is the residual-bill calculation's, not the customer's answer — see
  // displayOffsetPct, which prints what they actually chose.
  const offset = Math.min(1, Math.max(0, input.offsetFraction));

  const rows: ResultsYear[] = [];
  let cumulativeWithout = 0;
  // The cheque, on day one. Everything after this is the residual bill.
  let cumulativeWith = systemPrice;
  let paybackMonth: number | null = null;

  for (let year = 1; year <= horizonYears; year++) {
    const inflated = monthlyBill * Math.pow(1 + inflation, year - 1);
    const covered = offset * Math.pow(1 - degradation, year - 1);
    const residual = Math.max(0, 1 - covered) * inflated;

    for (let month = 1; month <= 12; month++) {
      cumulativeWithout += inflated;
      cumulativeWith += residual;
      if (paybackMonth === null && cumulativeWithout >= cumulativeWith) {
        paybackMonth = (year - 1) * 12 + month;
      }
    }

    rows.push({
      year,
      calendarYear: input.startYear + year - 1,
      withoutMonthly: round(inflated),
      residualMonthly: round(residual),
      cumulativeWithout: round(cumulativeWithout),
      cumulativeWith: round(cumulativeWith),
    });
  }

  const paybackYear = paybackMonth === null ? null : Math.ceil(paybackMonth / 12);

  return {
    rows,
    paybackMonth,
    paybackYear,
    paybackCalendarYear: paybackYear === null ? null : input.startYear + paybackYear - 1,
    totalWithout: round(cumulativeWithout),
    totalWith: round(cumulativeWith),
    systemPriceUsd: round(systemPrice),
    monthlyEquivalent: round(horizonYears > 0 ? systemPrice / (horizonYears * 12) : 0),
    final: rows[rows.length - 1],
    inflationPct: input.inflationPct,
    assumptions,
  };
}

/**
 * The offset to print, as the customer set it.
 *
 * projectResults caps at 100% because a surplus earns nothing in this model,
 * and the assumptions panel was reusing that cap for its label — so somebody
 * who chose 110% was shown 100% and told that was their input. It was not.
 * The number they picked goes on screen; the cap stays where it belongs, in
 * the arithmetic.
 */
export function displayOffsetPct(fraction: number): number {
  return Math.round(Math.max(0, fraction) * 100);
}
