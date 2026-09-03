'use client'

import { cn } from '@/lib/utils';
import Step2Form from './Step2Form';
import { useQuoteContext } from '@/contexts/quoteContext';
import { JSX } from 'react';
import Step3Form from './Step3Form';
import Step1Screen from './Step1Screen';
import Step2MeterIntro from './Step2MeterIntro';
import Step2MeterMap from './Step2MeterMap';
import MapStage, { type MapMode } from '@/components/map/MapCanvas';
import { captureAndAdvance } from '@/lib/leadPayload';

enum QuoteStep {
  Address = 0,
  MeterIntro = 1,
  MeterMap = 2,
  EnergyCalcs = 3,
}

export const PageContainer = (): JSX.Element => {
  const { currentStepIndex, setCurrentStepIndex, shouldContinueButtonDisabled, electricalMeterPosition } = useQuoteContext();
  
  const currentStep = currentStepIndex as QuoteStep;

  const isContinueDisabled = (() => {
    if (currentStep === QuoteStep.MeterMap) {
      return !electricalMeterPosition; // must place meter to continue
    }
    return shouldContinueButtonDisabled;
  })();

  // Which face the shared map shows for this step. 'hidden' keeps the instance
  // alive but off-screen; the map is never unmounted mid-funnel.
  const mapMode: MapMode =
    currentStep === QuoteStep.Address
      ? 'address'
      : currentStep === QuoteStep.MeterMap
        ? 'place-meter'
        : currentStep === QuoteStep.EnergyCalcs
          ? 'design'
          : 'hidden';

  const handleContinue = () => {
    if (currentStep === QuoteStep.Address) setCurrentStepIndex(QuoteStep.MeterIntro);
    else if (currentStep === QuoteStep.MeterIntro) setCurrentStepIndex(QuoteStep.MeterMap);
    else if (currentStep === QuoteStep.MeterMap) setCurrentStepIndex(QuoteStep.EnergyCalcs);
    // Leaving the design step ALWAYS goes through the capture path, whichever
    // button was tapped. This sticky CTA used to bypass it, so phone leads
    // arrived with no screenshot.
    else if (currentStep === QuoteStep.EnergyCalcs) void captureAndAdvance(4);
    else setCurrentStepIndex(currentStepIndex + 1);
  };

  /**
   * Progress segments go backwards only.
   *
   * They used to call setCurrentStepIndex with any index, which both let the
   * user skip ahead past validation and bypassed the design-step capture. A
   * forward tap now does nothing; forward movement is only ever via Continue.
   */
  const handleClickStep = (index: number): void => {
    if (index >= currentStepIndex) return;
    setCurrentStepIndex(index);
  };

  // Every branch renders below renderStep(); the shared map wraps them all.
  const renderStep = (): JSX.Element => {
  if (currentStep === QuoteStep.Address) {
    return (
      <>
        <Step1Screen />
        {/* Mobile sticky CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/90 backdrop-blur px-4 py-3 md:hidden">
          <button
            type="button"
            data-testid="mobile-continue"
            onClick={handleContinue}
            disabled={isContinueDisabled}
            className={cn(
              "w-full h-12 rounded-xl text-base font-semibold shadow active:scale-[.99] hover:opacity-95",
              isContinueDisabled 
                ? "bg-gray-400 text-white cursor-not-allowed" 
                : "bg-black text-white"
            )}
          >
            Continue
          </button>
        </div>
      </>
    );
  }

  if (currentStep === QuoteStep.MeterIntro) {
    return <Step2MeterIntro />;
  }

  if (currentStep === QuoteStep.MeterMap) {
    return <Step2MeterMap />;
  }

  // Energy Calculations step (formerly Step 2)
  if (currentStep === QuoteStep.EnergyCalcs) {
    return (
      <>
        <div className="pb-20 md:pb-0">
          <div className="flex flex-row">
            {/* step progress section */}
            <div className="flex flex-row gap-4 lg:pl-[29px]">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  role="button"
                  aria-label={`Step ${index + 1}`}
                  aria-disabled={index >= currentStepIndex}
                  data-testid={`progress-step-${index}`}
                  className={cn("h-[5px] w-[37px]", {
                    'bg-custom-primary': index <= currentStepIndex,
                    'bg-neutral-200': index > currentStepIndex,
                    // Only completed steps are reachable, so only they look tappable.
                    'cursor-pointer': index < currentStepIndex,
                    'cursor-default': index >= currentStepIndex,
                  })}
                  onClick={() => handleClickStep(index)}
                />
              ))}
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row lg:flex-wrap">
            <div className="w-full lg:w-[542px] lg:pl-[29px]">
              <p className='text-lg leading-[19.8px] mt-6'>Step 4 - Energy Calculations</p>
              <h3 className='text-4xl font-medium leading-[41.6px] mt-4'>Energy Consumption and Offset</h3>
              <p className='text-lg mt-4'>Tell us about your energy usage to determine the perfect solar panel system size for your needs.</p>
              <Step2Form showForm={true} setShowForm={() => {}} />
            </div>
          </div>
        </div>

        {/* Mobile sticky CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/90 backdrop-blur px-4 py-3 md:hidden">
          <button
            type="button"
            data-testid="mobile-continue"
            onClick={handleContinue}
            disabled={isContinueDisabled}
            className={cn(
              "w-full h-12 rounded-xl text-base font-semibold shadow active:scale-[.99] hover:opacity-95",
              isContinueDisabled 
                ? "bg-gray-400 text-white cursor-not-allowed" 
                : "bg-black text-white"
            )}
          >
            Continue
          </button>
        </div>
      </>
    );
  }

  // Final form step (Step 5)
  return (
    <>
      <div className="pb-20 md:pb-0">
        <div className="flex flex-row">
          {/* step progress section */}
          <div className="flex flex-row gap-4 lg:pl-[40px]">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                role="button"
                aria-label={`Step ${index + 1}`}
                aria-disabled={index >= currentStepIndex}
                data-testid={`progress-step-${index}`}
                className={cn("h-[5px] w-[37px]", {
                  'bg-custom-primary': index <= currentStepIndex,
                  'bg-neutral-200': index > currentStepIndex,
                  // Only completed steps are reachable, so only they look tappable.
                  'cursor-pointer': index < currentStepIndex,
                  'cursor-default': index >= currentStepIndex,
                })}
                onClick={() => handleClickStep(index)}
              />
            ))}
          </div>
        </div>
        
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:justify-between">
          <div className="w-full lg:w-[630px] lg:pl-[40px]">
            <p className='text-lg leading-[19.8px] mt-6'>Step 5 - Your Custom groundmount is ready!</p>
            <h3 className='text-2xl font-medium leading-[41.6px] mt-4'>What to expect:</h3>
            <ul className="mb-3">
              <li>Detailed price breakdown.</li>
              <li>Material list.</li>
              <li>Estimated savings and payback period.</li>
              <li>Option to book a free call with a professional.</li>
            </ul>
            <p className='text-lg mt-4'>Enter your best email and phone number, and we&apos;ll send the quote in seconds.</p>
            <Step3Form />
          </div>
        </div>
      </div>
    </>
  )
  };

  return (
    <>
      {/* One map for the whole funnel, created above the step router so it is
          never torn down and rebuilt between steps. */}
      <MapStage mode={mapMode} />
      {renderStep()}
    </>
  );
}
