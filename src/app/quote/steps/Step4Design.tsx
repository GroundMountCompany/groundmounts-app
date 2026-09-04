'use client';

import { useMemo } from 'react';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { footprintFt } from '@/lib/geo/array';
import { annualKwh, percentOfSouth } from '@/lib/production';
import { PANELS } from '@/config/pricing';
import { useDesignSetup } from './useDesignSetup';

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2">
      <p className="text-[15px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p data-testid={testId} className="text-[17px] font-semibold text-neutral-900">
        {value}
      </p>
    </div>
  );
}

/** The product screen: what they are buying, in feet and kilowatts. */
export default function Step4Design() {
  useDesignSetup();

  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelTier = useQuoteStore((s) => s.panelTier);
  const azimuth = useQuoteStore((s) => s.azimuth);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);
  const slopePercent = useQuoteStore((s) => s.slopePercent);
  const slopeTier = useQuoteStore((s) => s.slopeTier);
  const panelAdjust = useQuoteStore((s) => s.panelAdjust);
  const soilClass = useQuoteStore((s) => s.soilClass);
  const setPanelAdjust = useQuoteStore((s) => s.setPanelAdjust);
  const slopeSource = useQuoteStore((s) => s.slopeSource);
  const chooseSlopeTier = useQuoteStore((s) => s.chooseSlopeTier);
  // The site's own PVWatts curve when /api/site answered, the Texas fallback
  // when it did not. Same source as the sizing that chose the panel count and
  // as the production figure on the quote — this screen used to read the
  // fallback unconditionally, so a customer with a real curve saw one number
  // here and a different one two steps later.
  const curve = useQuoteStore((s) => s.productionCurve);

  const footprint = useMemo(() => footprintFt(totalPanels, panelTier), [totalPanels, panelTier]);
  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const southPct = percentOfSouth(curve, azimuth);
  const production = annualKwh(curve, kw, azimuth);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label={UI.panels} value={String(totalPanels)} testId="stat-panels" />
        <Stat label={UI.systemSize} value={`${kw.toFixed(1)} kW`} testId="stat-kw" />
        <Stat
          label={UI.footprint}
          value={`${Math.round(footprint.widthFt)} x ${Math.round(footprint.depthFt)} ft`}
          testId="stat-footprint"
        />
        <Stat
          label={UI.production}
          value={`${production.toLocaleString()} kWh/yr`}
          testId="stat-production"
        />
        <Stat label={UI.trench} value={`${trenchFeet} ft`} testId="stat-trench" />
        <Stat
          label={UI.facing}
          value={`${Math.round(azimuth)}° · ${southPct}%`}
          testId="stat-facing"
        />
      </div>

      {/*
        Both terrain lookups failed, so ask. An unknown slope prices at no adder
        at all, which quietly under-quotes every steep parcel in the hill
        country; three taps is a better answer than a silent guess.
      */}
      {(slopeSource === 'unavailable' || slopeSource === 'chosen') && (
        <div data-testid="slope-picker" className="space-y-2 rounded-xl border border-neutral-200 p-3">
          <p className="text-[16px] font-medium text-neutral-900">{UI.slopeAsk}</p>
          <div className="flex gap-2">
            {([
              { tier: 'Flat', label: UI.slopeFlat },
              { tier: 'Rolling', label: UI.slopeRolling },
              { tier: 'Steep', label: UI.slopeSteep },
            ] as const).map((o) => (
              <button
                key={o.tier}
                type="button"
                data-testid={`slope-${o.tier.toLowerCase()}`}
                aria-pressed={slopeTier === o.tier}
                onClick={() => chooseSlopeTier(o.tier)}
                className={`min-h-[56px] flex-1 rounded-xl border px-2 text-[17px] font-semibold ${
                  slopeTier === o.tier
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 bg-white text-neutral-900'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[15px] text-neutral-500">{UI.slopeAskHint}</p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2">
        <span className="text-[17px] font-medium text-neutral-900">{UI.panels}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="panel-minus"
            aria-label={UI.removePanel}
            onClick={() => setPanelAdjust(panelAdjust - 1)}
            disabled={totalPanels <= 1}
            className="h-12 w-12 rounded-xl border border-neutral-300 text-[22px] font-semibold disabled:opacity-40"
          >
            &minus;
          </button>
          <span data-testid="panel-count" className="min-w-[3ch] text-center text-[19px] font-semibold">
            {totalPanels}
          </span>
          <button
            type="button"
            data-testid="panel-plus"
            aria-label={UI.addPanel}
            onClick={() => setPanelAdjust(panelAdjust + 1)}
            className="h-12 w-12 rounded-xl border border-neutral-300 text-[22px] font-semibold"
          >
            +
          </button>
        </div>
      </div>

      <p className="text-[16px] text-neutral-700">
        {UI.slope}:{' '}
        {slopePercent === null
          ? UI.slopeChecking
          : `${slopePercent}% · ${slopeTier.toLowerCase()}`}
        . {soilClass ? `${UI.soilLabel}: ${soilClass}. ` : ''}
        {UI.trenchNote}
      </p>

      <EducationCard copy={STEPS[3].education} />
    </div>
  );
}
