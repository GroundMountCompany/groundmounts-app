import { describe, it, expect } from 'vitest';
import { panelsForTarget, annualTargetKwh, resizeForTier } from './sizing';
import { TX_FALLBACK_CURVE } from './production';
import { PANELS, DEFAULTS } from '@/config/pricing';

describe('annual target from a bill', () => {
  it('works back from the dollar amount at the given rate', () => {
    // $240 a month at $0.14 is about 1,714 kWh a month.
    expect(annualTargetKwh(240, 0.14, 100)).toBeCloseTo((240 / 0.14) * 12, 4);
  });

  it('scales with the offset', () => {
    const full = annualTargetKwh(240, 0.14, 100);
    expect(annualTargetKwh(240, 0.14, 50)).toBeCloseTo(full / 2, 4);
  });

  it('falls back to the configured rate when none is given', () => {
    expect(annualTargetKwh(240, 0, 100)).toBeCloseTo(
      annualTargetKwh(240, DEFAULTS.ratePerKwh, 100),
      4
    );
  });

  it('returns zero for no bill rather than dividing into nonsense', () => {
    expect(annualTargetKwh(0, 0.14, 100)).toBe(0);
    expect(annualTargetKwh(-5, 0.14, 100)).toBe(0);
  });
});

describe('panel count from a target', () => {
  const target = annualTargetKwh(240, 0.14, 100);

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
  const target = annualTargetKwh(240, 0.14, 100);

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
