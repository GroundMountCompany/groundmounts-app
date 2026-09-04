import { describe, it, expect } from 'vitest';
import {
  panelsForTarget,
  annualTargetKwh,
  resizeForTier,
  applyAdjust,
  sizedCountForTier,
} from './sizing';
import { TX_FALLBACK_CURVE, kwForTarget } from './production';
import { PANELS, DEFAULTS } from '@/config/pricing';

describe('annual target from a bill', () => {
  it('works back from the dollar amount at the given rate', () => {
    // $240 a month at 19c is about 1,263 kWh a month. Deliberately not the
    // configured default, so a function ignoring its argument fails here.
    expect(annualTargetKwh(240, 0.19, 100)).toBeCloseTo((240 / 0.19) * 12, 4);
  });

  it('scales with the offset', () => {
    const full = annualTargetKwh(240, 0.19, 100);
    expect(annualTargetKwh(240, 0.19, 50)).toBeCloseTo(full / 2, 4);
  });

  it('falls back to the configured rate when none is given', () => {
    expect(annualTargetKwh(240, 0, 100)).toBeCloseTo(
      annualTargetKwh(240, DEFAULTS.ratePerKwh, 100),
      4
    );
  });

  it('returns zero for no bill rather than dividing into nonsense', () => {
    expect(annualTargetKwh(0, 0.19, 100)).toBe(0);
    expect(annualTargetKwh(-5, 0.19, 100)).toBe(0);
  });
});

describe('panel count from a target', () => {
  const target = annualTargetKwh(240, 0.19, 100);

  it('sizes against the PVWatts reference for the chosen azimuth', () => {
    const south = panelsForTarget(TX_FALLBACK_CURVE, target, 180, 'standard');
    const west = panelsForTarget(TX_FALLBACK_CURVE, target, 270, 'standard');
    // West makes less per kW, so it takes more panels to hit the same target.
    expect(west).toBeGreaterThan(south);
  });

  it('rounds up: a partial panel is not a thing', () => {
    const count = panelsForTarget(TX_FALLBACK_CURVE, target, 180, 'standard');
    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThan(0);
  });

  it('returns zero for no target, and never a negative count', () => {
    expect(panelsForTarget(TX_FALLBACK_CURVE, 0, 180, 'standard')).toBe(0);
    expect(panelsForTarget(TX_FALLBACK_CURVE, -100, 180, 'standard')).toBe(0);
  });

  it('gives at least one panel for a tiny but real target', () => {
    expect(panelsForTarget(TX_FALLBACK_CURVE, 1, 180, 'standard')).toBe(1);
  });
});

describe('changing tier re-sizes for the same target', () => {
  const target = annualTargetKwh(240, 0.19, 100);

  it('needs fewer premium panels than standard', () => {
    const standard = resizeForTier(TX_FALLBACK_CURVE, target, 180, 'standard');
    const premium = resizeForTier(TX_FALLBACK_CURVE, target, 180, 'premium');
    expect(PANELS.premium.watts).toBeGreaterThan(PANELS.standard.watts);
    expect(premium).toBeLessThanOrEqual(standard);
  });

  it('lands within a panel of the same system size either way', () => {
    const standard = resizeForTier(TX_FALLBACK_CURVE, target, 180, 'standard');
    const premium = resizeForTier(TX_FALLBACK_CURVE, target, 180, 'premium');
    const kw = (n: number, t: 'standard' | 'premium') => (n * PANELS[t].watts) / 1000;
    expect(Math.abs(kw(standard, 'standard') - kw(premium, 'premium'))).toBeLessThan(
      PANELS.premium.watts / 1000
    );
  });
});

describe('the count a tier would be built with', () => {
  const target = annualTargetKwh(240, 0.19, 100);

  it('carries the customer adjustment onto the resized count', () => {
    const sized = resizeForTier(TX_FALLBACK_CURVE, target, 180, 'premium');
    expect(sizedCountForTier(TX_FALLBACK_CURVE, target, 180, 'premium', -2)).toBe(sized - 2);
    expect(sizedCountForTier(TX_FALLBACK_CURVE, target, 180, 'premium', 0)).toBe(sized);
  });

  it('needs fewer premium panels than standard for the same bill', () => {
    const standard = sizedCountForTier(TX_FALLBACK_CURVE, target, 180, 'standard', 0);
    const premium = sizedCountForTier(TX_FALLBACK_CURVE, target, 180, 'premium', 0);
    expect(premium).toBeLessThan(standard);
    // Both still cover the bill: each is the first whole number of its own
    // panels that reaches the required kW.
    const requiredKw = kwForTarget(TX_FALLBACK_CURVE, target, 180);
    for (const [count, watts] of [
      [standard, PANELS.standard.watts],
      [premium, PANELS.premium.watts],
    ] as const) {
      expect((count * watts) / 1000).toBeGreaterThanOrEqual(requiredKw);
      expect(((count - 1) * watts) / 1000).toBeLessThan(requiredKw);
    }
  });

  it('is the same arithmetic the sizing effect applies', () => {
    // The design step shows applyAdjust(sizedPanels, panelAdjust); an option
    // card pricing a tier must land on exactly that, or its delta is fiction.
    const sized = panelsForTarget(TX_FALLBACK_CURVE, target, 180, 'premium');
    expect(sizedCountForTier(TX_FALLBACK_CURVE, target, 180, 'premium', 3)).toBe(
      applyAdjust(sized, 3)
    );
  });

  it('never returns zero panels for a real bill', () => {
    expect(sizedCountForTier(TX_FALLBACK_CURVE, target, 180, 'standard', -999)).toBe(1);
    expect(sizedCountForTier(TX_FALLBACK_CURVE, 0, 180, 'standard', 0)).toBe(0);
  });
});
