"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import * as Slider from "@radix-ui/react-slider";
import "./sliderStyle.css";
import Button from "@/components/common/Button";
import { useQuoteContext } from "@/contexts/quoteContext";
import Image from "next/image";
import { estimateMonthlyKWh, kWFromMonthlyKWh, panelsFromkW } from "@/lib/solar";
import MapSlot from "@/components/map/MapSlot";
import { captureAndAdvance } from "@/lib/leadPayload";
import { autoPlaceArray } from "@/lib/geo/place";
import { scheduleAutoPlacement } from "@/lib/geo/placementScheduler";
import { footprintFt } from "@/lib/geo/array";
import { percentOfSouth, TX_FALLBACK_CURVE } from "@/lib/production";
import { slopeAt } from "@/lib/slope";
import { useQuoteStore } from "@/store/quoteStore";
import { mapRef } from "@/store/mapRefs";

interface Step2FormProps {
  showForm: boolean;
  setShowForm: React.Dispatch<React.SetStateAction<boolean>>;
}

function Step2Form({
  showForm,
  setShowForm
}: Step2FormProps) {
  const {
    hydrated,
    setQuotation,
    setTotalPanels,
    totalPanels,
    avgValue,
    highestValue,
    percentage,
    additionalCost,
    setPercentage,
    setAvgValue,
    setHighestValue,
    electricalMeterPosition,
    ensureMeterFromStorage,
    arrayCenter,
    azimuth,
    panelTier,
    trenchFeet,
    slopePercent,
    slopeTier,
  } = useQuoteContext();
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const [meterBtn, setMeterBtn] = useState<boolean>(false);

  // Recompute target panels whenever bill/offset changes using new solar helpers
  const computedPanels = useMemo(() => {
    const monthlyKWh = estimateMonthlyKWh(Number(avgValue || 0));
    const targetKWh = monthlyKWh * (Number(percentage || 0) / 100);
    const dcKW = kWFromMonthlyKWh(targetKWh);
    return panelsFromkW(dcKW);
  }, [avgValue, percentage]);

  useEffect(() => {
    if (computedPanels && computedPanels !== totalPanels) {
      setTotalPanels(computedPanels);
    }
  }, [computedPanels, totalPanels, setTotalPanels]);

  // Keep existing quotation calculation logic
  useEffect(() => {
    if (totalPanels > 0) {
      const panelWattage: number = 435; // Mission Solar MSX10-435HN0B
      const costPerWatt: number = 3.50;
      const systemSizeWatts: number = totalPanels * panelWattage;
      const baseQuotation: number = systemSizeWatts * costPerWatt;
      setQuotation(baseQuotation);
    }
  }, [totalPanels, setQuotation]);

  const shouldContinueButtonDisabled: boolean = useMemo(() => {
    return avgValue === 0 || totalPanels === 0;
  }, [avgValue, totalPanels]);

  useEffect(() => {
    if (electricalMeterPosition) {
      setMeterBtn(true)
    }
  }, [electricalMeterPosition])

  // The one way out of this step, shared with the mobile sticky CTA so the map
  // is always captured first.
  const handleContinue = useCallback(() => captureAndAdvance(4), []);

  // Drop the array on entry: south-facing, clear of the meter, off the house.
  //
  // Gated on map 'idle' because `building` features only exist once tiles have
  // rendered. Querying too early returns an empty set and the array lands on
  // the house, so an empty result buys one retry on the next idle before we
  // accept it as "genuinely no buildings here".
  useEffect(() => {
    if (!electricalMeterPosition || totalPanels <= 0 || arrayCenter) return;

    const map = mapRef.current;
    if (!map) return;

    return scheduleAutoPlacement(
      {
        isIdle: () => map.isStyleLoaded() && !map.isMoving(),
        onIdle: (fn) => map.on('idle', fn),
        offIdle: (fn) => map.off('idle', fn),
        queryObstacles: () => {
          if (!map.isStyleLoaded()) return [];
          const canvas = map.getCanvas();
          try {
            return map
              .queryRenderedFeatures(
                [
                  [0, 0],
                  [canvas.clientWidth, canvas.clientHeight],
                ],
                { layers: ['building'] }
              )
              .filter((f) => f.geometry?.type === 'Polygon') as never[];
          } catch {
            // Style has no `building` layer (satellite-only tiles at low zoom).
            return [];
          }
        },
      },
      (obstacles) => {
        if (useQuoteStore.getState().arrayCenter) return;
        const { center } = autoPlaceArray({
          meter: electricalMeterPosition,
          panelCount: totalPanels,
          tier: panelTier,
          azimuth: 180,
          obstacles,
        });
        useQuoteStore.getState().setArrayCenter(center);
      }
    );
  }, [electricalMeterPosition, totalPanels, panelTier, arrayCenter]);

  // First slope read. Subsequent reads are triggered by dragend inside MapStage.
  useEffect(() => {
    if (!arrayCenter || slopePercent !== null) return;
    let cancelled = false;
    slopeAt(mapRef.current, arrayCenter).then((r) => {
      if (!cancelled) useQuoteStore.getState().setSlope(r.percent, r.tier);
    });
    return () => {
      cancelled = true;
    };
  }, [arrayCenter, slopePercent]);

  const footprint = useMemo(
    () => footprintFt(totalPanels, panelTier),
    [totalPanels, panelTier]
  );
  const southPct = useMemo(
    () => percentOfSouth(TX_FALLBACK_CURVE, azimuth),
    [azimuth]
  );

  // Restore meter position from storage on mount if missing
  useEffect(() => {
    ensureMeterFromStorage();
  }, [ensureMeterFromStorage]);

  // TEMP debug – remove later
  useEffect(() => {
    console.log("[CALCS] hydrated:", hydrated, "meter:", electricalMeterPosition);
  }, [hydrated, electricalMeterPosition?.[0], electricalMeterPosition?.[1]]);

  return (
    <div>
      {
        !showForm ? (
          <div className="mb-6">
            <div className="flex gap-2">
              <Image
                src="/images/meter-img.PNG"
                className="w-1/2"
                width={210}
                height={52}
                alt="Meter1"
              />
              <Image
                src="/images/meter-img2.PNG"
                className="w-1/2"
                alt="Meter2"
                width={210}
                height={52}
              />
            </div>
            <div className="mt-8 p-4 border border-[#638ED2] bg-[#F0F6FF] rounded-lg flex flex-row justify-between items-start">
              <div className="flex items-start w-full">
                <svg className="w-5 h-5 mr-2 lg:mr-3" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.51 3.85L11.57 0.42C10.6 -0.14 9.4 -0.14 8.42 0.42L2.49 3.85C1.52 4.41 0.919998 5.45 0.919998 6.58V13.42C0.919998 14.54 1.52 15.58 2.49 16.15L8.43 19.58C9.4 20.14 10.6 20.14 11.58 19.58L17.52 16.15C18.49 15.59 19.09 14.55 19.09 13.42V6.58C19.08 5.45 18.48 4.42 17.51 3.85ZM9.25 5.75C9.25 5.34 9.59 5 10 5C10.41 5 10.75 5.34 10.75 5.75V11C10.75 11.41 10.41 11.75 10 11.75C9.59 11.75 9.25 11.41 9.25 11V5.75ZM10.92 14.63C10.87 14.75 10.8 14.86 10.71 14.96C10.52 15.15 10.27 15.25 10 15.25C9.87 15.25 9.74 15.22 9.62 15.17C9.49 15.12 9.39 15.05 9.29 14.96C9.2 14.86 9.13 14.75 9.07 14.63C9.02 14.51 9 14.38 9 14.25C9 13.99 9.1 13.73 9.29 13.54C9.39 13.45 9.49 13.38 9.62 13.33C9.99 13.17 10.43 13.26 10.71 13.54C10.8 13.64 10.87 13.74 10.92 13.87C10.97 13.99 11 14.12 11 14.25C11 14.38 10.97 14.51 10.92 14.63Z" fill="#214A8B"/>
                </svg>
                <p className="shrink grow basis-0 text-sm leading-[21px] text-custom-primary">Please place your electrical meter on the map before continuing</p>
              </div>
            </div>
          </div>
        ):
        <>
          {/* Bill questions - ABOVE the map */}
          <div className='flex flex-col lg:flex-row gap-4 mb-6'>
            <div className="flex flex-col relative">
              <label htmlFor="electricity-usage" className="text-xs font-medium uppercase">Average electricity Bill</label>
              <input
                type="tel"
                id="electricity-usage"
                className="w-full mt-2 p-4 border outline-none shadow-sm text-neutral-700 rounded-full text-sm font-medium h-[53px] border-neutral-300 bg-white"
                value={avgValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (!/^\d*$/.test(e.target.value) && e.target.value !== 'Backspace' && e.target.value !== 'Delete' && e.target.value !== 'ArrowLeft' && e.target.value !== 'ArrowRight' && e.target.value !== 'Tab') {
                    e.preventDefault();
                    return;
                  } else {
                    setAvgValue(Number(e.target.value));
                  }
                }}
              />
              <img src="/images/icons/dollar.png" alt="dollar icon" className="absolute right-4 bottom-[18px]" />
            </div>
            <div className="flex flex-col relative">
              <label htmlFor="electricity-usage" className="text-xs font-medium uppercase">Highest monthly Bill</label>
              <input
                type="tel"
                id="electricity-usage"
                className="w-full mt-2 p-4 border outline-none shadow-sm text-neutral-700 rounded-full text-sm font-medium h-[53px] border-neutral-300 bg-white"
                value={highestValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (!/^\d*$/.test(e.target.value) && e.target.value !== 'Backspace' && e.target.value !== 'Delete' && e.target.value !== 'ArrowLeft' && e.target.value !== 'ArrowRight' && e.target.value !== 'Tab') {
                    e.preventDefault();
                    return;
                  } else {
                    setHighestValue(Number(e.target.value));
                  }
                }}
              />
              <img src="/images/icons/dollar.png" alt="dollar icon" className="absolute right-4 bottom-[18px]" />
            </div>
          </div>
          <div className="flex flex-col mb-6 relative">
            <label htmlFor="electricity-usage" className="text-xs font-medium">How much of your bill do you want to offset?</label>
            <div className="w-full mt-2 mb-[10px] text-sm text-custom-primary relative h-[20px]">
              <span className="absolute left-0 top-0">0%</span>
              <span className="absolute top-0" style={{ left: `calc(33.3% - 8px)` }}>50%</span>
              <span className="absolute top-0" style={{ left: `calc(66.7% - 20px)` }}>100%</span>
              <span className="absolute top-0" style={{ left: `calc(100% - 32px)` }}>150%</span>
            </div>
            <Slider.Root
              className="SliderRoot relative"
              value={[percentage]}
              max={150}
              step={1}
              aria-label="Volume"
              onValueChange={(value: number[]) => setPercentage(value[0])}
            >
              <Slider.Track className="SliderTrack">
                <Slider.Range className="SliderRange" />
              </Slider.Track>
              <Slider.Thumb
                className="SliderThumb"
                aria-label="Volume"
                onPointerEnter={() => setShowTooltip(true)}
                onPointerLeave={() => setShowTooltip(false)}
              />
              <div
                className={cn("absolute bottom-[26px] text-xs font-medium bg-white px-2 py-1 rounded-lg shadow-sm border border-neutral-200", {
                  'hidden': !showTooltip,
                })}
                style={{ left: `calc(${percentage/150*100}% + ${0 - percentage/150*42}px)` }}
              >
                {percentage}%
              </div>
            </Slider.Root>
            <div className="w-full flex flex-row justify-between mt-[10px] text-sm text-custom-primary">
              <span>MIN</span>
              <span>MAX</span>
            </div>
          </div>
        </>
      }

      {/* Map - render unconditionally */}
      <div className="mb-3">
        <div className="relative h-[46svh] min-h-[280px] w-full overflow-hidden rounded-xl border border-neutral-200">
          <MapSlot className="absolute inset-0" />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Drag the panels where you want them. Use the round handle to turn them.
        </p>
      </div>

      {/* Live design readout */}
      {totalPanels > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Array size</p>
            <p className="text-sm font-semibold text-neutral-900">
              {Math.round(footprint.widthFt)} x {Math.round(footprint.depthFt)} ft
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Trench</p>
            <p className="text-sm font-semibold text-neutral-900">{trenchFeet} ft</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Facing</p>
            <p className="text-sm font-semibold text-neutral-900">
              {Math.round(azimuth)}&deg; &middot; {southPct}%
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Slope</p>
            <p className="text-sm font-semibold text-neutral-900">
              {slopePercent === null ? 'Checking...' : `${slopePercent}% ${slopeTier}`}
            </p>
          </div>
        </div>
      )}

      {azimuth !== 180 && (
        <p className="mb-4 text-sm text-neutral-700">
          South makes the most power in Texas. Facing this way you get about{' '}
          <span className="font-semibold">{southPct}%</span> of that. Turn it back if
          your land allows.
        </p>
      )}

      {/* Trenching distance display - below the map */}
      {showForm && additionalCost > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium leading-[18px] tracking-[6%] uppercase">trenching to meter distance</p>
          <div className="mt-2 py-2 px-4 rounded-lg bg-[#F0F6FF]">
            <div className="flex flex-row justify-between items-center">
              <div className="flex flex-1 grow shrink-0 border-neutral-300 pr-4 h-[37px] items-center">
                <p className="text-sm leading-[21px] font-medium text-custom-primary">Distance: {trenchFeet} feet</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Continue button */}
      {
        !electricalMeterPosition || !showForm?
        <Button
        className="mt-4"
        type="primary"
        size="big"
        onClick={() => setShowForm(true)}
        disabled={!meterBtn}
      >
        Continue
      </Button>
      :
      <Button
        className="mt-4"
        type="primary"
        size="big"
        onClick={handleContinue}
        disabled={shouldContinueButtonDisabled}
      >
        Continue
      </Button>
      }
    </div>
  )
}

export default React.memo(Step2Form);
