'use client';

import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI, OPTION_CARDS } from '@/config/copy';

/**
 * Stubs for now. The cards are here so the flow is complete end to end; the
 * price deltas and the conduit logic behind them land in Phase 3 with
 * pricing.ts.
 */
export default function Step5Options() {
  return (
    <div className="space-y-4">
      {OPTION_CARDS.map((card) => (
        <div
          key={card.key}
          data-testid={`option-${card.key}`}
          className="rounded-xl border border-neutral-200 p-4"
        >
          <h3 className="text-[17px] font-semibold text-neutral-900">{card.title}</h3>
          <p className="mt-1 text-[16px] leading-snug text-neutral-700">{card.body}</p>
          <p className="mt-2 text-[15px] text-neutral-500">{UI.optionPriceLater}</p>
        </div>
      ))}
      <EducationCard copy={STEPS[4].education} />
    </div>
  );
}
