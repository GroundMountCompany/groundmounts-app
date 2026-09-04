'use client';

import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI, OPTION_CARDS } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { useQuote } from './useQuote';
import { priceQuote } from '@/lib/pricing';
import { BATTERY, type PanelTier } from '@/config/pricing';

/** Signed money, so a choice that saves money reads as a saving. */
function delta(amount: number): string {
  if (amount === 0) return UI.included;
  const sign = amount > 0 ? '+' : '−';
  return `${sign}${Math.abs(amount).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })}`;
}

function Choice({
  label,
  price,
  selected,
  onSelect,
  testId,
}: {
  label: string;
  price: string;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2 ${
        selected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'
      }`}
    >
      <span className="text-[17px] font-semibold">{label}</span>
      <span className={`text-[15px] ${selected ? 'text-neutral-300' : 'text-neutral-500'}`}>
        {price}
      </span>
    </button>
  );
}

/**
 * The three decisions that move the number most, each showing what it costs
 * against the design as it stands right now.
 */
export default function Step5Options() {
  const current = useQuote();

  const panelTier = useQuoteStore((s) => s.panelTier);
  const setPanelTier = useQuoteStore((s) => s.setPanelTier);
  const batteryUnits = useQuoteStore((s) => s.batteryUnits);
  const setBatteryUnits = useQuoteStore((s) => s.setBatteryUnits);
  const needsClearing = useQuoteStore((s) => s.needsClearing);
  const setNeedsClearing = useQuoteStore((s) => s.setNeedsClearing);

  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);
  const slopePercent = useQuoteStore((s) => s.slopePercent);
  const soilClass = useQuoteStore((s) => s.soilClass);

  /** What the total would be with one thing changed. */
  const priceWith = (
    over: Partial<{ tier: PanelTier; batteryUnits: number; needsClearing: boolean }>
  ) =>
    priceQuote(
      { panelCount: totalPanels, tier: over.tier ?? panelTier, trenchFeet },
      {
        batteryUnits: over.batteryUnits ?? batteryUnits,
        needsClearing: over.needsClearing ?? needsClearing,
      },
      { slopePercent, soilClass }
    ).estimate;

  const against = (over: Parameters<typeof priceWith>[0]) => priceWith(over) - current.estimate;

  return (
    <div className="space-y-5">
      <section data-testid="option-panels" className="space-y-2">
        <h3 className="text-[17px] font-semibold text-neutral-900">{OPTION_CARDS[0].title}</h3>
        <p className="text-[16px] leading-snug text-neutral-700">{OPTION_CARDS[0].body}</p>
        <div className="flex gap-2">
          <Choice
            testId="tier-standard"
            label={UI.tierStandard}
            price={delta(against({ tier: 'standard' }))}
            selected={panelTier === 'standard'}
            onSelect={() => setPanelTier('standard')}
          />
          <Choice
            testId="tier-premium"
            label={UI.tierPremium}
            price={delta(against({ tier: 'premium' }))}
            selected={panelTier === 'premium'}
            onSelect={() => setPanelTier('premium')}
          />
        </div>
      </section>

      <section data-testid="option-battery" className="space-y-2">
        <h3 className="text-[17px] font-semibold text-neutral-900">{OPTION_CARDS[1].title}</h3>
        <p className="text-[16px] leading-snug text-neutral-700">{OPTION_CARDS[1].body}</p>
        <div className="flex gap-2">
          {[
            { units: 0, label: UI.batteryNone },
            { units: 1, label: UI.batteryOne },
            { units: 2, label: UI.batteryTwo },
          ]
            .filter((o) => o.units <= BATTERY.maxUnits)
            .map((o) => (
              <Choice
                key={o.units}
                testId={`battery-${o.units}`}
                label={o.label}
                price={delta(against({ batteryUnits: o.units }))}
                selected={batteryUnits === o.units}
                onSelect={() => setBatteryUnits(o.units)}
              />
            ))}
        </div>
      </section>

      <section data-testid="option-siteprep" className="space-y-2">
        <h3 className="text-[17px] font-semibold text-neutral-900">{OPTION_CARDS[2].title}</h3>
        <p className="text-[16px] leading-snug text-neutral-700">{OPTION_CARDS[2].body}</p>
        <div className="flex gap-2">
          <Choice
            testId="clearing-no"
            label={UI.clearingNo}
            price={delta(against({ needsClearing: false }))}
            selected={!needsClearing}
            onSelect={() => setNeedsClearing(false)}
          />
          <Choice
            testId="clearing-yes"
            label={UI.clearingYes}
            price={delta(against({ needsClearing: true }))}
            selected={needsClearing}
            onSelect={() => setNeedsClearing(true)}
          />
        </div>
      </section>

      <EducationCard copy={STEPS[4].education} />
    </div>
  );
}
