'use client';

import { useEffect, useRef, useState } from 'react';
import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { subscribeHandleScreen, type ScreenPoint } from './MapCanvas';
import { easeAzimuthTo, isFacingSouth, SOUTH } from '@/lib/easeAzimuth';
import { applyAutoSize } from '@/lib/applyAutoSize';

/** Half the button, so it can be centred on a point. */
const HALF = 24;

/** How far from the grip the button sits, and how far it stays off the edges. */
const GAP_PX = 30;
const MARGIN_PX = 8;

/**
 * Put the array back to south, from beside the grip that turned it away.
 *
 * South makes the most power in Texas, and a customer who has been turning the
 * array to see what happens needs a way back that is not "guess where 180 was".
 * It sits next to the compass grip because that is where their thumb already
 * is, and it is only on screen when there is something to undo.
 */
export default function FaceSouth() {
  const azimuth = useQuoteStore((s) => s.azimuth);
  const setAzimuth = useQuoteStore((s) => s.setAzimuth);
  const [grip, setGrip] = useState<ScreenPoint | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => subscribeHandleScreen(setGrip), []);
  useEffect(() => () => cancelRef.current?.(), []);

  if (!grip || isFacingSouth(azimuth)) return null;

  // Beside the grip, then clamped so it cannot end up half off the screen when
  // the array is dragged to an edge.
  const left = Math.min(
    Math.max(grip.x + GAP_PX, MARGIN_PX + HALF),
    window.innerWidth - MARGIN_PX - HALF
  );
  const top = Math.min(
    Math.max(grip.y, MARGIN_PX + HALF),
    window.innerHeight - MARGIN_PX - HALF
  );

  return (
    <button
      type="button"
      data-testid="face-south"
      aria-label={UI.faceSouth}
      title={UI.faceSouth}
      onClick={() => {
        cancelRef.current?.();
        cancelRef.current = easeAzimuthTo(azimuth, SOUTH, (next) => {
          setAzimuth(next);
          // The end of the ease is the end of the turn, and settles the count
          // exactly as letting go of the grip does.
          if (next === SOUTH) applyAutoSize();
        });
      }}
      className="pointer-events-auto fixed z-30 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[13px] font-semibold text-neutral-900 shadow-md"
      style={{ left, top }}
    >
      {/* An S, because the button is 48px and the phrase would not fit in it.
          The accessible name is the whole phrase. */}
      <span aria-hidden>{UI.faceSouthShort}</span>
    </button>
  );
}
