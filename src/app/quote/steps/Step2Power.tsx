'use client';

import * as Slider from '@radix-ui/react-slider';
import '../sliderStyle.css';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { BILL_PER_KWH, estimateMonthlyKWh } from '@/lib/solar';

/**
 * Bill inputs.
 *
 * The fields hold strings, not numbers, so an empty box stays empty. v1 seeded
 * them with 0 and every customer had to delete it before typing.
 */
export default function Step2Power() {
  const avgValue = useQuoteStore((s) => s.avgValue);
  const setAvgValue = useQuoteStore((s) => s.setAvgValue);
  const rate = useQuoteStore((s) => s.ratePerKwh);
  const setRate = useQuoteStore((s) => s.setRatePerKwh);
  const percentage = useQuoteStore((s) => s.percentage);
  const setPercentage = useQuoteStore((s) => s.setPercentage);

  const monthlyKwh = estimateMonthlyKWh(avgValue, rate || BILL_PER_KWH);
  const annualTarget = Math.round(monthlyKwh * 12 * (percentage / 100));

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
            placeholder="240"
            value={avgValue === 0 ? '' : String(avgValue)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9.]/g, '');
              setAvgValue(digits === '' ? 0 : Number(digits));
            }}
            className="h-14 w-full rounded-xl border border-neutral-300 pl-9 pr-4 text-[17px] outline-none focus:border-neutral-500"
          />
        </div>
      </label>

      <label className="block">
        <span className="block text-[17px] font-medium text-neutral-900">{UI.ratePerKwh}</span>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-neutral-500">
            $
          </span>
          <input
            id="rate-kwh"
            data-testid="rate-kwh"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={String(BILL_PER_KWH)}
            value={rate === 0 ? '' : String(rate)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9.]/g, '');
              setRate(digits === '' ? 0 : Number(digits));
            }}
            className="h-14 w-full rounded-xl border border-neutral-300 pl-9 pr-4 text-[17px] outline-none focus:border-neutral-500"
          />
        </div>
        <span className="mt-1 block text-[15px] text-neutral-500">
          Look for &ldquo;price per kWh&rdquo; on your bill. Leave it be if you are not sure.
        </span>
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
          <Slider.Thumb className="SliderThumb" aria-label="Offset percentage" />
        </Slider.Root>
      </div>

      {annualTarget > 0 && (
        <p data-testid="annual-target" className="text-[17px] text-neutral-800">
          That is about <span className="font-semibold">{annualTarget.toLocaleString()} kWh</span> a
          year to cover.
        </p>
      )}

      <EducationCard copy={STEPS[1].education} />
    </div>
  );
}
