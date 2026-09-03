import { describe, it, expect } from 'vitest';
import {
  REFERENCE_AZIMUTHS,
  TX_FALLBACK_CURVE,
  productionAt,
  percentOfSouth,
  annualKwh,
  kwForTarget,
} from './production';

describe('azimuth interpolation', () => {
  it('reproduces every PVWatts reference sample exactly', () => {
    // If the curve does not pass through its own samples, the "% vs south"
    // readout disagrees with the number PVWatts actually returned.
    for (const az of REFERENCE_AZIMUTHS) {
      expect(productionAt(TX_FALLBACK_CURVE, az)).toBeCloseTo(TX_FALLBACK_CURVE[az], 6);
    }
  });

  it('stays within the surrounding samples between them (no overshoot)', () => {
    // A non-monotone spline would bulge above 1500 near south and show
    // production rising as the user rotates away from it.
    for (let az = 90; az <= 270; az += 1) {
      const v = productionAt(TX_FALLBACK_CURVE, az);
      expect(v).toBeGreaterThanOrEqual(1245 - 1e-6);
      expect(v).toBeLessThanOrEqual(1500 + 1e-6);
    }
  });

  it('rises monotonically toward south and falls away from it', () => {
    for (let az = 90; az < 180; az += 5) {
      expect(productionAt(TX_FALLBACK_CURVE, az + 5)).toBeGreaterThanOrEqual(
        productionAt(TX_FALLBACK_CURVE, az) - 1e-9
      );
    }
    for (let az = 180; az < 270; az += 5) {
      expect(productionAt(TX_FALLBACK_CURVE, az + 5)).toBeLessThanOrEqual(
        productionAt(TX_FALLBACK_CURVE, az) + 1e-9
      );
    }
  });

  it('peaks at due south', () => {
    const south = productionAt(TX_FALLBACK_CURVE, 180);
    for (let az = 90; az <= 270; az += 5) {
      expect(productionAt(TX_FALLBACK_CURVE, az)).toBeLessThanOrEqual(south + 1e-9);
    }
  });

  it('clamps azimuths outside the sampled arc instead of extrapolating', () => {
    expect(productionAt(TX_FALLBACK_CURVE, 0)).toBe(TX_FALLBACK_CURVE[90]);
    expect(productionAt(TX_FALLBACK_CURVE, 359)).toBe(TX_FALLBACK_CURVE[270]);
    expect(productionAt(TX_FALLBACK_CURVE, 360 + 180)).toBeCloseTo(TX_FALLBACK_CURVE[180], 6);
  });
});

describe('percentOfSouth', () => {
  it('is 100% at due south', () => {
    expect(percentOfSouth(TX_FALLBACK_CURVE, 180)).toBe(100);
  });

  it('reports a real, visible loss due east and west', () => {
    expect(percentOfSouth(TX_FALLBACK_CURVE, 90)).toBe(84);
    expect(percentOfSouth(TX_FALLBACK_CURVE, 270)).toBe(83);
  });

  it('barely moves for a small nudge off south, which is the honest answer', () => {
    expect(percentOfSouth(TX_FALLBACK_CURVE, 190)).toBeGreaterThanOrEqual(99);
  });
});

describe('sizing arithmetic', () => {
  it('converts kW to annual kWh at an azimuth', () => {
    expect(annualKwh(TX_FALLBACK_CURVE, 10, 180)).toBe(15_000);
  });

  it('inverts cleanly: kwForTarget round-trips through annualKwh', () => {
    const kw = kwForTarget(TX_FALLBACK_CURVE, 18_000, 135);
    expect(annualKwh(TX_FALLBACK_CURVE, kw, 135)).toBe(18_000);
  });

  it('needs more kW off-south for the same target', () => {
    const south = kwForTarget(TX_FALLBACK_CURVE, 18_000, 180);
    const west = kwForTarget(TX_FALLBACK_CURVE, 18_000, 270);
    expect(west).toBeGreaterThan(south);
  });

  it('returns zero rather than dividing by zero on a dead curve', () => {
    const dead = { 90: 0, 135: 0, 180: 0, 225: 0, 270: 0 };
    expect(kwForTarget(dead, 18_000, 180)).toBe(0);
  });
});
