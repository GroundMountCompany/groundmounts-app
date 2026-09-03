'use client';

import { useMemo } from 'react';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { footprintFt } from '@/lib/geo/array';
import { annualKwh, percentOfSouth, TX_FALLBACK_CURVE } from '@/lib/production';
import { PANELS } from '@/config/pricing';
import { useDesignSetup } from './useDesignSetup';

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2">
      <p className="text-[13px] uppercase tracking-wide text-neutral-500">{label}</p>
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
  const setPanelAdjust = useQuoteStore((s) => s.setPanelAdjust);

  const footprint = useMemo(() => footprintFt(totalPanels, panelTier), [totalPanels, panelTier]);
  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const southPct = percentOfSouth(TX_FALLBACK_CURVE, azimuth);
  const production = annualKwh(TX_FALLBACK_CURVE, kw, azimuth);

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
        {slopePercent === null ? 'checking' : `${slopePercent}% · ${slopeTier.toLowerCase()}`}.
        We route the trench around anything in the way once we are on site.
      </p>

      <EducationCard copy={STEPS[3].education} />
    </div>
  );
}
