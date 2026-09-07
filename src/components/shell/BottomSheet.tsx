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

/** Rounding slack so the footer never lands a pixel below the viewport. */
const PEEK_SLACK_PX = 8;

/** Breathing room between a focused field and whatever is below it. */
const FOCUS_MARGIN_PX = 12;

interface Props {
  snap: Snap;
  onSnapChange: (snap: Snap) => void;
  /** Progress and heading. Pinned to the top, never scrolls. */
  header: React.ReactNode;
  /**
   * What the pinned area shows at the peek snap point, when a step wants
   * something other than its heading there. The design step puts its panel
   * control here: at peek the body is below the fold, so a heading in that row
   * costs the customer the one control they need.
   *
   * Half and full always show `header`, so the heading is one drag away.
   */
  peekHeader?: React.ReactNode;
  /** The primary button. Pinned to the bottom, above the keyboard. */
  footer: React.ReactNode;
  /**
   * Fill the viewport and drop the snap points entirely. Used on steps with no
   * map, where a half-height sheet just leaves dead white space above it.
   */
  fullHeight?: boolean;
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
export default function BottomSheet({
  snap,
  onSnapChange,
  header,
  peekHeader,
  footer,
  fullHeight = false,
  children,
}: Props) {
  const [viewport, setViewport] = useState(0);
  const [isPhone, setIsPhone] = useState(false);
  /** How much of the layout viewport the on-screen keyboard is covering. */
  const [keyboardInset, setKeyboardInset] = useState(0);
  /** Height of a sticky button rendered inside the content, if any. */
  const [stickyFooterPx, setStickyFooterPx] = useState(0);
  const [peekPx, setPeekPx] = useState(MIN_PEEK_PX);
  const headRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  /** Set when a pointer moved far enough to count as a drag, not a tap. */
  const dragged = useRef(false);

  useEffect(() => {
    // The sheet only exists below md; above it the same component is a panel
    // filling its column, and an inline snap height would fight that.
    const query = window.matchMedia('(max-width: 767px)');

    // visualViewport, not innerHeight. iOS shrinks the visual viewport when the
    // keyboard opens and leaves innerHeight alone, so innerHeight cannot tell
    // you how much screen is actually left to lay out in.
    const measure = () => {
      const visual = window.visualViewport;
      setViewport(visual?.height ?? window.innerHeight);
      setIsPhone(query.matches);
      // A fixed element is anchored to the layout viewport, which the keyboard
      // does not change — so the sheet has to be lifted by hand or its footer
      // sits behind the keys.
      setKeyboardInset(
        visual ? Math.max(0, window.innerHeight - (visual.offsetTop + visual.height)) : 0
      );
    };
    measure();

    window.addEventListener('resize', measure);
    query.addEventListener('change', measure);
    window.visualViewport?.addEventListener('resize', measure);
    // The keyboard also scrolls the visual viewport without resizing it.
    window.visualViewport?.addEventListener('scroll', measure);

    return () => {
      window.removeEventListener('resize', measure);
      query.removeEventListener('change', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, []);

  // Phone only. Above md the sheet is a full-height column with no fold, so
  // there is nothing to make room for and the heading should just be there.
  const atPeek = isPhone && !fullHeight && snap === 'peek';
  const pinned = atPeek && peekHeader ? peekHeader : header;

  // Peek has to fit the header AND the footer, because the primary button lives
  // in the footer now. Measuring only the header left the button below the fold
  // — the exact "hunting for the button" this layout exists to prevent.
  useEffect(() => {
    const head = headRef.current;
    const foot = footRef.current;
    if (!head) return;

    // offsetHeight, not scrollHeight: the footer has a top border and safe-area
    // padding, and scrollHeight leaves the border out — enough to push the
    // button a few pixels under the fold.
    const measure = () =>
      setPeekPx(
        Math.max(
          MIN_PEEK_PX,
          // A few pixels of slack for sub-pixel rounding and the footer's
          // border. Without it the button lands a hair under the fold, which
          // is the whole failure this measurement exists to prevent.
          Math.ceil(head.offsetHeight + (foot?.offsetHeight ?? 0)) + PEEK_SLACK_PX
        )
      );
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(head);
    if (foot) observer.observe(foot);
    return () => observer.disconnect();
    // Re-measured when the pinned content swaps, not only when it resizes: a
    // peek row that is a different height than the heading it replaced has to
    // move the fold with it.
  }, [pinned]);

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

  // Track a sticky button inside the content so its height can be reserved.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const sticky = el.querySelector<HTMLElement>('[data-sticky-footer]');
      setStickyFooterPx(sticky?.offsetHeight ?? 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  /**
   * Bring a focused field above the on-screen keyboard.
   *
   * iOS shrinks the visual viewport when the keyboard opens but does not move
   * a fixed-position sheet, so a field near the bottom ends up underneath it.
   */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.matches('input, textarea, select')) return;

      // A beat's delay: the keyboard has to resize the visual viewport first.
      setTimeout(() => {
        const visual = window.visualViewport;
        // The last step's submit button is sticky inside the content rather
        // than in the shell footer, so it obstructs the field too. Measure
        // whatever is actually covering the bottom, not just the footer.
        const stickyInside = el.querySelector<HTMLElement>('[data-sticky-footer]');
        const obstruction =
          (footRef.current?.offsetHeight ?? 0) + (stickyInside?.offsetHeight ?? 0);
        const bottomLimit =
          (visual ? visual.offsetTop + visual.height : window.innerHeight) - obstruction;

        const field = target.getBoundingClientRect();
        // Only move if the field is actually hidden behind the keyboard or the
        // footer; scrolling a field that is already visible is just jitter.
        if (field.bottom <= bottomLimit && field.top >= 0) return;

        el.scrollTop += field.bottom - bottomLimit + FOCUS_MARGIN_PX;
      }, 150);
    };

    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, []);

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
      data-snap={fullHeight ? 'full' : snap}
      aria-label={UI.sheetLabel}
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-neutral-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:static md:h-full md:rounded-none md:border-0 md:shadow-none ${
        fullHeight ? 'top-0 rounded-none' : 'rounded-t-2xl'
      }`}
      style={
        isPhone
          ? {
              bottom: keyboardInset,
              ...(fullHeight
                ? { height: viewport ? viewport : undefined }
                : {
                    height: viewport ? height : undefined,
                    transition: dragPx === null ? 'height 220ms ease' : 'none',
                  }),
            }
          : undefined
      }
    >
      <div ref={headRef} className="shrink-0">
        {/* Grab handle. The only thing that resizes the sheet, and pointless
            when the sheet already fills the screen. */}
        {!fullHeight && (
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
        )}

        <div
          className={`px-5 pb-3 md:px-0 md:pt-2 ${fullHeight ? 'pt-[max(12px,env(safe-area-inset-top))]' : ''}`}
        >
          {pinned}
        </div>
      </div>

      <div
        ref={contentRef}
        data-testid="sheet-content"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 md:px-0"
        // Reserve the sticky button's height so a scrolled-to field lands above
        // it rather than underneath.
        style={{ scrollPaddingBottom: stickyFooterPx }}
      >
        {children}
      </div>

      {/* The primary button sits below the content, not on top of it. It used
          to be inside the header, which covered the fields it was asking the
          customer to fill in. */}
      <div
        ref={footRef}
        data-testid="sheet-footer"
        className="shrink-0 border-t border-neutral-100 bg-white px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:px-0"
      >
        {footer}
      </div>
    </section>
  );
}
