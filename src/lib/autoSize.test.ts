import { describe, it, expect } from 'vitest';
import { compassPoint, isBackToSouth, panelsOverSouth, resizeForAzimuth } from './autoSize';
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
  /**
   * Every sector, spelled out.
   *
   * Each point owns an eighth of the compass centred on itself, so east runs
   * 67.5 to 112.5 and southeast 112.5 to 157.5. The owner expected a diagonal
   * and read
   * "east", so these pin the boundaries explicitly rather than trusting the
   * rounding to keep meaning what it means.
   */
  const SECTORS = [
    { point: 'north', azimuth: 0, from: 337.5, to: 22.5 },
    { point: 'northeast', azimuth: 45, from: 22.5, to: 67.5 },
    { point: 'east', azimuth: 90, from: 67.5, to: 112.5 },
    { point: 'southeast', azimuth: 135, from: 112.5, to: 157.5 },
    { point: 'south', azimuth: 180, from: 157.5, to: 202.5 },
    { point: 'southwest', azimuth: 225, from: 202.5, to: 247.5 },
    { point: 'west', azimuth: 270, from: 247.5, to: 292.5 },
    { point: 'northwest', azimuth: 315, from: 292.5, to: 337.5 },
  ] as const;

  it('names the centre of every sector after its own point', () => {
    for (const { point, azimuth } of SECTORS) {
      expect(compassPoint(azimuth), `${azimuth} degrees`).toBe(point);
    }
  });

  it('holds each sector from just inside one edge to just inside the other', () => {
    for (const { point, from, to } of SECTORS) {
      // A tenth of a degree inside each boundary. Wrapped for north, whose
      // sector straddles 0.
      const lower = (from + 0.1) % 360;
      const upper = (to - 0.1 + 360) % 360;
      expect(compassPoint(lower), `${lower} should still be ${point}`).toBe(point);
      expect(compassPoint(upper), `${upper} should still be ${point}`).toBe(point);
    }
  });

  it('names the exact half-degree boundary itself', () => {
    // Codex, 8.11: the sectors were only checked a tenth of a degree either
    // side, so the boundary value itself was never asserted. It belongs to the
    // sector it opens — 112.5 is southeast, not east.
    for (const { point, from } of SECTORS) {
      expect(compassPoint(from), `${from} opens the ${point} sector`).toBe(point);
    }

    // Spelled out once more in full, so a reader can check the rule without
    // reconstructing the table.
    expect(compassPoint(22.5)).toBe('northeast');
    expect(compassPoint(67.5)).toBe('east');
    expect(compassPoint(112.5)).toBe('southeast');
    expect(compassPoint(157.5)).toBe('south');
    expect(compassPoint(202.5)).toBe('southwest');
    expect(compassPoint(247.5)).toBe('west');
    expect(compassPoint(292.5)).toBe('northwest');
    expect(compassPoint(337.5)).toBe('north');
  });

  it('hands over at each boundary rather than overlapping or leaving a gap', () => {
    for (const { point, from } of SECTORS) {
      const justBelow = (from - 0.1 + 360) % 360;
      const justAbove = (from + 0.1) % 360;
      expect(compassPoint(justAbove), `${justAbove} degrees`).toBe(point);
      expect(
        compassPoint(justBelow),
        `${justBelow} should belong to the sector before ${point}`
      ).not.toBe(point);
    }
  });

  it('names every whole degree, with no heading left unnamed', () => {
    const seen = new Set<string>();
    for (let a = 0; a < 360; a++) {
      const named = compassPoint(a);
      expect(named, `${a} degrees produced nothing`).toBeTruthy();
      seen.add(named);
    }
    // All eight get used, so none of them is unreachable.
    expect(seen.size).toBe(8);
  });

  it('reads 120 degrees as southeast, which is what the shipped code did', () => {
    // Recorded because the owner reported seeing "east" where a diagonal was
    // expected. It was not this: 120 sits inside the southeast sector and
    // always has. A heading in 67.5-112.5 is east by this rule, and correctly
    // so.
    expect(compassPoint(120)).toBe('southeast');
    expect(compassPoint(110)).toBe('east');
    expect(compassPoint(113)).toBe('southeast');
  });

  it('wraps rather than falling off either end', () => {
    expect(compassPoint(360)).toBe('north');
    expect(compassPoint(359)).toBe('north');
    expect(compassPoint(-90)).toBe('west');
    expect(compassPoint(720 + 90)).toBe('east');
  });

  it('calls a near-south heading "back to south", matching the button', () => {
    // Same window the Face south button uses, so the toast cannot say "facing
    // south" while the button still offers to take you there.
    expect(isBackToSouth(180)).toBe(true);
    expect(isBackToSouth(181)).toBe(true);
    expect(isBackToSouth(190)).toBe(false);
  });
});

describe('how far the array is over its south sizing', () => {
  const atSouth = sizedAt(180);

  it('counts the extra panels an easterly array carries', () => {
    const east = sizedAt(90);
    expect(
      panelsOverSouth({ curve: CURVE, targetAnnualKwh: target, tier: TIER, totalPanels: east })
    ).toBe(east - atSouth);
  });

  it('is zero when the array is sized for south', () => {
    expect(
      panelsOverSouth({ curve: CURVE, targetAnnualKwh: target, tier: TIER, totalPanels: atSouth })
    ).toBe(0);
  });

  it('goes negative when the count is below the south sizing', () => {
    expect(
      panelsOverSouth({
        curve: CURVE,
        targetAnnualKwh: target,
        tier: TIER,
        totalPanels: atSouth - 3,
      })
    ).toBe(-3);
  });

  it('says nothing without a target or an array', () => {
    expect(
      panelsOverSouth({ curve: CURVE, targetAnnualKwh: 0, tier: TIER, totalPanels: atSouth })
    ).toBe(0);
    expect(
      panelsOverSouth({ curve: CURVE, targetAnnualKwh: target, tier: TIER, totalPanels: 0 })
    ).toBe(0);
  });
});
