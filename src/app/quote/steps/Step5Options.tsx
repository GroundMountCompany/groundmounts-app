'use client';

import EducationCard from '@/components/shell/EducationCard';
import { STEPS } from '@/config/copy';

/**
 * Stubs for now. The cards are here so the flow is complete end to end; the
 * price deltas and the conduit logic behind them land in Phase 3 with
 * pricing.ts.
 */
const CARDS = [
  {
    key: 'panels',
    title: 'Panels',
    body: 'Standard or premium. Premium makes more power in the same footprint.',
  },
  {
    key: 'battery',
    title: 'Battery',
    body: 'Keeps your lights on when the grid goes down. None, one or two.',
  },
  {
    key: 'siteprep',
    title: 'Site prep',
    body: 'Is the spot clear, or does it need brush and trees taken out?',
  },
];

export default function Step5Options() {
  return (
    <div className="space-y-4">
      {CARDS.map((card) => (
        <div
          key={card.key}
          data-testid={`option-${card.key}`}
          className="rounded-xl border border-neutral-200 p-4"
        >
          <h3 className="text-[17px] font-semibold text-neutral-900">{card.title}</h3>
          <p className="mt-1 text-[16px] leading-snug text-neutral-700">{card.body}</p>
          <p className="mt-2 text-[15px] text-neutral-500">Pricing for this comes next.</p>
        </div>
      ))}
      <EducationCard copy={STEPS[4].education} />
    </div>
  );
}
