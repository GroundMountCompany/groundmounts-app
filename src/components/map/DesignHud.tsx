'use client';

import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { annualKwh } from '@/lib/production';
import { PANELS } from '@/config/pricing';

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

  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const production = annualKwh(curve, kw, azimuth);

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
    </div>
  );
}
