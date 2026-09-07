'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { UI } from '@/config/copy';
import { DEMAND_CALLOUTS, ERCOT_FORECAST, HISTORY } from '@/config/history';
import { priceCallouts } from '@/lib/history';

/** How many x-axis labels fit on a 390px screen without turning to mush. */
const MAX_TICKS = 6;

const DEMAND_LABEL: Record<string, string> = {
  electrification: UI.historyDemandElectrification,
  evs: UI.historyDemandEvs,
  dataCentres: UI.historyDemandDataCentres,
};

/**
 * What has already happened, above the forecast.
 *
 * The payback chart is a projection and reads like one — a customer can
 * reasonably discount it. This is the record: what Texas homes have paid, and
 * how much electricity the state has used, over the same twenty-five years the
 * projection covers. It is the part nobody argues with, and it is why the
 * inflation slider above it is not a made-up number.
 *
 * Two series on two axes, because they are in different units and the point is
 * that they move together.
 */
export default function HistoryChart() {
  const { rows, callouts, priceMax, demandMax } = useMemo(() => {
    const lastActual = HISTORY[HISTORY.length - 1];

    /*
      One row per year. The forecast is a separate key, so Recharts draws it as
      its own dashed line rather than continuing the demand area — the two are
      different measurements and must not look like one series.

      The dashed line starts at ERCOT's own 2025 actual, which is why
      ERCOT_FORECAST carries that year: every point on it is ERCOT net energy
      for load, and none of it is the EIA figure underneath.
    */
    const forecastByYear = new Map(ERCOT_FORECAST.map((f) => [f.year, f.ercotTwh]));
    const combined = [
      ...HISTORY.map((r) => ({
        year: r.year,
        priceCents: r.priceCents,
        demandTwh: r.demandTwh,
        forecastTwh: forecastByYear.get(r.year) ?? null,
      })),
      ...ERCOT_FORECAST.filter((f) => f.year > lastActual.year).map((f) => ({
        year: f.year,
        priceCents: null as number | null,
        demandTwh: null as number | null,
        forecastTwh: f.ercotTwh,
      })),
    ];

    return {
      rows: combined,
      callouts: priceCallouts(),
      priceMax: Math.ceil(Math.max(...HISTORY.map((r) => r.priceCents)) / 5) * 5,
      demandMax:
        Math.ceil(
          Math.max(...ERCOT_FORECAST.map((f) => f.ercotTwh)) / 200
        ) * 200,
    };
  }, []);

  const step = Math.ceil(rows.length / MAX_TICKS);
  const ticks = rows
    .filter((_, i) => i % step === 0 || i === rows.length - 1)
    .map((r) => r.year);

  return (
    <section data-testid="history-chart" className="space-y-2">
      <h4 className="text-[19px] font-semibold text-neutral-900">{UI.historyTitle}</h4>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e5e5e5" vertical={false} />
            <XAxis
              dataKey="year"
              ticks={ticks}
              tick={{ fontSize: 17, fill: '#525252' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e5e5' }}
            />
            {/* Demand behind, muted: it is the context, not the argument. */}
            <YAxis
              yAxisId="demand"
              orientation="right"
              width={52}
              domain={[0, demandMax]}
              tick={{ fontSize: 17, fill: '#a3a3a3' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => String(v)}
            />
            <YAxis
              yAxisId="price"
              width={44}
              domain={[0, priceMax]}
              tick={{ fontSize: 17, fill: '#525252' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}¢`}
            />

            <Area
              yAxisId="demand"
              type="monotone"
              dataKey="demandTwh"
              fill="#e5e7eb"
              stroke="#d1d5db"
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              yAxisId="demand"
              type="monotone"
              dataKey="forecastTwh"
              stroke="#9ca3af"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="priceCents"
              stroke="#dc2626"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />

            {/* Plain labels on the recent demand years. They name things that
                are happening; they are not a decomposition of the curve. */}
            {DEMAND_CALLOUTS.map((c) => {
              const row = HISTORY.find((r) => r.year === c.year);
              if (!row?.demandTwh) return null;
              return (
                <ReferenceDot
                  key={c.key}
                  yAxisId="demand"
                  x={c.year}
                  y={row.demandTwh}
                  r={3}
                  fill="#6b7280"
                  stroke="none"
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend and annotations in words, below the chart, where they have
          room to be read. Recharts' own labels would be the field names. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[17px]">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-1 w-5 rounded bg-[#dc2626]" />
          <span className="text-neutral-700">
            {UI.historyPriceLabel} ({UI.historyPriceAxis})
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-5 rounded-sm bg-[#e5e7eb]" />
          <span className="text-neutral-700">
            {UI.historyDemandLabel} ({UI.historyDemandAxis})
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-0 w-5 border-t-2 border-dashed border-[#9ca3af]"
          />
          <span className="text-neutral-700">{UI.historyForecastLabel}</span>
        </span>
      </div>

      <ul data-testid="history-callouts" className="space-y-0.5 text-[17px] text-neutral-700">
        {callouts.map((c, i) => (
          <li key={`${c.fromYear}-${c.toYear}`}>
            <span data-testid={`history-rate-${c.fromYear}`}>
              {i === 0 ? UI.historyAbout : UI.historyOver} {c.pct}% {UI.historyRateSuffix}
            </span>
            , {c.fromYear}&ndash;{c.toYear}
          </li>
        ))}
      </ul>

      <p data-testid="history-demand-callouts" className="text-[17px] text-neutral-500">
        {DEMAND_CALLOUTS.map((c) => DEMAND_LABEL[c.key]).join(' · ')}
      </p>

      <p data-testid="history-caption" className="text-[17px] leading-snug text-neutral-800">
        {UI.historyCaption}
      </p>
    </section>
  );
}
