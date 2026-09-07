import { DEFAULTS } from '@/config/pricing';

/** Whole cents from the bill -> dollars per kWh, with the configured fallback. */
export function dollarsPerKwhFromCents(cents: number): number {
  return Number.isFinite(cents) && cents > 0 ? cents / 100 : DEFAULTS.ratePerKwh;
}
