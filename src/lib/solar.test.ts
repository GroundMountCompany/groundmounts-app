import { describe, it, expect } from 'vitest';
import {
  PANEL_WATTS,
  TRENCHING_COST_PER_FT,
  estimateMonthlyKWh,
  kWFromMonthlyKWh,
  panelsFromkW,
} from './solar';

/**
 * Baseline lock on the v1 sizing math so Phase 3 can prove exactly what the move
 * to pricing.ts + PVWatts changes. These assert current behaviour, not desired
 * behaviour — several of these numbers are expected to move.
 */
describe('v1 sizing baseline', () => {
  it('derives monthly kWh from a bill at the Texas default rate', () => {
    expect(estimateMonthlyKWh(140)).toBeCloseTo(1000, 5);
  });

  it('returns zero for a missing bill rather than NaN', () => {
    expect(estimateMonthlyKWh(0)).toBe(0);
  });

  it('guards against a zero or negative rate', () => {
    expect(estimateMonthlyKWh(140, 0)).toBe(0);
    expect(estimateMonthlyKWh(140, -1)).toBe(0);
  });

  it('converts monthly kWh to DC kW', () => {
    expect(kWFromMonthlyKWh(1000)).toBeCloseTo(1000 / (30 * 24 * 0.18), 6);
  });

  it('rounds panel count up and never returns zero for a real system', () => {
    expect(panelsFromkW(10)).toBe(Math.ceil(10000 / PANEL_WATTS));
    expect(panelsFromkW(0.001)).toBe(1);
  });

  it('returns zero panels only when there is no system at all', () => {
    expect(panelsFromkW(0)).toBe(0);
  });

  it('pins the trench rate that the store now single-sources', () => {
    expect(TRENCHING_COST_PER_FT).toBe(45);
  });
});
