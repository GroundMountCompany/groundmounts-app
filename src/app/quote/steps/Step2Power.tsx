'use client';

import * as Slider from '@radix-ui/react-slider';
import '../sliderStyle.css';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useEffect, useState } from 'react';
import {
  useQuoteStore,
  DEFAULT_RATE_CENTS,
  RATE_CENTS_MIN,
  RATE_CENTS_MAX,
} from '@/store/quoteStore';
import { dollarsPerKwhFromCents } from '@/lib/rate';
import { annualTargetKwh } from '@/lib/sizing';
import { sanitizeNumeric, parseIntegerField, parseNumericField } from '@/lib/numericField';
import BillUpload from './BillUpload';
import { track } from '@/lib/analytics';

/**
 * One of two equal offers, side by side.
 *
 * Neither is the way and neither is the fallback. The upload used to sit above
 * the fields, which made it the real path and made typing read as giving up —
 * and the people this tool is for mostly do not have a bill on their phone.
 * Same size, same border, same weight, and nothing is chosen until they choose.
 */
function PathCard({
  testId,
  title,
  note,
  selected,
  onSelect,
}: {
  testId: string;
  title: string;
  note: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-[112px] flex-1 basis-0 flex-col rounded-xl border px-3 py-3 text-left ${
        selected ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 bg-white'
      }`}
    >
      <span className="text-[17px] font-semibold text-neutral-900">{title}</span>
      <span className="mt-1 text-[15px] leading-snug text-neutral-600">{note}</span>
    </button>
  );
}

/**
 * Bill inputs.
 *
 * The fields hold strings, not numbers, so an empty box stays empty. v1 seeded
 * them with 0 and every customer had to delete it before typing.
 */
export default function Step2Power() {
  const avgValue = useQuoteStore((s) => s.avgValue);
  const setAvgValue = useQuoteStore((s) => s.setAvgValue);
  const rateCents = useQuoteStore((s) => s.rateCentsPerKwh);
  const setRateCents = useQuoteStore((s) => s.setRateCentsPerKwh);
  const percentage = useQuoteStore((s) => s.percentage);
  const setPercentage = useQuoteStore((s) => s.setPercentage);
  const setBillMonths = useQuoteStore((s) => s.setBillMonths);
  const billAnnualKwh = useQuoteStore((s) => s.billAnnualKwh);
  const billPath = useQuoteStore((s) => s.billPath);
  const setBillPath = useQuoteStore((s) => s.setBillPath);
  const billPhase = useQuoteStore((s) => s.billPhase);

  // Both fields hold a string while being typed and commit on blur, so a
  // half-finished entry can never reach the maths as NaN.
  const [billText, setBillText] = useState(avgValue === 0 ? '' : String(avgValue));
  /*
    Why the fields are suddenly showing.

    Held here rather than in BillUpload because a failed read hands the
    customer over to this half of the screen, and the component that knew
    about the failure is gone by the time they read the sentence. Local, not
    persisted: it describes one attempt, not the funnel.
  */
  const [billFailure, setBillFailure] = useState<string | null>(null);
  const [rateText, setRateText] = useState(String(rateCents));

  const annualTarget = Math.round(
    billAnnualKwh && billAnnualKwh > 0
      ? billAnnualKwh * (percentage / 100)
      : annualTargetKwh(avgValue, dollarsPerKwhFromCents(rateCents), percentage),
  );
  const rateLooksOdd = rateCents < RATE_CENTS_MIN || rateCents > RATE_CENTS_MAX;

  /*
    A funnel that already has an answer is past the question.

    Somebody resuming, reloading, or coming back through the progress bar has
    already chosen; showing them two empty offers again would read as their
    work having been thrown away. This only fills a blank — it never overrides
    a choice, so tapping the other card sticks.
  */
  useEffect(() => {
    if (billPath !== null) return;
    if (billPhase === 'confirmed' || billPhase === 'review') setBillPath('upload');
    else if (avgValue > 0) setBillPath('manual');
  }, [billPath, billPhase, avgValue, setBillPath]);

  // The fields stay up after a bill is read: they hold what it implied, and a
  // customer who spots a wrong number should be able to fix it in place.
  const showFields = billPath === 'manual' || billPhase === 'confirmed';
  const chosen = billPath !== null;

  return (
    <div className="space-y-5">
      {/* Two doors, the same size. Whichever they pick opens below. */}
      <div data-testid="bill-paths" className="flex items-stretch gap-2">
        <PathCard
          testId="bill-path-upload"
          title={UI.billPathUpload}
          note={UI.billPathUploadNote}
          selected={billPath === 'upload'}
          onSelect={() => setBillPath('upload')}
        />
        <PathCard
          testId="bill-path-manual"
          title={UI.billPathManual}
          note={UI.billPathManualNote}
          selected={billPath === 'manual'}
          onSelect={() => {
            if (billPath !== 'manual') track('bill_manual_used');
            setBillPath('manual');
          }}
        />
      </div>

      {billPath === 'upload' && (
        <BillUpload
          onConfirm={(months, annualKwh, ratePerKwh) => {
            setBillMonths(months, annualKwh);

            // A rate read off their own bill beats the Texas average, so it
            // takes over the field below — visibly, in the same box they would
            // have typed it into.
            const cents = ratePerKwh ? Math.round(ratePerKwh * 100) : rateCents;
            if (ratePerKwh) {
              setRateCents(cents);
              setRateText(String(cents));
            }

            // Keep the manual field honest: show what the bill implies per month
            // at that rate, so the two halves of this screen agree.
            const monthly = Math.round((annualKwh / 12) * dollarsPerKwhFromCents(cents));
            setAvgValue(monthly);
            setBillText(String(monthly));
          }}
          onDiscard={() => {
            // Sizing returns to whatever is typed in below, and the rate goes
            // back to the Texas default: a rate read off a bill they have just
            // thrown away should not keep pricing their quote.
            setRateCents(DEFAULT_RATE_CENTS);
            setRateText(String(DEFAULT_RATE_CENTS));
            // A bill they have just thrown away is not a bill, so the fields
            // they are being sent back to have to be on screen.
            setBillPath('manual');
          }}
          onFailed={setBillFailure}
        />
      )}

      {billFailure && showFields && (
        <p data-testid="bill-failed" className="text-[15px] text-neutral-600">
          {billFailure}
        </p>
      )}

      {showFields && (
        <label className="block">
          <span className="block text-[17px] font-medium text-neutral-900">{UI.monthlyBill}</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-neutral-500">
              $
            </span>
            <input
              id="avg-bill"
              data-testid="avg-bill"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={UI.billPlaceholder}
              value={billText}
              onChange={(e) => setBillText(sanitizeNumeric(e.target.value, true))}
              onBlur={() => {
                // Parse the decimal the customer may have typed off their bill,
                // then round: the sizing maths does not need cents, and a whole
                // number is what they will recognise when they look again.
                const value = Math.round(parseNumericField(billText, 0));
                setAvgValue(value);
                setBillText(value === 0 ? '' : String(value));
              }}
              className="h-14 w-full rounded-xl border border-neutral-300 pl-9 pr-4 text-[17px] outline-none focus:border-neutral-500"
            />
          </div>
          <span className="mt-1 block text-[15px] text-neutral-500">{UI.monthlyBillHint}</span>
        </label>
      )}

      {showFields && (
        <label className="block">
          <span className="block text-[17px] font-medium text-neutral-900">{UI.ratePerKwh}</span>
          <div className="relative mt-1">
            <input
              id="rate-kwh"
              data-testid="rate-kwh"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={String(DEFAULT_RATE_CENTS)}
              value={rateText}
              onChange={(e) => setRateText(sanitizeNumeric(e.target.value))}
              onBlur={() => {
                const value = parseIntegerField(rateText, DEFAULT_RATE_CENTS);
                setRateCents(value);
                setRateText(String(value));
              }}
              className="h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
            />
          </div>
          <span className="mt-1 block text-[15px] text-neutral-500">{UI.ratePerKwhHint}</span>
          {rateLooksOdd && (
            <span data-testid="rate-nudge" className="mt-1 block text-[15px] text-amber-700">
              {UI.rateOutOfRange}
            </span>
          )}
        </label>
      )}

      {chosen && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[17px] font-medium text-neutral-900">{UI.offset}</span>
            <span data-testid="offset-value" className="text-[17px] font-semibold">
              {percentage}%
            </span>
          </div>
          <Slider.Root
            className="SliderRoot mt-3"
            data-testid="offset-slider"
            value={[percentage]}
            min={25}
            max={150}
            step={5}
            onValueChange={([v]) => setPercentage(v)}
          >
            <Slider.Track className="SliderTrack">
              <Slider.Range className="SliderRange" />
            </Slider.Track>
            <Slider.Thumb className="SliderThumb" aria-label={UI.offsetSliderLabel} />
          </Slider.Root>
        </div>
      )}

      {chosen && annualTarget > 0 && (
        <p data-testid="annual-target" className="text-[17px] text-neutral-800">
          {UI.annualTargetPrefix}{' '}
          <span className="font-semibold">{annualTarget.toLocaleString()} kWh</span>{' '}
          {UI.annualTargetSuffix}
        </p>
      )}

      <EducationCard copy={STEPS[1].education} />
    </div>
  );
}
