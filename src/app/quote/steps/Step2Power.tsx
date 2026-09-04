'use client';

import * as Slider from '@radix-ui/react-slider';
import '../sliderStyle.css';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useState } from 'react';
import {
  useQuoteStore,
  DEFAULT_RATE_CENTS,
  RATE_CENTS_MIN,
  RATE_CENTS_MAX,
} from '@/store/quoteStore';
import { dollarsPerKwhFromCents, estimateMonthlyKWh } from '@/lib/solar';
import { sanitizeNumeric, parseIntegerField, parseNumericField } from '@/lib/numericField';

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

  // Both fields hold a string while being typed and commit on blur, so a
  // half-finished entry can never reach the maths as NaN.
  const [billText, setBillText] = useState(avgValue === 0 ? '' : String(avgValue));
  const [rateText, setRateText] = useState(String(rateCents));

  const monthlyKwh = estimateMonthlyKWh(avgValue, dollarsPerKwhFromCents(rateCents));
  const annualTarget = Math.round(monthlyKwh * 12 * (percentage / 100));
  const rateLooksOdd = rateCents < RATE_CENTS_MIN || rateCents > RATE_CENTS_MAX;

  return (
    <div className="space-y-5">
      <button
        type="button"
        data-testid="bill-upload-stub"
        disabled
        className="min-h-[48px] w-full rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-left"
      >
        <span className="block text-[17px] font-semibold text-neutral-500">
          {UI.billUploadStub}
        </span>
        <span className="block text-[15px] text-neutral-400">{UI.billUploadNote}</span>
      </button>

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

      {annualTarget > 0 && (
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
