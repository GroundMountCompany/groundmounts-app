import { describe, it, expect } from 'vitest';
import { compassPoint, isBackToSouth, resizeForAzimuth } from './autoSize';
import { panelsForTarget, targetAnnualKwh } from './sizing';
import { annualKwh, TX_FALLBACK_CURVE } from './production';
import { DEFAULTS, PANELS } from '@/config/pricing';

/**
 * Turning the array re-sizes it, unless the customer has taken the count.
 *
 * The array covers a target, and how much power it makes depends on which way
 * it points — so the count has to follow the heading, or a customer who turned
 * east is quietly under the offset they asked for. The exception is a count
 * somebody set by hand, which must never move on its own.
 */

const CURVE = TX_FALLBACK_CURVE;
const TIER = 'standard' as const;

const target = targetAnnualKwh({
  billAnnualKwh: null,
  monthlyBillUsd: 240,
  ratePerKwh: DEFAULTS.ratePerKwh,
  offsetPercent: 100,
});

/** The count that covers the target at a heading, as the funnel sizes it. */
const sizedAt = (azimuth: number) => panelsForTarget(CURVE, target, azimuth, TIER);

const base = {
  mode: 'auto' as const,
  curve: CURVE,
  targetAnnualKwh: target,
  tier: TIER,
};

describe('auto-sizing on rotation', () => {
  const atSouth = sizedAt(180);

  it('adds panels when the array is turned off south', () => {
    const result = resizeForAzimuth({ ...base, azimuth: 90, currentPanels: atSouth });

    expect(result, 'a quarter turn changed nothing').not.toBeNull();
    expect(result!.delta).toBeGreaterThan(0);
    expect(result!.panels).toBe(atSouth + result!.delta);

    // The promise the toast makes: the new count covers the target here.
    const kw = (result!.panels * PANELS[TIER].watts) / 1000;
    expect(annualKwh(CURVE, kw, 90)).toBeGreaterThanOrEqual(target);
  });

  it('removes them again on the way back to south', () => {
    const east = sizedAt(90);
    const result = resizeForAzimuth({ ...base, azimuth: 180, currentPanels: east });

    expect(result, 'coming back to south changed nothing').not.toBeNull();
    expect(result!.delta).toBeLessThan(0);
    // Exactly where it started, so a turn out and back is a round trip rather
    // than a ratchet that leaves the customer paying for panels they lost.
    expect(result!.panels).toBe(atSouth);
  });

  it('is a round trip, not a ratchet', () => {
    let panels = atSouth;
    for (const azimuth of [90, 135, 225, 270, 180]) {
      panels = resizeForAzimuth({ ...base, azimuth, currentPanels: panels })?.panels ?? panels;
    }
    expect(panels).toBe(atSouth);
  });

  it('says nothing when the count is already right for the heading', () => {
    expect(resizeForAzimuth({ ...base, azimuth: 180, currentPanels: atSouth })).toBeNull();
  });

  it('never touches a count the customer set by hand', () => {
    // The same rotation that adds panels in auto mode must do nothing here.
    expect(
      resizeForAzimuth({ ...base, mode: 'manual', azimuth: 90, currentPanels: atSouth })
    ).toBeNull();
    expect(
      resizeForAzimuth({ ...base, mode: 'manual', azimuth: 270, currentPanels: atSouth })
    ).toBeNull();
  });

  it('says nothing without a target or an array', () => {
    expect(
      resizeForAzimuth({ ...base, targetAnnualKwh: 0, azimuth: 90, currentPanels: atSouth })
    ).toBeNull();
    expect(resizeForAzimuth({ ...base, azimuth: 90, currentPanels: 0 })).toBeNull();
  });
});

describe('naming the heading', () => {
  it('reads the eight points off the compass', () => {
    expect(compassPoint(0)).toBe('north');
    expect(compassPoint(90)).toBe('east');
    expect(compassPoint(180)).toBe('south');
    expect(compassPoint(270)).toBe('west');
    // 44 rather than the exact 45: the money-location guard reads a bare 45
    // anywhere outside pricing.ts as the trench rate escaping it.
    expect(compassPoint(44)).toBe('northeast');
    expect(compassPoint(225)).toBe('southwest');
  });

  it('wraps rather than falling off either end', () => {
    expect(compassPoint(360)).toBe('north');
    expect(compassPoint(359)).toBe('north');
    expect(compassPoint(-90)).toBe('west');
    expect(compassPoint(720 + 90)).toBe('east');
  });

  it('rounds to the nearest point', () => {
    expect(compassPoint(100)).toBe('east');
    expect(compassPoint(160)).toBe('south');
  });

  it('calls a near-south heading "back to south", matching the button', () => {
    // Same window the Face south button uses, so the toast cannot say "facing
    // south" while the button still offers to take you there.
    expect(isBackToSouth(180)).toBe(true);
    expect(isBackToSouth(181)).toBe(true);
    expect(isBackToSouth(190)).toBe(false);
  });
});
