"use client"

import { useEffect, useMemo, useState } from "react";
import { cn, updateSheet } from "@/lib/utils";
import * as Slider from "@radix-ui/react-slider";
import "./sliderStyle.css";
import Button from "@/components/common/Button";
import { useQuoteContext } from "@/contexts/quoteContext";
import Image from "next/image";

interface Step2FormProps {
  showForm: boolean;
  setShowForm: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Step2Form({
  showForm,
  setShowForm
}: Step2FormProps) {
  const {
    setCurrentStepIndex,
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
    electricalMeter,
    electricalMeterPosition,
    coordinates,
    quotation
  } = useQuoteContext();
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const [meterBtn, setMeterBtn] = useState<boolean>(false);

  const shouldContinueButtonDisabled: boolean = useMemo(() => {
    return avgValue === 0 || totalPanels === 0 || additionalCost === 0;
  }, [avgValue, totalPanels, additionalCost]);

  useEffect(() => {
    // Step 1: Calculate monthly and yearly consumption
    const perKwhRate: number = 0.18;
    const monthlyConsumption: number = avgValue / perKwhRate;
    const yearlyConsumption: number = monthlyConsumption * 12;
    
    // Step 2: Apply the percentage offset selected by user
    const consumptionToOffset: number = yearlyConsumption * percentage / 100;
    
    // Step 3: Calculate panels needed based on new production rate
    const solarKwhPerPanel: number = 583; // Updated from 1400
    const panelWattage: number = 400; // New constant for panel wattage
    const totalPanelsNeeded: number = consumptionToOffset / solarKwhPerPanel;
    
    // Round to nearest multiple of 4 for rectangular layout
    const roundedPanels = Math.ceil(totalPanelsNeeded / 4) * 4;
    setTotalPanels(roundedPanels);
    
    // Step 4: Calculate system cost based on total watts
    const costPerWatt: number = 3.50;
    const systemSizeWatts: number = roundedPanels * panelWattage;
    const baseQuotation: number = systemSizeWatts * costPerWatt;
    
    // Update states
    setQuotation(baseQuotation);
    // setPercentage(percentage);
    setHighestValue(highestValue);
    // setAvgValue(avgValue);
  }, [avgValue, percentage, setQuotation, setTotalPanels, setPercentage, setHighestValue, setAvgValue]);

  useEffect(() => {
    if (electricalMeterPosition) {
      setMeterBtn(true)
    }
  }, [electricalMeterPosition])
  
  const totalCost = useMemo(() => quotation + (additionalCost || 0), [quotation, additionalCost]);

  const handleContinue = async () => {
    const vals = [{
            col: "G", val: String(avgValue),
          },{
            col: "H", val: String(highestValue),
          },{
            col: "I", val: String(percentage),
          },{
            col: "J", val: "Long: " + coordinates.longitude + ", Lat: " + coordinates.latitude,
          },{
            col: "K", val: String(totalCost),
          },{
            col: "L", val: `Trenching: Distance = ${electricalMeter?.distanceInFeet}ft, Cost = $${additionalCost} ($45/ft)`,
          },{
            col: "M", val: String(Math.floor(totalCost * 0.3)),
          }]
    vals.forEach(async val => {
      await updateSheet(val.col, val.val)
    })
    setCurrentStepIndex(2);
  }

  return (
    <div>
      {
        !showForm ? (
          <div className="mt-10">
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
          <div className='flex flex-col lg:flex-row gap-4 mt-10'>
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
          <div className="flex flex-col mt-8 relative">
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

          {additionalCost > 0 && (
            <div className="mt-10">
              <p className="text-xs font-medium leading-[18px] tracking-[6%] uppercase">trenching to meter distance</p>
              <div className="mt-2 py-2 px-4 rounded-lg bg-[#F0F6FF]">
                <div className="flex flex-row justify-between items-center">
                  <div className="flex flex-1 grow shrink-0 border-neutral-300 pr-4 h-[37px] items-center">
                    <p className="text-sm leading-[21px] font-medium text-custom-primary">Distance: {electricalMeter?.distanceInFeet} feet</p>
                  </div>
                  {/* <p className="flex items-center text-sm font-medium text-neutral-700 leading-[21px] pl-[28.5px]">+ ${additionalCost.toLocaleString()}</p> */}
                </div>
              </div>
              {/* <div className="lg:flex lg:flex-row lg:justify-between lg:items-center mt-2 lg:mt-[9.5px]">
                <p className="w-full lg:w-auto text-sm leading-[21px] inline-flex items-center">
                  <svg width="20" height="21" viewBox="0 0 20 21" className="inline-block mr-2" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10.625 13.7676H11.1667C11.7083 13.7676 12.1583 13.2842 12.1583 12.7009C12.1583 11.9759 11.9 11.8342 11.475 11.6842L10.6333 11.3926V13.7676H10.625Z" fill="#214A8B"/>
                    <path d="M9.97538 2.084C5.37538 2.10067 1.65038 5.84233 1.66705 10.4423C1.68371 15.0423 5.42538 18.7673 10.0254 18.7507C14.6254 18.734 18.3504 14.9923 18.3337 10.3923C18.317 5.79233 14.5754 2.07567 9.97538 2.084ZM11.8837 10.5007C12.5337 10.7257 13.4087 11.209 13.4087 12.7007C13.4087 13.984 12.4004 15.0173 11.167 15.0173H10.6254V15.5007C10.6254 15.8423 10.342 16.1257 10.0004 16.1257C9.65871 16.1257 9.37538 15.8423 9.37538 15.5007V15.0173H9.07538C7.70871 15.0173 6.60038 13.8673 6.60038 12.4507C6.60038 12.109 6.88371 11.8257 7.22538 11.8257C7.56705 11.8257 7.85038 12.109 7.85038 12.4507C7.85038 13.1757 8.40038 13.7673 9.07538 13.7673H9.37538V10.9507L8.11705 10.5007C7.46705 10.2757 6.59205 9.79233 6.59205 8.30066C6.59205 7.01733 7.60038 5.984 8.83371 5.984H9.37538V5.50066C9.37538 5.159 9.65871 4.87567 10.0004 4.87567C10.342 4.87567 10.6254 5.159 10.6254 5.50066V5.984H10.9254C12.292 5.984 13.4004 7.134 13.4004 8.55066C13.4004 8.89233 13.117 9.17566 12.7754 9.17566C12.4337 9.17566 12.1504 8.89233 12.1504 8.55066C12.1504 7.82566 11.6004 7.234 10.9254 7.234H10.6254V10.0507L11.8837 10.5007Z" fill="#214A8B"/>
                    <path d="M7.84961 8.30937C7.84961 9.03437 8.10794 9.17604 8.53294 9.32604L9.37461 9.61771V7.23438H8.83294C8.29128 7.23438 7.84961 7.71771 7.84961 8.30937Z" fill="#214A8B"/>
                  </svg>
                  Electrical Meter Distance Cost $45 per foot
                </p>
              </div> */}
            </div>
          )}
        </>
      }
      {
        !electricalMeterPosition || !showForm?
        <Button
        className="mt-10"
        type="primary"
        size="big"
        onClick={() => setShowForm(true)}
        disabled={!meterBtn}
      >
        Continue
      </Button>
      :
      <Button
        className="mt-10"
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
