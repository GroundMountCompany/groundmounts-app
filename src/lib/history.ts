import { HISTORY, PRICE_CALLOUTS, type HistoryYear } from '@/config/history';

/**
 * The rates the history chart annotates, computed from the series it draws.
 *
 * Never hard-coded. The rate marks on the slider shipped once with a
 * percentage and a pair of endpoints that had drifted apart, and nothing
 * caught it because the two lived in different strings. Here the only
 * hard-coded thing is a pair of years.
 */

export function priceAt(year: number, series: HistoryYear[] = HISTORY): number | null {
  return series.find((row) => row.year === year)?.priceCents ?? null;
}

/** Compound annual growth between two years of the price series, as a percent. */
export function priceGrowthPct(
  fromYear: number,
  toYear: number,
  series: HistoryYear[] = HISTORY
): number | null {
  const from = priceAt(fromYear, series);
  const to = priceAt(toYear, series);
  const years = toYear - fromYear;
  if (from === null || to === null || from <= 0 || years <= 0) return null;
  return (Math.pow(to / from, 1 / years) - 1) * 100;
}

export interface PriceCallout {
  fromYear: number;
  toYear: number;
  /** Rounded to a tenth, as shown. */
  pct: number;
}

/** Both annotations, ready to render. Anything unresolvable is dropped. */
export function priceCallouts(series: HistoryYear[] = HISTORY): PriceCallout[] {
  const out: PriceCallout[] = [];
  for (const { fromYear, toYear } of PRICE_CALLOUTS) {
    const pct = priceGrowthPct(fromYear, toYear, series);
    if (pct !== null) out.push({ fromYear, toYear, pct: Number(pct.toFixed(1)) });
  }
  return out;
}
