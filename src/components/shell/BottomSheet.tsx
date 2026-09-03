'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Snap = 'peek' | 'half' | 'full';

/** Sheet height at each snap point, as a fraction of the viewport. */
const SNAP_FRACTION: Record<Snap, number> = {
  peek: 0,
  half: 0.5,
  full: 0.88,
};

/** Peek shows one line of context plus the primary button, and nothing else. */
const PEEK_PX = 168;

const ORDER: Snap[] = ['peek', 'half', 'full'];

interface Props {
  snap: Snap;
  onSnapChange: (snap: Snap) => void;
  /** Always visible, at every snap point. */
  peek: React.ReactNode;
  children: React.ReactNode;
}

function heightFor(snap: Snap, viewport: number): number {
  return snap === 'peek' ? PEEK_PX : Math.round(viewport * SNAP_FRACTION[snap]);
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
  const [dragPx, setDragPx] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);

  useEffect(() => {
    const measure = () => setViewport(window.innerHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const settled = viewport ? heightFor(snap, viewport) : PEEK_PX;
  const height = dragPx ?? settled;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStart.current = { y: e.clientY, height: settled };
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
      const next = start.height + (start.y - e.clientY);
      setDragPx(Math.max(PEEK_PX, Math.min(next, viewport * SNAP_FRACTION.full)));
    },
    [viewport]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStart.current;
      dragStart.current = null;
      if (!start || !viewport || dragPx === null) {
        setDragPx(null);
        return;
      }
      // Snap to whichever point the sheet ended up closest to.
      const nearest = ORDER.reduce((best, candidate) =>
        Math.abs(heightFor(candidate, viewport) - dragPx) <
        Math.abs(heightFor(best, viewport) - dragPx)
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
    [dragPx, viewport, snap, onSnapChange]
  );

  const cycle = () => onSnapChange(snap === 'full' ? 'peek' : snap === 'half' ? 'full' : 'half');

  return (
    <section
      data-testid="bottom-sheet"
      data-snap={snap}
      aria-label="Controls"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-neutral-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:static md:h-full md:rounded-none md:border-0 md:shadow-none"
      style={{
        height: viewport ? height : undefined,
        transition: dragPx === null ? 'height 220ms ease' : 'none',
      }}
    >
      {/* Grab handle. The only thing that resizes the sheet. */}
      <button
        type="button"
        data-testid="sheet-handle"
        aria-label="Resize controls"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={cycle}
        className="flex h-9 w-full shrink-0 touch-none items-center justify-center md:hidden"
      >
        <span className="h-1.5 w-12 rounded-full bg-neutral-300" />
      </button>

      <div className="shrink-0 px-5 pb-3 md:px-0 md:pt-2">{peek}</div>

      <div
        data-testid="sheet-content"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] md:px-0"
      >
        {children}
      </div>
    </section>
  );
}
