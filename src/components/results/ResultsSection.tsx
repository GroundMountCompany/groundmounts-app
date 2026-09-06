'use client';

import { useMemo, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { UI } from '@/config/copy';
import { RESULTS } from '@/config/results';
import { projectResults } from '@/lib/results';
import { useQuoteStore } from '@/store/quoteStore';

const money = (amount: number) =>
  amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/**
 * Axis labels only.
 *
 * The cumulative lines reach six figures, and "$112,176" down the side of a
 * 390px chart leaves no room for the chart.
 */
const compactMoney = (amount: number) =>
  amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${Math.round(amount)}`;

/** How many x-axis ticks fit on a 390px screen without turning to mush. */
const MAX_TICKS = 6;

function Figure({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex-1 rounded-xl border border-neutral-200 px-3 py-3">
      <p className="text-[15px] leading-snug text-neutral-500">{label}</p>
      <p data-testid={testId} className="mt-0.5 text-[19px] font-semibold text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function Assumption({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="whitespace-nowrap font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

/**
 * What twenty-five years of doing nothing costs.
 *
 * A five-figure quote is only frightening on its own. Most people have never
 * added up what they are going to hand the utility over the same period, and
 * the answer is usually larger. This puts the two side by side and lets the
 * customer argue with the one assumption that actually moves it.
 *
 * Everything the model was told is printed underneath. A chart that goes up
 * and to the right is worthless if nobody can see what it was fed.
 */
export default function ResultsSection({
  monthlyBillUsd,
  systemPriceUsd,
  offsetFraction,
  startYear,
}: {
  monthlyBillUsd: number;
  systemPriceUsd: number;
  offsetFraction: number;
  startYear: number;
}) {
  const inflationPct = useQuoteStore((s) => s.utilityInflationPct);
  const setInflationPct = useQuoteStore((s) => s.setUtilityInflationPct);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const model = useMemo(
    () =>
      projectResults({
        monthlyBillUsd,
        systemPriceUsd,
        offsetFraction,
        inflationPct,
        startYear,
      }),
    [monthlyBillUsd, systemPriceUsd, offsetFraction, inflationPct, startYear]
  );

  // Every fifth year, so a 390px axis carries six labels rather than
  // twenty-five overlapping ones.
  const step = Math.ceil(model.rows.length / MAX_TICKS);
  const ticks = model.rows
    .filter((_, i) => i % step === 0 || i === model.rows.length - 1)
    .map((r) => r.calendarYear);

  return (
    <section data-testid="results-section" className="space-y-4">
      <div>
        <h4 className="text-[19px] font-semibold text-neutral-900">{UI.resultsTitle}</h4>
        <p className="mt-1 text-[17px] leading-snug text-neutral-700">{UI.resultsIntro}</p>
      </div>

      {/* The chart. Two lines and a marker where they cross; no tooltip, no
          hover state — this has to work under a thumb. */}
      <div data-testid="results-chart" aria-label={UI.resultsChartLabel}>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={model.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e5e5e5" vertical={false} />
              <XAxis
                dataKey="calendarYear"
                ticks={ticks}
                tick={{ fontSize: 17, fill: '#525252' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e5e5' }}
              />
              <YAxis
                width={56}
                tick={{ fontSize: 17, fill: '#525252' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={compactMoney}
              />
              {model.paybackCalendarYear !== null && (
                <ReferenceLine
                  x={model.paybackCalendarYear}
                  stroke="#171717"
                  strokeDasharray="4 4"
                />
              )}
              {/* Cumulative, not monthly: what each path has cost by that
                  year. The utility line starts at nothing and climbs; the
                  system line starts at the price and barely moves. Where they
                  meet is the answer to the only question anybody asks. */}
              <Line
                type="monotone"
                dataKey="cumulativeWithout"
                stroke="#dc2626"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="cumulativeWith"
                stroke="#16a34a"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Our own legend rather than Recharts': the series keys are field
            names, and the customer needs words. */}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[17px]">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-1 w-5 rounded bg-[#dc2626]" />
            <span className="text-neutral-700">{UI.resultsWithout}</span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-1 w-5 rounded bg-[#16a34a]" />
            <span className="text-neutral-700">{UI.resultsWith}</span>
          </span>
          {model.paybackCalendarYear !== null && (
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-1 w-5 rounded border-t-2 border-dashed border-neutral-900" />
              <span className="text-neutral-700">{UI.resultsCrossover}</span>
            </span>
          )}
        </div>
      </div>

      {/* The one assumption the customer gets to argue with, directly under the
          thing it moves. */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] text-neutral-700">{UI.resultsInflationLabel}</span>
          <span data-testid="inflation-value" className="text-[19px] font-semibold">
            {inflationPct}%
          </span>
        </div>
        <Slider.Root
          className="SliderRoot mt-3"
          data-testid="inflation-slider"
          value={[inflationPct]}
          min={RESULTS.inflationMinPct}
          max={RESULTS.inflationMaxPct}
          step={RESULTS.inflationStepPct}
          onValueChange={([v]) => setInflationPct(v)}
        >
          <Slider.Track className="SliderTrack">
            <Slider.Range className="SliderRange" />
          </Slider.Track>
          <Slider.Thumb className="SliderThumb" aria-label={UI.resultsInflationLabel} />
        </Slider.Root>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Figure
          testId="result-breakeven"
          label={model.paybackYear === null ? '' : UI.resultsPaidBack}
          value={
            model.paybackYear === null
              ? UI.resultsNoPayback
              : `${model.paybackYear} (${model.paybackCalendarYear})`
          }
        />
        <Figure
          testId="result-utility-total"
          label={UI.resultsUtilityTotal}
          value={money(model.totalWithout)}
        />
        <Figure
          testId="result-system-total"
          label={UI.resultsSystemTotal}
          value={money(model.systemPriceUsd)}
        />
      </div>

      <p data-testid="result-year-25" className="text-[17px] leading-snug text-neutral-800">
        {UI.resultsYear25Prefix} {model.final.calendarYear} {UI.resultsYear25Middle}{' '}
        <span className="font-semibold">{money(model.final.withoutMonthly)}</span>
        {UI.resultsPerMonth}. {UI.resultsYear25With}{' '}
        <span className="font-semibold">{money(model.final.residualMonthly)}</span>
        {UI.resultsPerMonth}.
      </p>

      {/* The secondary figure, and labelled as one. Nobody is offering to take
          the price monthly — this is a way of feeling the size of it. */}
      <p data-testid="result-monthly-equivalent" className="text-[17px] text-neutral-600">
        {UI.resultsSpreadPrefix} {model.assumptions.horizonYears} {UI.resultsSpreadMiddle}{' '}
        <span className="font-semibold text-neutral-900">
          {money(model.monthlyEquivalent)}
        </span>
        {UI.resultsPerMonth} {UI.resultsSpreadSuffix}
      </p>

      <div className="rounded-xl border border-neutral-200 p-3">
        <button
          type="button"
          data-testid="results-assumptions-toggle"
          aria-expanded={assumptionsOpen}
          onClick={() => setAssumptionsOpen((v) => !v)}
          className="min-h-[48px] text-[17px] font-semibold text-neutral-900 underline underline-offset-2"
        >
          {assumptionsOpen ? UI.showLess : UI.resultsAssumptionsTitle}
        </button>
        {assumptionsOpen && (
          <dl data-testid="results-assumptions" className="mt-1 text-[17px]">
            <Assumption label={UI.resultsAssumptionBill} value={`${money(monthlyBillUsd)}/mo`} />
            <Assumption
              label={UI.resultsAssumptionOffset}
              value={`${Math.round(Math.min(1, Math.max(0, offsetFraction)) * 100)}%`}
            />
            <Assumption label={UI.resultsAssumptionInflation} value={`${inflationPct}%`} />
            <Assumption
              label={UI.resultsAssumptionDegradation}
              value={`${model.assumptions.degradationPctPerYear}%`}
            />
            <Assumption
              label={UI.resultsAssumptionHorizon}
              value={String(model.assumptions.horizonYears)}
            />
            <Assumption
              label={UI.resultsAssumptionPrice}
              value={money(model.systemPriceUsd)}
            />
            <Assumption
              label={UI.resultsAssumptionFinancing}
              value={UI.resultsAssumptionNoFinancing}
            />
            <p className="pt-2 text-[16px] leading-snug text-neutral-600">
              {UI.resultsAssumptionCash}
            </p>
          </dl>
        )}
      </div>
    </section>
  );
}
