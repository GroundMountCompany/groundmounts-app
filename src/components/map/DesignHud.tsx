'use client';

import { UI } from '@/config/copy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { useSettledLayout } from '@/lib/useSettledLayout';
import { annualKwh } from '@/lib/production';
import { PANELS } from '@/config/pricing';
import { applyAutoSize } from '@/lib/applyAutoSize';
import { compassPoint, panelsOverSouth, type CompassPoint } from '@/lib/autoSize';
import { isFacingSouth } from '@/lib/easeAzimuth';
import { targetAnnualKwh } from '@/lib/sizing';
import { dollarsPerKwhFromCents } from '@/lib/rate';

/** Abbreviated, because this line shares a row with four figures. */
const SHORT: Record<CompassPoint, string> = {
  north: UI.compassShortNorth,
  northeast: UI.compassShortNortheast,
  east: UI.compassShortEast,
  southeast: UI.compassShortSoutheast,
  south: UI.compassShortSouth,
  southwest: UI.compassShortSouthwest,
  west: UI.compassShortWest,
  northwest: UI.compassShortNorthwest,
};

/**
 * The four numbers, on the map.
 *
 * They used to live only in the sheet's stats grid, which on a 390x844 phone
 * sits below the fold at the peek snap point — so the customer dragging and
 * turning the array could not see any of what they were changing. Owner QA on
 * a real iPhone: "while placing panels you can't see the numbers".
 *
 * It reads the same store the stats grid does, so it moves on every drag and
 * rotate frame without a subscription of its own.
 *
 * Top-left, opposite "Find my panels" in the top-right, and above the array:
 * `fitDesignView` frames the array in the middle of the map, so the corners are
 * the two places a chip cannot end up covering the thing it describes.
 */
export default function DesignHud() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState<number | null>(null);

  /**
   * Keep the chips clear of the button in the opposite corner.
   *
   * Both are absolutely positioned in the map column, so the gap between them
   * is the difference of two rects — no constant, and nothing to be wrong
   * about when a font renders wider than it did on the machine this was
   * written on.
   */
  const measure = useCallback((): string => {
    const box = boxRef.current;
    const find = document.querySelector<HTMLElement>('[data-testid="find-panels"]');
    if (!box || !find) return 'none';

    const boxRect = box.getBoundingClientRect();
    const findRect = find.getBoundingClientRect();
    // A floor, so a narrow screen shows a cramped HUD rather than none at all
    // — low enough that only an absurdly wide button could push the two into
    // each other, which is the failure this measurement exists to prevent.
    const next = Math.max(96, Math.round(findRect.left - boxRect.left - 8));
    setMaxWidth((current) => (current === next ? current : next));
    return String(next);
  }, []);

  useSettledLayout(measure);

  /*
    Re-measure if either box changes size after that.

    The settle loop covers mount and the couple of seconds after it, which is
    where a late-loading font lands. This covers everything else: the button's
    label is text, and text can reflow whenever the thing rendering it decides
    to. Without it the cap is only ever right for the first paint.
  */
  useEffect(() => {
    const find = document.querySelector<HTMLElement>('[data-testid="find-panels"]');
    const box = boxRef.current;
    if (!find && !box) return;
    const observer = new ResizeObserver(() => measure());
    if (find) observer.observe(find);
    if (box) observer.observe(box);
    return () => observer.disconnect();
  }, [measure]);

  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelTier = useQuoteStore((s) => s.panelTier);
  const azimuth = useQuoteStore((s) => s.azimuth);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);
  const curve = useQuoteStore((s) => s.productionCurve);
  const sizingMode = useQuoteStore((s) => s.sizingMode);
  const returnToAuto = useQuoteStore((s) => s.returnToAuto);
  const billAnnualKwh = useQuoteStore((s) => s.billAnnualKwh);
  const avgValue = useQuoteStore((s) => s.avgValue);
  const rateCents = useQuoteStore((s) => s.rateCentsPerKwh);
  const percentage = useQuoteStore((s) => s.percentage);

  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const production = annualKwh(curve, kw, azimuth);

  /*
    The standing line, for as long as the array is turned away from south.

    The toast says what just changed and then goes. This says what the array is
    still doing — owner QA: once the toast had gone there was nothing on screen
    explaining why the count was what it was, and on a phone the toast was easy
    to miss entirely.
  */
  const offSouth = !isFacingSouth(azimuth);
  const overSouth = panelsOverSouth({
    curve,
    // The same target the sizing effect uses, from the same function.
    targetAnnualKwh: targetAnnualKwh({
      billAnnualKwh,
      monthlyBillUsd: avgValue,
      ratePerKwh: dollarsPerKwhFromCents(rateCents),
      offsetPercent: percentage,
    }),
    tier: panelTier,
    totalPanels,
  });

  const items: Array<[string, string, string]> = [
    ['hud-panels', String(totalPanels), UI.hudPanels],
    ['hud-kw', kw.toFixed(1), UI.hudKw],
    ['hud-trench', String(trenchFeet), UI.hudTrench],
    ['hud-production', production.toLocaleString(), UI.hudProduction],
  ];

  return (
    <div
      data-testid="design-hud"
      aria-label={UI.hudLabel}
      aria-live="polite"
      ref={boxRef}
      // Not interactive — a chip that swallowed a touch would be a chip that
      // stopped the array being dragged underneath it.
      className="pointer-events-none absolute left-3 top-3 z-20 rounded-xl bg-white/95 px-3 py-2 shadow-md"
      // Width capped by where "Find my panels" actually is, measured. It used
      // to be capped at a constant guessed from that button's width on one
      // machine — and the button is a text label, so it is wider under the
      // fonts CI renders with, and the HUD ran 13px under it there.
      style={maxWidth === null ? undefined : { maxWidth }}
    >
      {/* One line where there is room for one, a 2x2 grid of chips where there
          is not. Both are the same four figures. */}
      {/* Column-major on a narrow screen, so the two short figures share one
          column and the two long ones share the other — row-major put "42 ft
          trench" and "12,345 kWh/yr" side by side and the box grew wide enough
          to reach the button opposite. */}
      <div className="grid grid-flow-col grid-rows-2 gap-x-3 gap-y-1 min-[420px]:flex min-[420px]:grid-flow-row min-[420px]:grid-rows-1 min-[420px]:items-baseline min-[420px]:gap-2">
        {items.map(([testId, value, unit], i) => (
          <span key={testId} className="flex items-baseline gap-1 whitespace-nowrap">
            <span data-testid={testId} className="text-[16px] font-semibold text-neutral-900">
              {value}
            </span>
            <span className="text-[14px] text-neutral-600">{unit}</span>
            {i < items.length - 1 && (
              <span aria-hidden className="hidden pl-1 text-neutral-300 min-[420px]:inline">
                &middot;
              </span>
            )}
          </span>
        ))}
      </div>

      {offSouth && (
        <p
          data-testid="hud-facing"
          className="mt-2 border-t border-neutral-200 pt-2 text-[14px] leading-snug text-neutral-700"
        >
          {UI.hudFacing}{' '}
          <span data-testid="hud-facing-point" className="font-semibold text-neutral-900">
            {SHORT[compassPoint(azimuth)]}
          </span>
          {overSouth !== 0 && (
            <>
              {' '}
              <span aria-hidden className="text-neutral-300">
                &middot;
              </span>{' '}
              <span data-testid="hud-facing-delta">{Math.abs(overSouth)}</span>{' '}
              {overSouth > 0 ? UI.hudMorePanels : UI.hudFewerPanels}
            </>
          )}
        </p>
      )}

      {/*
        The count is theirs now.

        Pressing +/- takes the panel count out of the sizing maths, so turning
        the array no longer moves it — a number somebody chose by hand must not
        change on its own. This is the way back, and it is deliberately a tap
        rather than something that happens quietly.
      */}
      {sizingMode === 'manual' && (
        <div
          data-testid="hud-auto-size"
          // The rest of the HUD is untouchable so the array can be dragged
          // underneath it. This part has a button, so it opts back in.
          className="pointer-events-auto mt-2 flex items-center gap-2 border-t border-neutral-200 pt-2"
        >
          <p className="text-[14px] leading-snug text-neutral-600">{UI.autoSizeHint}</p>
          <button
            type="button"
            data-testid="auto-size"
            onClick={() => {
              returnToAuto();
              // Immediately, not on the next turn: the chip says it will size
              // for where the array is pointing now.
              applyAutoSize();
            }}
            className="ml-auto h-12 shrink-0 rounded-xl bg-neutral-900 px-3 text-[15px] font-semibold text-white"
          >
            {UI.autoSize}
          </button>
        </div>
      )}
    </div>
  );
}
