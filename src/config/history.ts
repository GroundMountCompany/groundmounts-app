/**
 * What electricity has actually cost and how much of it Texas has used.
 *
 * Every figure here was pulled from the publisher's own data and pasted in.
 * Nothing is fetched at runtime: a chart that goes blank because somebody
 * else's API had a bad afternoon is worse than one that is a month stale, and
 * these series move once a year.
 *
 * No money lives here — cents per kWh is a rate, not a price we charge — so
 * this file is not subject to the pricing.ts rule.
 */

export interface HistoryYear {
  year: number;
  /** Texas residential retail price, cents per kWh. */
  priceCents: number;
  /** Texas retail electricity sales, all sectors, TWh. Null before the series. */
  demandTwh: number | null;
}

/*
  PRICE — EIA, average retail price of electricity to residential customers,
  Texas, annual.

  API: https://api.eia.gov/v2/electricity/retail-sales/data/
       ?frequency=annual&data[0]=price&facets[stateid][]=TX
       &facets[sectorid][]=RES        (v1 series id ELEC.PRICE.TX-RES.A)

  That series begins in 2001. The 2000 value comes from the older EIA workbook
  "Average Price by State by Provider, 1990-2020"
  (eia.gov/electricity/data/state/avgprice_annual.xlsx), which is the same
  EIA-861 annual measurement published earlier. Where the two overlap they
  agree to the cent, which is why mixing them here is safe and mixing an
  annual figure with a year-to-date one was not.

  DEMAND — EIA, retail sales of electricity, Texas, all sectors, annual, from
  the same endpoint with data[0]=sales and facets[sectorid][]=ALL. Reported in
  million kWh; divided by 1000 here to give TWh.

  Deliberately EIA and not ERCOT. ERCOT publishes net energy for load, which is
  the better measure of the grid this customer is on, but ERCOT's own
  publications only carry it back a couple of years (the Demand and Energy
  report covers the current year and the one before) and the hourly archives
  only reach 2016. A quarter-century of it is not obtainable from the source.
  So the history is one EIA series on one basis for both lines, and ERCOT's
  forecast below is kept as its own clearly-labelled series rather than being
  drawn as a continuation of this one.

  For scale: ERCOT net energy for load was 461.6 TWh in 2024 and 488.4 TWh in
  2025 (ERCOT, Demand and Energy Report, February 2025), against the 505.4 and
  519.7 below — ERCOT is roughly nine tenths of Texas.

  Pulled 7 September 2026.
*/
export const HISTORY: HistoryYear[] = [
  { year: 2000, priceCents: 7.96, demandTwh: null },
  { year: 2001, priceCents: 8.86, demandTwh: 318.0 },
  { year: 2002, priceCents: 8.05, demandTwh: 320.8 },
  { year: 2003, priceCents: 9.16, demandTwh: 322.7 },
  { year: 2004, priceCents: 9.73, demandTwh: 320.6 },
  { year: 2005, priceCents: 10.93, demandTwh: 334.3 },
  { year: 2006, priceCents: 12.86, demandTwh: 342.7 },
  { year: 2007, priceCents: 12.34, demandTwh: 343.8 },
  { year: 2008, priceCents: 13.03, demandTwh: 347.8 },
  { year: 2009, priceCents: 12.38, demandTwh: 345.4 },
  { year: 2010, priceCents: 11.6, demandTwh: 358.5 },
  { year: 2011, priceCents: 11.08, demandTwh: 376.1 },
  { year: 2012, priceCents: 10.98, demandTwh: 365.1 },
  { year: 2013, priceCents: 11.35, demandTwh: 378.8 },
  { year: 2014, priceCents: 11.86, demandTwh: 389.7 },
  { year: 2015, priceCents: 11.56, demandTwh: 392.3 },
  { year: 2016, priceCents: 10.99, demandTwh: 398.7 },
  { year: 2017, priceCents: 11.01, demandTwh: 401.9 },
  { year: 2018, priceCents: 11.2, demandTwh: 424.4 },
  { year: 2019, priceCents: 11.76, demandTwh: 429.3 },
  { year: 2020, priceCents: 11.71, demandTwh: 426.9 },
  { year: 2021, priceCents: 12.11, demandTwh: 435.6 },
  { year: 2022, priceCents: 13.76, demandTwh: 475.4 },
  { year: 2023, priceCents: 14.46, demandTwh: 492.8 },
  { year: 2024, priceCents: 14.94, demandTwh: 505.4 },
  { year: 2025, priceCents: 15.47, demandTwh: 519.7 },
];

/*
  ERCOT's own forecast, not ours.

  ERCOT, 2025 Long-Term Hourly Peak Demand and Energy Forecast, 8 April 2025,
  Appendix A ("Peak Demand and Energy Forecast Summary"). The report gives
  2025-2031; the five forecast years after the last actual are shown.

    2025 486 TWh (forecast; the actual came in at 488.4)
    2026 558   2027 648   2028 795   2029 889   2030 984   2031 1,038

  This is ERCOT net energy for load, a different measurement from the EIA
  retail sales above — see the note there. It is drawn as its own dashed
  series and labelled as ERCOT's forecast, never as a continuation.
*/
export interface ForecastYear {
  year: number;
  ercotTwh: number;
}

export const ERCOT_FORECAST: ForecastYear[] = [
  /*
    2025 is ERCOT's own actual, not a forecast: 488,406,479 MWh net energy for
    load (ERCOT, Demand and Energy Report, February 2025, "Energy" sheet).

    It is here so the dashed line begins on an ERCOT number and stays on one
    basis for its whole length. Anchoring it to the EIA figure beside it would
    have drawn a line whose first point was one measurement and whose rest were
    another — the same mistake as mixing an annual price with a year-to-date
    one, in a different costume.
  */
  { year: 2025, ercotTwh: 488.4 },
  { year: 2026, ercotTwh: 558 },
  { year: 2027, ercotTwh: 648 },
  { year: 2028, ercotTwh: 795 },
  { year: 2029, ercotTwh: 889 },
  { year: 2030, ercotTwh: 984 },
];

/**
 * The two spans the chart calls out on the price line.
 *
 * Years only. The rates are computed from HISTORY, so the label and the line
 * can never disagree — an earlier version of the rate marks carried a
 * percentage and two endpoints that had drifted apart.
 */
export const PRICE_CALLOUTS = [
  { fromYear: 2000, toYear: 2015 },
  { fromYear: 2021, toYear: 2025 },
] as const;

/**
 * Plain labels on the recent demand years. No claim beyond the label: these
 * name things that are happening, not a decomposition of the curve.
 */
export const DEMAND_CALLOUTS = [
  { year: 2021, key: 'electrification' },
  { year: 2023, key: 'evs' },
  { year: 2025, key: 'dataCentres' },
] as const;
