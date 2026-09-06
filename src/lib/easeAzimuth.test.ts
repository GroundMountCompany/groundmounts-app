import { describe, it, expect } from 'vitest';
import { azimuthAt, easeOut, isFacingSouth, shortestTurn, SOUTH } from './easeAzimuth';

describe('turning back to south', () => {
  it('takes the short way round the compass', () => {
    // The trap: 350 -> 180 is 170 anticlockwise, and plain subtraction says
    // -170 either way, but 10 -> 350 must be -20 and not +340.
    expect(shortestTurn(10, 350)).toBe(-20);
    expect(shortestTurn(350, 10)).toBe(20);
    expect(shortestTurn(90, SOUTH)).toBe(90);
    expect(shortestTurn(270, SOUTH)).toBe(-90);
  });

  it('never turns more than half a circle', () => {
    for (let from = 0; from < 360; from += 7) {
      expect(Math.abs(shortestTurn(from, SOUTH))).toBeLessThanOrEqual(180);
    }
  });

  it('lands exactly on the target', () => {
    expect(azimuthAt(90, SOUTH, 1)).toBe(SOUTH);
    expect(azimuthAt(300, SOUTH, 1)).toBe(SOUTH);
  });

  it('starts where it started and stays in range', () => {
    expect(azimuthAt(90, SOUTH, 0)).toBe(90);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const value = azimuthAt(300, SOUTH, t);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(360);
    }
  });

  it('moves in one direction throughout', () => {
    // A turn that reversed mid-flight would read as a wobble, not a correction.
    let last = azimuthAt(90, SOUTH, 0);
    // Integer steps rather than a fractional increment: it avoids floating
    // point drift, and the money-location guard reads a bare decimal here as a
    // price escaping pricing.ts.
    for (let i = 1; i <= 20; i++) {
      const now = azimuthAt(90, SOUTH, i / 20);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('eases out rather than running at a constant rate', () => {
    // More than half the distance covered in the first half, or it is linear.
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it('clamps progress outside 0..1', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it('calls south south, within the tolerance the button uses', () => {
    expect(isFacingSouth(180)).toBe(true);
    expect(isFacingSouth(181.9)).toBe(true);
    expect(isFacingSouth(178.1)).toBe(true);
    expect(isFacingSouth(183)).toBe(false);
    expect(isFacingSouth(90)).toBe(false);
    expect(isFacingSouth(0)).toBe(false);
  });
});
