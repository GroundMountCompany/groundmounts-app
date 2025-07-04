'use client'

import { cn } from '@/lib/utils';
import Step2Form from './Step2Form';
// import Step4Summary from './Step4Summary';
import MapDrawTool from './MapDrawTool';
import { useQuoteContext } from '@/contexts/quoteContext';
import { JSX, useState } from 'react';
import { StepContent } from '@/types';
import Step3Form from './Step3Form';

export const PageContainer = (): JSX.Element => {
  const { currentStepIndex, setCurrentStepIndex } = useQuoteContext();
  const [showForm, setShowForm] = useState(false)

  const stepContent: StepContent[] = [{
    label: "Step 1 - Information",
    title: "Property Location and Information",
    description: "Let's get started by locating your home and the ideal spot for your solar panels."
  },{
    label: "Step 2 - Energy Calculations",
    title: "Energy Consumption and Offset",
    description: "Tell us about your energy usage to determine the perfect solar panel system size for your needs."
  },{
    label: "Step 3 - Your Custom groundmount is ready!",
    description: "Enter your best email and phone number, and we'll send the quote in seconds.",
  },
  // {
  //   label: "Step 4 - Let's schedule a call",
  //   title: "Book A Call",
  //   description: "Free consultation 30 mins about your plan, Book now"
  // }
];

  const handleClickStep = (index: number): void => {
    setCurrentStepIndex(index);
  };

  return (
    <>
      <div className="flex flex-row">
        {/* step progress section */}
        <div className={cn("flex flex-row gap-4", {
          'lg:pl-[29px]': currentStepIndex === 1,
          'lg:pl-[40px]': [2,3].includes(currentStepIndex),
        })}>
          {Array.from({ length: stepContent.length }, (_, index) => (
            <div key={index} className={cn("h-[5px] w-[37px] cursor-pointer", {
              'bg-custom-primary': index <= currentStepIndex,
              'bg-neutral-200': index > currentStepIndex,
            })}
              onClick={() => handleClickStep(index)}
            />
          ))}
        </div>
      </div>
      <div className={cn("flex flex-col lg:flex-row lg:flex-wrap", {
        'lg:justify-between': currentStepIndex === 3,
      })}>
        {/* step content section */}
        {stepContent.map((step, index) => {
          if (index !== currentStepIndex) return null;
          return (
            <div key={index} className={cn("w-full", {
              'lg:w-[542px] lg:pl-[29px]': currentStepIndex === 1,
              'lg:w-[630px]': currentStepIndex === 3,
              'lg:pl-[40px]': [2,3].includes(currentStepIndex),
            })}>
              <div>
                {
                  currentStepIndex === 1?
                  <>
                  {
                    showForm?
                    <>
                      <p className='text-lg leading-[19.8px] mt-6'>{step.label}</p>
                      <h3 className='text-4xl font-medium leading-[41.6px] mt-4'>{step.title}</h3>
                      <p className='text-lg mt-4'>{step.description}</p>
                    </>
                    :null
                  }
                  </>
                  :
                  <>
                    <p className='text-lg leading-[19.8px] mt-6'>{step.label}</p>
                    <h3 className='text-4xl font-medium leading-[41.6px] mt-4'>{step.title}</h3>
                    {
                      currentStepIndex === 2?
                      <>
                        <h3 className='text-2xl font-medium leading-[41.6px] mt-4'>What to expect:</h3>
                        <ul className="mb-3">
                            <li>Detailed price breakdown.</li>
                            <li>Tax credit amount.</li>
                            <li>Material List.</li>
                            <li>Option to book a free call with a professional.</li>
                        </ul>
                      </>
                      :null
                    }
                    <p className='text-lg mt-4'>{step.description}</p>
                  </>
                }
                {currentStepIndex === 1 && <Step2Form showForm={showForm} setShowForm={setShowForm} />}
                {/* {currentStepIndex === 2 && <Step3Content />} */}
                {currentStepIndex === 2 && <Step3Form />}
                {/* {currentStepIndex === 3 && <Step4Form />} */}
              </div>
            </div>
          );
        })}
        <div className={cn("mt-10 w-full", {
          'hidden': [2,3].includes(currentStepIndex),
          'lg:ml-[80px] grow shrink-0 basis-1/2': currentStepIndex === 1
        })}>
          <MapDrawTool />
        </div>
        {/* {currentStepIndex === 1 &&
        <div className='w-full py-[80px] px-10'>
          <Step2Table />
        </div>} */}
        {/* {currentStepIndex === 3 &&
        <div className='w-full lg:w-[515px] pr-0 lg:pr-10 lg:block hidden'>
          <Step4Summary />
        </div>
        } */}
      </div>
    </>
  )
}
