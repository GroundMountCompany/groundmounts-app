'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * How long the settle loop keeps re-measuring before giving up.
 *
 * Not a guess at how long anything takes — it stops as soon as the answer stops
 * changing. This is only the backstop for a page that never settles.
 */
export const SETTLE_TIMEOUT_MS = 2000;

/**
 * Re-measure every frame until the layout stops moving.
 *
 * Anything positioned against the bottom sheet has the same two problems. The
 * sheet's snap is a 220ms CSS height transition that emits no event. And when
 * the keyboard opens the sheet *moves* without resizing — it is lifted by
 * `bottom: keyboardInset` — so a ResizeObserver on it never fires, and the
 * visualViewport handler runs before React has committed the sheet's new
 * position, measuring the old one.
 *
 * A ladder of timeouts covers the common case and loses under load. This
 * watches for the answer to stop changing instead, which has no duration in it
 * to be wrong about: three identical frames and it stops.
 *
 * `measure` must return a signature of what it measured and write state only
 * when that signature changes — the loop runs every frame, and a fresh object
 * each time would re-render sixty times a second for nothing.
 */
export function useSettledLayout(measure: () => string, active = true): void {
  const rafRef = useRef<number | null>(null);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  const settle = useCallback(() => {
    // Measure now, before waiting on a frame. requestAnimationFrame is
    // throttled hard on a busy or occluded page, and anything that does not
    // render until it has a measurement would simply never appear.
    measureRef.current();
    if (rafRef.current !== null) return;

    const deadline = performance.now() + SETTLE_TIMEOUT_MS;
    let identical = 0;
    let last = '';
    const tick = () => {
      const now = measureRef.current();
      identical = now === last ? identical + 1 : 0;
      last = now;
      if (identical >= 3 || performance.now() > deadline) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!active) return;
    settle();
    const vv = window.visualViewport;

    window.addEventListener('resize', settle);
    window.addEventListener('scroll', settle, true);
    vv?.addEventListener('resize', settle);
    vv?.addEventListener('scroll', settle);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener('resize', settle);
      window.removeEventListener('scroll', settle, true);
      vv?.removeEventListener('resize', settle);
      vv?.removeEventListener('scroll', settle);
    };
  }, [active, settle]);
}

/** The sheet's top edge in viewport pixels, or null when there is no sheet. */
export function sheetTop(): number | null {
  const sheet = document.querySelector<HTMLElement>('[data-testid="bottom-sheet"]');
  if (!sheet) return null;
  return sheet.getBoundingClientRect().top;
}
