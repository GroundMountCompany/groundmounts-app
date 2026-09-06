import { describe, it, expect } from 'vitest';
import { rotationShortfall } from './shortfall';
import { panelsForTarget, targetAnnualKwh } from './sizing';
import { annualKwh, TX_FALLBACK_CURVE } from './production';
import { DEFAULTS, PANELS } from '@/config/pricing';

/**
 * What a turn costs, stated rather than hidden.
 *
 * The array is sized at due south and rotation never changes the count. That is
 * deliberate, but it leaves a customer who turned their array to 90 degrees
 * quietly short of the offset they asked for. These cover the arithmetic that
 * puts the number in front of them.
 */

const CURVE = TX_FALLBACK_CURVE;
const TIER = 'standard' as const;

/** A system sized to cover `target` at due south, as the funnel does it. */
function sizedAtSouth(target: number) {
  return panelsForTarget(CURVE, target, 180, TIER);
}

describe('rotation shortfall', () => {
  const target = targetAnnualKwh({
    billAnnualKwh: null,
    monthlyBillUsd: 240,
    ratePerKwh: DEFAULTS.ratePerKwh,
    offsetPercent: 100,
  });
  const totalPanels = sizedAtSouth(target);

  it('says nothing at due south, where the array was sized', () => {
    expect(
      rotationShortfall({ curve: CURVE, targetAnnualKwh: target, azimuth: 180, tier: TIER, totalPanels })
    ).toBeNull();
  });

  it('asks for panels once the array is turned east', () => {
    const result = rotationShortfall({
      curve: CURVE,
      targetAnnualKwh: target,
      azimuth: 90,
      tier: TIER,
      totalPanels,
    });

    expect(result, 'a quarter turn cost nothing at all').not.toBeNull();
    expect(result!.addPanels).toBeGreaterThan(0);
    expect(result!.offSouthPct).toBeGreaterThan(0);
  });

  it('offers exactly the number that puts the target back in reach', () => {
    const result = rotationShortfall({
      curve: CURVE,
      targetAnnualKwh: target,
      azimuth: 90,
      tier: TIER,
      totalPanels,
    })!;

    // This is the promise the button makes: tap it, and you are covered again.
    const after = totalPanels + result.addPanels;
    const kw = (after * PANELS[TIER].watts) / 1000;
    expect(annualKwh(CURVE, kw, 90)).toBeGreaterThanOrEqual(target);

    // And not one panel more than that.
    const oneFewer = ((after - 1) * PANELS[TIER].watts) / 1000;
    expect(annualKwh(CURVE, oneFewer, 90)).toBeLessThan(target);
  });

  it('goes quiet once the panels have been added', () => {
    const result = rotationShortfall({
      curve: CURVE,
      targetAnnualKwh: target,
      azimuth: 90,
      tier: TIER,
      totalPanels,
    })!;

    expect(
      rotationShortfall({
        curve: CURVE,
        targetAnnualKwh: target,
        azimuth: 90,
        tier: TIER,
        totalPanels: totalPanels + result.addPanels,
      })
    ).toBeNull();
  });

  it('says nothing when the array already exceeds the target', () => {
    // Somebody who used the + control past what sizing chose is not short.
    expect(
      rotationShortfall({
        curve: CURVE,
        targetAnnualKwh: target,
        azimuth: 135,
        tier: TIER,
        totalPanels: totalPanels * 2,
      })
    ).toBeNull();
  });

  it('says nothing when there is no target or no array', () => {
    const base = { curve: CURVE, azimuth: 90, tier: TIER };
    expect(rotationShortfall({ ...base, targetAnnualKwh: 0, totalPanels })).toBeNull();
    expect(rotationShortfall({ ...base, targetAnnualKwh: target, totalPanels: 0 })).toBeNull();
  });

  it('costs more the further from south the array is turned', () => {
    const at = (azimuth: number) =>
      rotationShortfall({ curve: CURVE, targetAnnualKwh: target, azimuth, tier: TIER, totalPanels })
        ?.addPanels ?? 0;

    expect(at(90)).toBeGreaterThanOrEqual(at(135));
    expect(at(135)).toBeGreaterThanOrEqual(at(180));
  });
});
