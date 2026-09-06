'use client';

import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { annualKwh } from '@/lib/production';
import { PANELS } from '@/config/pricing';
import { targetAnnualKwh } from '@/lib/sizing';
import { rotationShortfall } from '@/lib/shortfall';
import { dollarsPerKwhFromCents } from '@/lib/rate';

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
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelTier = useQuoteStore((s) => s.panelTier);
  const azimuth = useQuoteStore((s) => s.azimuth);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);
  const curve = useQuoteStore((s) => s.productionCurve);
  const billAnnualKwh = useQuoteStore((s) => s.billAnnualKwh);
  const avgValue = useQuoteStore((s) => s.avgValue);
  const rateCents = useQuoteStore((s) => s.rateCentsPerKwh);
  const percentage = useQuoteStore((s) => s.percentage);
  const panelAdjust = useQuoteStore((s) => s.panelAdjust);
  const setPanelAdjust = useQuoteStore((s) => s.setPanelAdjust);

  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const production = annualKwh(curve, kw, azimuth);

  // The same target the sizing effect uses, from the same function, so the
  // offer here can never disagree with the count the array was given.
  const target = targetAnnualKwh({
    billAnnualKwh,
    monthlyBillUsd: avgValue,
    ratePerKwh: dollarsPerKwhFromCents(rateCents),
    offsetPercent: percentage,
  });
  const shortfall = rotationShortfall({
    curve,
    targetAnnualKwh: target,
    azimuth,
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
      // Not interactive — a chip that swallowed a touch would be a chip that
      // stopped the array being dragged underneath it.
      // The width cap is what keeps it clear of "Find my panels" in the
      // opposite corner: that button is ~150px plus its own 12px inset, so the
      // chips get everything left of it and no more.
      className="pointer-events-none absolute left-3 top-3 z-20 max-w-[calc(100%-180px)] rounded-xl bg-white/95 px-3 py-2 shadow-md"
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

      {/*
        What the turn costs, and the one tap that undoes it.

        Rotation never changes the panel count — see useSizing — so without this
        a customer who turned their array east was quietly short of the offset
        they asked for, with nothing on screen saying so. Adding the panels is
        their call; the number is not a guess.
      */}
      {shortfall && (
        <div
          data-testid="hud-shortfall"
          // The rest of the HUD is deliberately untouchable so the array can be
          // dragged underneath it. This part has a button, so it opts back in.
          className="pointer-events-auto mt-2 flex items-center gap-2 border-t border-neutral-200 pt-2"
        >
          <p className="text-[14px] leading-snug text-neutral-700">
            <span data-testid="hud-off-south">
              {UI.hudOffSouth} &minus;{shortfall.offSouthPct}%
            </span>{' '}
            <span aria-hidden className="text-neutral-300">
              &middot;
            </span>{' '}
            <span data-testid="hud-shortfall-panels">
              {UI.hudAdd} {shortfall.addPanels} {UI.hudToStayAt} {percentage}%
            </span>
          </p>
          <button
            type="button"
            data-testid="hud-add-panels"
            onClick={() => setPanelAdjust(panelAdjust + shortfall.addPanels)}
            className="ml-auto h-12 shrink-0 rounded-xl bg-neutral-900 px-3 text-[15px] font-semibold text-white"
          >
            {UI.hudAdd} {shortfall.addPanels}
          </button>
        </div>
      )}
    </div>
  );
}
