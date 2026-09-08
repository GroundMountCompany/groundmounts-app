'use client';

import { useEffect, useRef, useState } from 'react';
import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef } from '@/store/mapRefs';
import { LAYER } from './layers';
import { coachSeen, markCoachSeen } from '@/lib/coach';
import { track } from '@/lib/analytics';

/** How long the overlay holds if nobody touches anything. */
export const COACH_MS = 3000;

/** The pulse's two ends, either side of the layer's own 0.35. */
const PULSE_LOW = 0.22;
const PULSE_HIGH = 0.5;
/** One full breath. Slow enough to read as deliberate rather than as a fault. */
const PULSE_PERIOD_MS = 1600;

/**
 * Breathe the array until somebody grabs it.
 *
 * A Mapbox paint property is not a DOM style, so there is no CSS transition to
 * hand this to — the opacity is driven a frame at a time. The loop stops on
 * the first touch and puts the layer back exactly where it found it, so this
 * can never leave the array a different colour than the design it represents.
 */
function useArrayPulse(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const map = mapRef.current;
    if (!map) return;

    let raf = 0;
    let stopped = false;
    const started = performance.now();

    const restore = () => {
      try {
        if (map.getLayer(LAYER.hullFill)) map.setPaintProperty(LAYER.hullFill, 'fill-opacity', 0.35);
      } catch {
        /* The map went away mid-frame. Nothing to put back. */
      }
    };

    const tick = (now: number) => {
      if (stopped) return;
      try {
        if (!map.getLayer(LAYER.hullFill)) {
          // The design layers are added asynchronously; wait rather than give up.
          raf = requestAnimationFrame(tick);
          return;
        }
        const phase = ((now - started) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
        // A sine, not a sawtooth: a linear ramp snapping back at the top reads
        // as a glitch, which is the opposite of an invitation.
        const eased = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
        map.setPaintProperty(
          LAYER.hullFill,
          'fill-opacity',
          PULSE_LOW + (PULSE_HIGH - PULSE_LOW) * eased
        );
      } catch {
        stopped = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      restore();
    };
  }, [active]);
}

/**
 * A hand that drags, then turns.
 *
 * Pure SVG and CSS keyframes — no Lottie, no GIF, no third-party runtime for
 * three seconds of animation. The two halves are one timeline: the hand slides
 * right while the panel outline follows it, then both settle and the compass
 * ring sweeps. `prefers-reduced-motion` freezes the lot and leaves the picture,
 * which still says what the words say.
 */
function CoachAnimation() {
  return (
    <svg
      viewBox="0 0 200 120"
      className="h-[120px] w-[200px]"
      role="img"
      aria-label={UI.coachAnimationAlt}
    >
      {/* The array, sliding under the hand. */}
      <g className="gm-coach-array">
        <rect
          x="46"
          y="44"
          width="52"
          height="34"
          rx="3"
          fill="#1d4ed8"
          fillOpacity="0.35"
          stroke="#bfdbfe"
          strokeWidth="1.5"
        />
        <path d="M46 55h52M46 66h52M63 44v34M81 44v34" stroke="#e5edff" strokeWidth="1" />
      </g>

      {/* The compass ring, sweeping after the drag. */}
      <g className="gm-coach-compass" transform="translate(150 61)">
        <circle r="17" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.85" />
        <path d="M0 -17 L5 -7 L-5 -7 Z" fill="#ffffff" />
      </g>

      {/* The hand. Travels with the array, then moves to the ring. */}
      <g className="gm-coach-hand">
        <path
          d="M0 0c0-5 3-8 6-8s6 3 6 8v9l4-3c3-2 6 0 6 3 0 2-1 4-3 6l-8 8c-3 3-6 4-9 4h-2c-6 0-10-4-10-10V0z"
          fill="#ffffff"
          stroke="#111827"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * Three seconds showing what this screen wants.
 *
 * The design step is the only screen in the funnel where nothing happens until
 * the customer does something to an object they have never seen before. Owner
 * QA on first-timers: people looked at the array, did not know it moved, and
 * pressed Continue. Words alone had not fixed it — so this shows the gesture.
 *
 * It goes away on the first touch anywhere, because somebody already reaching
 * for the map does not need a demonstration, and after three seconds
 * regardless. It is never a gate: the overlay does not take the pointer, so a
 * customer who ignores it and grabs the array immediately gets the array.
 */
export default function DesignCoach() {
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const arrayTouched = useQuoteStore((s) => s.arrayTouched);

  // `null` while we have not read localStorage yet — server and first client
  // render must agree, and reading storage during render would not.
  const [show, setShow] = useState<boolean | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    setShow(!coachSeen());
  }, []);

  const dismiss = useRef<(reason: string) => void>(() => {});
  dismiss.current = (reason: string) => {
    if (dismissed.current) return;
    dismissed.current = true;
    markCoachSeen();
    setShow(false);
    track('coach_dismissed', { reason });
  };

  useEffect(() => {
    if (show !== true) return;

    const timer = window.setTimeout(() => dismiss.current('timeout'), COACH_MS);
    const onTouch = () => dismiss.current('touch');

    // Capture phase on the window: the first touch anywhere counts, including
    // one that lands on the map and is immediately claimed by a drag handler.
    window.addEventListener('pointerdown', onTouch, { capture: true, once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onTouch, { capture: true });
    };
  }, [show]);

  // The pulse outlives the overlay: it runs until the array is actually
  // grabbed, which is usually well after three seconds.
  useArrayPulse(!arrayTouched && totalPanels > 0);

  if (show !== true || totalPanels <= 0) return null;

  return (
    <div
      data-testid="design-coach"
      // Pointer-transparent, all of it. This teaches; it never blocks.
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-neutral-900/75 px-5 py-4 text-center">
        <CoachAnimation />
        <p data-testid="design-coach-copy" className="text-[17px] font-semibold text-white">
          {UI.coachDesign}
        </p>
      </div>
    </div>
  );
}
