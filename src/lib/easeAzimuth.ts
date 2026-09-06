/**
 * Turn the array back to due south without snapping.
 *
 * A jump straight to 180 reads as a glitch — the array is somewhere else the
 * next frame and it is not obvious it moved rather than reset. A short ease is
 * long enough to see and short enough not to wait for.
 */

export const AZIMUTH_EASE_MS = 260;

/** Due south. The angle everything else is measured against. */
export const SOUTH = 180;

/** How far off south an azimuth may sit before the button appears. */
export const SOUTH_TOLERANCE_DEG = 2;

/**
 * Signed shortest turn from one bearing to another, in degrees.
 *
 * Plain subtraction takes the long way round the compass: from 10 degrees to
 * 350 is a 20 degree turn anticlockwise, not 340 clockwise.
 */
export function shortestTurn(from: number, to: number): number {
  return (((to - from) % 360) + 540) % 360 - 180;
}

/** True when the array is close enough to south to call it south. */
export function isFacingSouth(azimuth: number, tolerance = SOUTH_TOLERANCE_DEG): boolean {
  return Math.abs(shortestTurn(azimuth, SOUTH)) <= tolerance;
}

/** Ease-out cubic: quick off the mark, settles rather than stops. */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/** The bearing partway through a turn, at progress `t` in 0..1. */
export function azimuthAt(from: number, to: number, t: number): number {
  const value = from + shortestTurn(from, to) * easeOut(t);
  return ((value % 360) + 360) % 360;
}

/**
 * Run the turn, writing each frame through `onAzimuth`.
 *
 * Returns a cancel function. The last frame writes the exact target rather than
 * whatever the easing produced, so the array ends on 180 and not 179.97 — the
 * button's own visibility rule is a 2 degree window and a near-miss would leave
 * it on screen having apparently done nothing.
 */
export function easeAzimuthTo(
  from: number,
  to: number,
  onAzimuth: (azimuth: number) => void,
  durationMs = AZIMUTH_EASE_MS
): () => void {
  if (typeof requestAnimationFrame === 'undefined') {
    onAzimuth(to);
    return () => {};
  }

  const start = performance.now();
  let frame: number | null = null;

  const tick = (now: number) => {
    const t = (now - start) / durationMs;
    if (t >= 1) {
      frame = null;
      onAzimuth(to);
      return;
    }
    onAzimuth(azimuthAt(from, to, t));
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}
