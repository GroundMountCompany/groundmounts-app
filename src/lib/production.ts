/**
 * Azimuth -> annual production, without calling PVWatts during a drag.
 *
 * PVWatts is queried once per location for a 1 kW reference system at five
 * azimuths (90/135/180/225/270). Everything after that is arithmetic against
 * those samples, so the compass handle can report "% vs south" on the same
 * frame as the gesture. No debounce, no request per drag frame.
 */

import { DEFAULTS } from '@/config/pricing';

export const REFERENCE_AZIMUTHS = DEFAULTS.pvwatts.referenceAzimuths;

/** kWh per installed kW per year, sampled at REFERENCE_AZIMUTHS. */
export type ProductionCurve = Record<number, number>;

/**
 * Fallback curve for Texas when PVWatts is unreachable, shaped like a real
 * north-hemisphere response: south best, east/west materially worse.
 */
const SOUTH_YIELD = DEFAULTS.fallbackKwhPerKwYear;

/**
 * Shape of the fallback response, as a fraction of the south-facing yield.
 * The peak itself is the configured figure, so changing it in pricing.ts moves
 * the whole curve instead of leaving the shoulders behind.
 */
const FALLBACK_SHAPE: Record<number, number> = {
  90: 0.8367,
  135: 0.95,
  180: 1,
  225: 0.9467,
  270: 0.83,
};

export const TX_FALLBACK_CURVE: ProductionCurve = Object.fromEntries(
  REFERENCE_AZIMUTHS.map((az) => [az, Math.round(SOUTH_YIELD * FALLBACK_SHAPE[az])])
);

function normalizeAzimuth(azimuth: number): number {
  return ((azimuth % 360) + 360) % 360;
}

/**
 * Mirror an azimuth into the sampled 90..270 arc.
 *
 * PVWatts is only sampled across the sun-facing half. A north-facing array is
 * approximated by its mirror about the north-south axis (350 -> 10 -> mirrored
 * to 170 is wrong; instead we clamp, see below) — in practice anything outside
 * 90..270 is clamped to the nearest sampled end, because a north-facing ground
 * mount is a configuration we would talk the customer out of, not model finely.
 */
function clampToSampledArc(azimuth: number): number {
  const a = normalizeAzimuth(azimuth);
  if (a < 90) return 90;
  if (a > 270) return 270;
  return a;
}

/**
 * Monotone cubic (Fritsch-Carlson) interpolation across the sampled azimuths.
 * Monotone matters: a plain cubic spline overshoots and would show production
 * *rising* as the user rotates away from south, which is visibly wrong.
 */
export function productionAt(curve: ProductionCurve, azimuth: number): number {
  const xs = [...REFERENCE_AZIMUTHS];
  const ys = xs.map((x) => curve[x]);
  const x = clampToSampledArc(azimuth);

  const i = Math.min(
    xs.length - 2,
    Math.max(0, xs.findIndex((xi, idx) => idx > 0 && xi >= x) - 1)
  );
  const h = xs[i + 1] - xs[i];
  if (h === 0) return ys[i];

  // Secant slopes.
  const deltas = xs.slice(0, -1).map((_, k) => (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));

  // Fritsch-Carlson tangents.
  const m = xs.map((_, k) => {
    if (k === 0) return deltas[0];
    if (k === xs.length - 1) return deltas[deltas.length - 1];
    if (deltas[k - 1] * deltas[k] <= 0) return 0; // local extremum: flatten
    return (deltas[k - 1] + deltas[k]) / 2;
  });

  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * m[i + 1]
  );
}

/** Production at `azimuth` as a fraction of due-south production. */
export function fractionOfSouth(curve: ProductionCurve, azimuth: number): number {
  const south = curve[180];
  if (!south) return 1;
  return productionAt(curve, azimuth) / south;
}

/** Whole-percent "vs south" figure for the rotation HUD. */
export function percentOfSouth(curve: ProductionCurve, azimuth: number): number {
  return Math.round(fractionOfSouth(curve, azimuth) * 100);
}

/** Estimated annual kWh for a system of `kw` at `azimuth`. */
export function annualKwh(curve: ProductionCurve, kw: number, azimuth: number): number {
  return Math.round(kw * productionAt(curve, azimuth));
}

/**
 * System kW needed to hit an annual kWh target at a given azimuth. This is the
 * arithmetic that replaces a PVWatts round trip when panel count changes.
 */
export function kwForTarget(
  curve: ProductionCurve,
  targetAnnualKwh: number,
  azimuth: number
): number {
  const perKw = productionAt(curve, azimuth);
  if (perKw <= 0) return 0;
  return targetAnnualKwh / perKw;
}
