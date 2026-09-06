'use client';

import { useEffect, useState } from 'react';
import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { compassPoint, isBackToSouth, type CompassPoint } from '@/lib/autoSize';

/** How long the toast stays up. Long enough to read a sentence, then gone. */
const TOAST_MS = 4000;

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
      className="pointer-events-none absolute inset-x-3 bottom-3 z-30 mx-auto max-w-[420px] rounded-xl bg-neutral-900/95 px-4 py-3 text-[15px] leading-snug text-white shadow-lg"
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
