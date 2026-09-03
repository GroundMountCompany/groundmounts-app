'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MapStage, { type MapMode } from '@/components/map/MapCanvas';
import MapSlot from '@/components/map/MapSlot';
import BottomSheet, { type Snap } from '@/components/shell/BottomSheet';
import PrimaryButton from '@/components/shell/PrimaryButton';
import { STEPS, UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { useStepUrl, MAX_STEP } from '@/lib/useStepUrl';
import { captureAndAdvance } from '@/lib/leadPayload';
import { useSizing } from './steps/useSizing';
import { fitDesignView, rearmDesignFraming } from '@/components/map/MapCanvas';

import { Suspense } from 'react';
import AddressInput from './AddressInput';
import Step1Property from './steps/Step1Property';
import Step2Power from './steps/Step2Power';
import Step3Meter from './steps/Step3Meter';
import Step4Design from './steps/Step4Design';
import Step5Options from './steps/Step5Options';
import Step6Quote from './steps/Step6Quote';

/** Which face the shared map shows per step. */
const MAP_MODE: MapMode[] = ['address', 'hidden', 'place-meter', 'design', 'hidden', 'hidden'];

/** Steps that show the map at all. */
const SHOWS_MAP = MAP_MODE.map((m) => m !== 'hidden');

/**
 * Steps whose work happens on the map. These open at peek so the pin, meter or
 * array is not sitting underneath the sheet — the meter step at half hid the
 * marker the customer was meant to drag.
 */
const MAP_FIRST_STEPS = [0, 2, 3];

export default function FunnelShell() {
  useStepUrl();
  useSizing();

  const step = useQuoteStore((s) => s.currentStepIndex);
  const setStep = useQuoteStore((s) => s.setCurrentStepIndex);
  const address = useQuoteStore((s) => s.address);
  const coordinates = useQuoteStore((s) => s.coordinates);
  const avgValue = useQuoteStore((s) => s.avgValue);
  const meter = useQuoteStore((s) => s.electricalMeterPosition);
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const hydrated = useQuoteStore((s) => s.hydrated);

  const [snap, setSnap] = useState<Snap>('peek');

  const copy = STEPS[Math.min(step, MAX_STEP)];
  const showsMap = SHOWS_MAP[Math.min(step, MAX_STEP)];

  // The page itself must never scroll: the map is the full viewport and only
  // the sheet's content moves.
  useEffect(() => {
    const { body, documentElement } = document;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prev;
      documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    setSnap(MAP_FIRST_STEPS.includes(step) ? 'peek' : 'half');
    // Arriving at the design step frames the array again, however the customer
    // got here — forward, back, or a reload.
    if (step === 3) rearmDesignFraming();
  }, [step]);

  const blocked = useMemo(() => {
    if (step === 0) return address.trim() === '' || coordinates.latitude === 0;
    if (step === 1) return avgValue <= 0;
    if (step === 2) return meter === null;
    if (step === 3) return totalPanels <= 0;
    return false;
  }, [step, address, coordinates, avgValue, meter, totalPanels]);

  const advance = useCallback(() => {
    if (blocked) return;
    // Leaving the design step always captures the map first.
    if (step === 3) void captureAndAdvance(4);
    else if (step < MAX_STEP) setStep(step + 1);
  }, [blocked, step, setStep]);

  const body = [
    <Step1Property key="1" />,
    <Step2Power key="2" />,
    <Step3Meter key="3" />,
    <Step4Design key="4" />,
    <Step5Options key="5" />,
    <Step6Quote key="6" />,
  ][Math.min(step, MAX_STEP)];

  const peek = (
    <div className="space-y-3">
      <ProgressRow step={step} onPick={setStep} />
      <div>
        <h2 className="text-[20px] font-semibold leading-tight text-neutral-900">{copy.title}</h2>
        <p className="mt-0.5 text-[16px] leading-snug text-neutral-600">{copy.intro}</p>
      </div>
      {step < MAX_STEP && (
        <PrimaryButton onClick={advance} disabled={blocked}>
          {copy.cta}
        </PrimaryButton>
      )}
    </div>
  );

  return (
    <div
      data-testid="funnel"
      // Set once the persisted store has rehydrated. Controlled inputs reset to
      // their store value on hydration, so anything typed before this lands is
      // discarded — tests wait for it rather than racing.
      data-hydrated={hydrated ? 'true' : 'false'}
      // Click-through by default. The map canvas is a body-level portal beneath
      // this shell, so anything that should catch a touch opts back in with
      // pointer-events-auto; everything else lets the map have it.
      className="pointer-events-none fixed inset-0 z-10 flex flex-col overflow-hidden md:flex-row"
    >
      {/* Map: full-bleed on a phone, the left 60% on a desktop. */}
      {/* The map canvas is a body-level portal underneath this shell, so the map
          column must let touches through to it. Anything drawn on top of the map
          re-enables pointer events for itself. */}
      <div
        className={`relative min-h-0 flex-1 md:w-[60%] md:flex-none ${
          showsMap ? 'pointer-events-none' : 'bg-neutral-100'
        }`}
      >
        {showsMap ? (
          <>
            <MapSlot className="absolute inset-0" />
            {step === 0 && (
              <div className="pointer-events-auto absolute inset-x-0 top-0 z-20 px-4 pt-[max(12px,env(safe-area-inset-top))]">
                <Suspense fallback={<div className="h-14" />}>
                  <AddressInput />
                </Suspense>
              </div>
            )}
            {step === 3 && (
              <button
                type="button"
                data-testid="find-panels"
                onClick={() => fitDesignView()}
                className="pointer-events-auto absolute right-3 top-3 z-20 min-h-[48px] rounded-xl bg-white/95 px-4 text-[16px] font-semibold text-neutral-900 shadow-md"
              >
                {UI.findPanels}
              </button>
            )}
          </>
        ) : (
          <div className="pointer-events-auto flex h-full items-center justify-center px-8 text-center">
            <p className="text-[17px] text-neutral-500">{copy.intro}</p>
          </div>
        )}
      </div>

      {/* Controls: bottom sheet on a phone, right 40% on a desktop. */}
      <div className="pointer-events-auto md:flex md:w-[40%] md:flex-col md:overflow-y-auto md:border-l md:border-neutral-200 md:px-6 md:py-6">
        <BottomSheet snap={snap} onSnapChange={setSnap} peek={peek}>
          {body}
        </BottomSheet>
      </div>

      <MapStage mode={MAP_MODE[Math.min(step, MAX_STEP)]} />
    </div>
  );
}

/** Back-only progress. Forward taps do nothing. */
function ProgressRow({ step, onPick }: { step: number; onPick: (n: number) => void }) {
  return (
    <div className="-my-3 flex gap-1.5" aria-label={UI.progressLabel}>
      {STEPS.map((s, i) => (
        <button
          key={s.label}
          type="button"
          data-testid={`progress-step-${i}`}
          aria-label={`${s.label}${i < step ? '' : UI.progressNotYet}`}
          aria-disabled={i >= step}
          onClick={() => i < step && onPick(i)}
          // The bar stays thin; the tappable box around it does not. A 6px
          // target is not something a 60-year-old can hit on a moving bus.
          className={`flex h-12 flex-1 items-center ${
            i < step ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          <span
            className={`h-1.5 w-full rounded-full ${
              i <= step ? 'bg-neutral-900' : 'bg-neutral-200'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export { MAP_MODE };
export type { Snap };
