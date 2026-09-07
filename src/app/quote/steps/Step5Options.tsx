'use client';

import { useEffect } from 'react';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI, OPTION_CARDS } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { useQuote } from './useQuote';
import { looksRocky, priceQuote } from '@/lib/pricing';
import { SITE, type SlopeAnswer } from '@/config/pricing';

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
  price?: string;
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
      {price ? (
        <span className={`text-[15px] ${selected ? 'text-neutral-300' : 'text-neutral-500'}`}>
          {price}
        </span>
      ) : null}
    </button>
  );
}

function Question({
  testId,
  title,
  body,
  children,
}: {
  testId: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="space-y-2">
      <h3 className="text-[17px] font-semibold text-neutral-900">{title}</h3>
      <p className="text-[16px] leading-snug text-neutral-700">{body}</p>
      {children}
    </section>
  );
}

/**
 * Four questions about the ground and one about a conversation.
 *
 * The panel choice is gone: it was a question about a product rather than
 * about the customer's land, and the answer never moved the number much. What
 * replaced it is what the surveys used to decide silently — how steep the
 * ground is and whether it is rocky. Those adders are five figures on a bad
 * parcel, and the person standing on it knows better than a DEM tile sampled
 * at 200 ft.
 *
 * The surveys still run. They pre-select these answers and they still reach
 * the lead, so the owner can see where the customer disagreed with the map.
 */
export default function Step5Options() {
  const current = useQuote();

  const needsClearing = useQuoteStore((s) => s.needsClearing);
  const setNeedsClearing = useQuoteStore((s) => s.setNeedsClearing);
  const slopeAnswer = useQuoteStore((s) => s.slopeAnswer);
  const setSlopeAnswer = useQuoteStore((s) => s.setSlopeAnswer);
  const rocky = useQuoteStore((s) => s.rocky);
  const setRocky = useQuoteStore((s) => s.setRocky);
  const batteryInterest = useQuoteStore((s) => s.batteryInterest);
  const setBatteryInterest = useQuoteStore((s) => s.setBatteryInterest);
  const suggestSiteAnswers = useQuoteStore((s) => s.suggestSiteAnswers);

  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelTier = useQuoteStore((s) => s.panelTier);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);
  const batteryUnits = useQuoteStore((s) => s.batteryUnits);
  const slopeTier = useQuoteStore((s) => s.slopeTier);
  const soilClass = useQuoteStore((s) => s.soilClass);

  const surveySaysRocky = looksRocky(soilClass);

  /*
    Start on the survey's reading, until the customer says otherwise.

    The lookups can land after this step is open, so this runs whenever they
    change rather than once on mount — but `suggestSiteAnswers` refuses to move
    anything once a button has been pressed, so a late result cannot overwrite
    an answer somebody has already given.
  */
  useEffect(() => {
    suggestSiteAnswers({
      slopeAnswer: slopeTier === 'Steep' ? 'big' : 'flat',
      rocky: surveySaysRocky,
    });
  }, [slopeTier, surveySaysRocky, suggestSiteAnswers]);

  /** What the total would be with one thing changed. */
  const priceWith = (
    over: Partial<{ needsClearing: boolean; slopeAnswer: SlopeAnswer; rocky: boolean }>
  ) =>
    priceQuote(
      { panelCount: totalPanels, tier: panelTier, trenchFeet },
      { batteryUnits, needsClearing: over.needsClearing ?? needsClearing },
      {
        slopeAnswer: over.slopeAnswer ?? slopeAnswer,
        rocky: over.rocky ?? rocky,
      }
    ).estimate;

  const against = (over: Parameters<typeof priceWith>[0]) => priceWith(over) - current.estimate;

  const showClearing = SITE.vegetationClearing.enabled;

  const SLOPE_CHOICES: Array<{ answer: SlopeAnswer; label: string }> = [
    { answer: 'flat', label: UI.slopeAnswerFlat },
    { answer: 'slight', label: UI.slopeAnswerSlight },
    { answer: 'big', label: UI.slopeAnswerBig },
  ];

  return (
    <div className="space-y-5">
      {showClearing && (
        <Question
          testId="option-siteprep"
          title={OPTION_CARDS[0].title}
          body={OPTION_CARDS[0].body}
        >
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
        </Question>
      )}

      <Question testId="option-slope" title={OPTION_CARDS[1].title} body={OPTION_CARDS[1].body}>
        <div className="flex gap-2">
          {SLOPE_CHOICES.map((choice) => (
            <Choice
              key={choice.answer}
              testId={`slope-answer-${choice.answer}`}
              label={choice.label}
              price={delta(against({ slopeAnswer: choice.answer }))}
              selected={slopeAnswer === choice.answer}
              onSelect={() => setSlopeAnswer(choice.answer)}
            />
          ))}
        </div>
      </Question>

      <Question testId="option-soil" title={OPTION_CARDS[2].title} body={OPTION_CARDS[2].body}>
        <div className="flex gap-2">
          <Choice
            testId="rocky-no"
            label={UI.rockyNo}
            price={delta(against({ rocky: false }))}
            selected={!rocky}
            onSelect={() => setRocky(false)}
          />
          <Choice
            testId="rocky-yes"
            label={UI.rockyYes}
            price={delta(against({ rocky: true }))}
            selected={rocky}
            onSelect={() => setRocky(true)}
          />
        </div>
        {surveySaysRocky && (
          <p data-testid="rocky-survey-note" className="text-[15px] text-neutral-500">
            {UI.rockySurveyNote}
          </p>
        )}
      </Question>

      <Question testId="option-battery" title={OPTION_CARDS[3].title} body={OPTION_CARDS[3].body}>
        <div className="flex gap-2">
          <Choice
            testId="battery-interest-yes"
            label={UI.batteryInterestYes}
            selected={batteryInterest}
            onSelect={() => setBatteryInterest(true)}
          />
          <Choice
            testId="battery-interest-no"
            label={UI.batteryInterestNo}
            selected={!batteryInterest}
            onSelect={() => setBatteryInterest(false)}
          />
        </div>
        {/* No price on either button, deliberately: this question does not
            change the number, and a "+$0" would suggest it might. */}
        <p className="text-[15px] text-neutral-500">{UI.batteryInterestNote}</p>
      </Question>

      <EducationCard copy={STEPS[4].education} />
    </div>
  );
}
