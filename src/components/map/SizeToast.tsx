'use client';

import { useCallback, useEffect, useState } from 'react';
import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { compassPoint, isBackToSouth, type CompassPoint } from '@/lib/autoSize';
import { sheetTop, useSettledLayout } from '@/lib/useSettledLayout';

/**
 * How long the toast stays up.
 *
 * Owner QA on a phone: four seconds went past unnoticed while their attention
 * was on the array they had just turned.
 */
const TOAST_MS = 5000;

/** Clearance between the toast and the sheet, and from the screen edges. */
const GAP_PX = 8;
const MARGIN_PX = 8;

const DIRECTION: Record<CompassPoint, string> = {
  north: UI.compassNorth,
  northeast: UI.compassNortheast,
  east: UI.compassEast,
  southeast: UI.compassSoutheast,
  south: UI.compassSouth,
  southwest: UI.compassSouthwest,
  west: UI.compassWest,
  northwest: UI.compassNorthwest,
};

/**
 * Say what the automatic resize just did.
 *
 * The count changing on its own is the right behaviour — the array covers the
 * target at whatever angle it points — but a number that moves with no
 * explanation reads as a bug. So it explains itself: which way the array now
 * faces, how many panels changed, and what that keeps them at.
 */
export default function SizeToast() {
  const notice = useQuoteStore((s) => s.sizeNotice);
  const clear = useQuoteStore((s) => s.setSizeNotice);
  const percentage = useQuoteStore((s) => s.percentage);
  const [shown, setShown] = useState<typeof notice>(null);
  /** Distance from the bottom of the viewport, so it clears the sheet. */
  const [bottom, setBottom] = useState(GAP_PX);

  /*
    Sit on the sheet's top edge, not the map's bottom edge.

    The map column runs the full height of a phone screen with the sheet drawn
    over it, so a toast anchored to the bottom of the map was underneath the
    sheet — which is why the owner never saw it. The sheet's height depends on
    its snap point and on the keyboard, and its snap is an animated transition
    that emits no event, so this is measured rather than assumed.
  */
  const measure = useCallback((): string => {
    const top = sheetTop();
    const next =
      top === null ? GAP_PX : Math.max(GAP_PX, Math.round(window.innerHeight - top) + GAP_PX);
    setBottom((current) => (current === next ? current : next));
    return String(next);
  }, []);

  useSettledLayout(measure, shown !== null);

  useEffect(() => {
    if (!notice) return;
    setShown(notice);
    const timer = window.setTimeout(() => {
      setShown(null);
      clear(null);
    }, TOAST_MS);
    // Keyed on the id, so a second resize with the same delta restarts the
    // clock rather than being swallowed as "no change".
    return () => window.clearTimeout(timer);
  }, [notice, notice?.id, clear]);

  if (!shown) return null;

  const added = shown.delta > 0;
  const count = Math.abs(shown.delta);
  const heading = isBackToSouth(shown.azimuth)
    ? UI.sizeBackToSouth
    : `${UI.sizeFacing} ${DIRECTION[compassPoint(shown.azimuth)]}`;

  return (
    <div
      data-testid="size-toast"
      role="status"
      aria-live="polite"
      // Fixed, not absolute: it is positioned against the sheet, which is
      // itself fixed to the viewport, so sharing that frame of reference is the
      // only way the two stay in step while the sheet animates.
      className="pointer-events-none fixed z-30 rounded-xl bg-neutral-900/95 px-4 py-3 text-[17px] leading-snug text-white shadow-lg"
      style={{ left: MARGIN_PX, right: MARGIN_PX, bottom }}
    >
      <span data-testid="size-toast-text">
        {heading} &mdash; {added ? UI.sizeAdded : UI.sizeRemoved}{' '}
        <span data-testid="size-toast-count">{count}</span>{' '}
        {count === 1 ? UI.sizePanel : UI.sizePanels}
        {added ? ` ${UI.sizeToKeepYouAt} ${percentage}%` : ''}
      </span>
    </div>
  );
}
