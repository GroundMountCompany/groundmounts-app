'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UI } from '@/config/copy';

export type Snap = 'peek' | 'half' | 'full';

/** Sheet height at each snap point, as a fraction of the viewport. */
const SNAP_FRACTION: Record<Snap, number> = {
  peek: 0,
  half: 0.5,
  full: 0.88,
};

/**
 * Floor for the peek height. The real height is measured from the content, so
 * the primary button is always on screen: a fixed number silently pushed it
 * below the fold the moment the peek row grew.
 */
const MIN_PEEK_PX = 120;

const ORDER: Snap[] = ['peek', 'half', 'full'];

/** Movement beyond this counts as a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 6;

interface Props {
  snap: Snap;
  onSnapChange: (snap: Snap) => void;
  /** Always visible, at every snap point. */
  peek: React.ReactNode;
  children: React.ReactNode;
}

function heightFor(snap: Snap, viewport: number, peekPx: number): number {
  return snap === 'peek' ? peekPx : Math.round(viewport * SNAP_FRACTION[snap]);
}

/**
 * Bottom sheet with peek / half / full snap points.
 *
 * Dragging is bound to the grab handle only, never the sheet body or the map.
 * That is what keeps the two gestures from being confused: the map owns
 * everything outside the sheet, the sheet's scroll owns its content, and only
 * the handle resizes it. Nothing has to guess what the finger meant.
 */
export default function BottomSheet({ snap, onSnapChange, peek, children }: Props) {
  const [viewport, setViewport] = useState(0);
  const [isPhone, setIsPhone] = useState(false);
  const [peekPx, setPeekPx] = useState(MIN_PEEK_PX);
  const headRef = useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  /** Set when a pointer moved far enough to count as a drag, not a tap. */
  const dragged = useRef(false);

  useEffect(() => {
    // The sheet only exists below md; above it the same component is a panel
    // filling its column, and an inline snap height would fight that.
    const query = window.matchMedia('(max-width: 767px)');
    const measure = () => {
      setViewport(window.innerHeight);
      setIsPhone(query.matches);
    };
    measure();
    window.addEventListener('resize', measure);
    query.addEventListener('change', measure);
    return () => {
      window.removeEventListener('resize', measure);
      query.removeEventListener('change', measure);
    };
  }, []);

  // Measure the handle plus the always-visible peek row. Whatever the copy or
  // the progress row do, the button stays on screen at peek.
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const measure = () => setPeekPx(Math.max(MIN_PEEK_PX, Math.ceil(el.scrollHeight)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const settled = viewport ? heightFor(snap, viewport, peekPx) : peekPx;
  const height = dragPx ?? settled;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStart.current = { y: e.clientY, height: settled };
      dragged.current = false;
      setDragPx(settled);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [settled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStart.current;
      if (!start || !viewport) return;
      // Dragging up grows the sheet, so the delta is inverted.
      const delta = start.y - e.clientY;
      if (Math.abs(delta) > DRAG_THRESHOLD_PX) dragged.current = true;
      const next = start.height + delta;
      setDragPx(Math.max(peekPx, Math.min(next, viewport * SNAP_FRACTION.full)));
    },
    [viewport, peekPx]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStart.current;
      dragStart.current = null;
      if (!start || !viewport) {
        setDragPx(null);
        return;
      }

      // Snap from the release coordinate, not from the last rendered height:
      // the two can differ by a frame, which was enough to land on the wrong
      // snap point on a fast flick.
      const released = Math.max(
        peekPx,
        Math.min(start.height + (start.y - e.clientY), viewport * SNAP_FRACTION.full)
      );
      const nearest = ORDER.reduce((best, candidate) =>
        Math.abs(heightFor(candidate, viewport, peekPx) - released) <
        Math.abs(heightFor(best, viewport, peekPx) - released)
          ? candidate
          : best
      );
      setDragPx(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (nearest !== snap) onSnapChange(nearest);
    },
    [viewport, peekPx, snap, onSnapChange]
  );

  /**
   * Tap cycles the sheet open. Suppressed after a drag: the click that follows
   * a pointer sequence used to fire straight after the snap and undo it, so a
   * drag to half immediately became full.
   */
  const onClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onSnapChange(snap === 'full' ? 'peek' : snap === 'half' ? 'full' : 'half');
  };

  return (
    <section
      data-testid="bottom-sheet"
      data-snap={snap}
      aria-label={UI.sheetLabel}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-neutral-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:static md:h-full md:rounded-none md:border-0 md:shadow-none"
      style={
        isPhone
          ? {
              height: viewport ? height : undefined,
              transition: dragPx === null ? 'height 220ms ease' : 'none',
            }
          : undefined
      }
    >
      <div ref={headRef} className="shrink-0">
      {/* Grab handle. The only thing that resizes the sheet. */}
      <button
        type="button"
        data-testid="sheet-handle"
        aria-label={UI.sheetHandleLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        className="flex h-12 w-full shrink-0 touch-none items-center justify-center md:hidden"
      >
        <span className="h-1.5 w-12 rounded-full bg-neutral-300" />
      </button>

      <div className="px-5 pb-3 md:px-0 md:pt-2">{peek}</div>
      </div>

      <div
        data-testid="sheet-content"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] md:px-0"
      >
        {children}
      </div>
    </section>
  );
}
