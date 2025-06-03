'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea } from 'recharts';
import { useState, useRef, useEffect, JSX, useMemo } from 'react';
import { cn, updateSheet } from '@/lib/utils';
import Step2Table from './Step2Table';
import { useQuoteContext } from '@/contexts/quoteContext';
import { TAB_NAME } from '@/constants/quote';
// import { saveToSpreadsheet } from '@/lib/spreadsheetUtils';
// import { sendEmail } from '@/lib/api/email';
import { useToast } from '@/components/ui/toast';

export default function Step3Content(): JSX.Element {
  const {
    paymentMethod,
    setPaymentMethod,
    setQuoteId,
    address,
    coordinates,
    quotation,
    totalPanels,
    percentage,
    avgValue,
    highestValue,
    quoteId,
    additionalCost,
    electricalMeter,
    setCurrentStepIndex
  } = useQuoteContext();

  // const [email] = useState<string>("");
  // const [isSavingQuote, setIsSavingQuote] = useState<boolean>(false);
  const [isSavingToSpreadsheet, setIsSavingToSpreadsheet] = useState<boolean>(false);
  const { Toast, showToast } = useToast();

  // const isEmailValid = useMemo(() => {
  //   return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // }, [email]);

  const data = [
    { year: 2005, solar: 16.5, regular: 20 },
    { year: 2010, solar: 16.5, regular: 27 },
    { year: 2015, solar: 16.5, regular: 33.5 },
    { year: 2020, solar: 16.5, regular: 40 },
    { year: 2025, solar: 16.5, regular: 47 },
    { year: 2030, solar: 16.5, regular: 53.5 },
    { year: 2035, solar: 16.5, regular: 60 },
    { year: 2040, solar: 16.5, regular: 67 },
    { year: 2045, solar: 16.5, regular: 73.5 },
    { year: 2050, solar: 16.5, regular: 80 },
  ];

  const [chartWidth, setChartWidth] = useState<number>(0);
  const chartRef = useRef<HTMLDivElement>(null);

  // Calculate total cost including electrical meter distance
  const totalCost = useMemo(() => quotation + (additionalCost || 0), [quotation, additionalCost]);
  
  // Calculate Federal Tax Credit (30%)
  const federalTaxCreditCash = useMemo(() => Math.floor(totalCost * 0.3), [totalCost]);

  // Calculate net cost after tax credit for cash payment
  const netCostAfterTax = useMemo(() => totalCost - federalTaxCreditCash, [totalCost, federalTaxCreditCash]);
  
  // Calculate monthly payment based on 20 year loan at 2.99% fixed rate
  const loanTermYears = 20;
  const annualInterestRate = 0.0299;
  const monthlyInterestRate = annualInterestRate / 12;
  const totalPayments = loanTermYears * 12;
  
  const monthlyPayment = useMemo(() => {
    const loanAmount = totalCost;
    const monthlyPayment = loanAmount * ((monthlyInterestRate * Math.pow(1 + monthlyInterestRate, totalPayments)) / (Math.pow(1 + monthlyInterestRate, totalPayments) - 1));
    return Math.floor(monthlyPayment);
  }, [totalCost]);

  // Calculate monthly tax credit
  const federalTaxCreditMonthly = useMemo(() => Math.floor(monthlyPayment * 0.3), [monthlyPayment]);

  // const handleSaveQuote = async () => {
  //   try {
  //     setIsSavingQuote(true);
  //     await sendEmail(email);
  //     showToast("Quote has been sent to your email", "success");
  //   } catch (error) {
  //     console.error("Error saving quote:", error);
  //     showToast("Failed to send quote to email", "error");
  //   } finally {
  //     setIsSavingQuote(false);
  //   }
  // };

  const handleContinue = async () => {
    try {
      setIsSavingToSpreadsheet(true);
      // const emailPayload = {
      //   email,
      //   date: new Intl.DateTimeFormat(navigator.language, {
      //     day: '2-digit',
      //     month: '2-digit',
      //     year: '2-digit',
      //     hour: '2-digit',
      //     minute: '2-digit',
      //     second: '2-digit',
      //     hour12: false
      //   }).format(new Date()),
      //   timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // };
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
      },{
        col: "N", val: paymentMethod,
      }]
      vals.forEach(async val => {
        await updateSheet(val.col, val.val)
      })
      // const quotationPayload = {
      //   quoteId,
      //   address,
      //   latitude: coordinates.latitude,
      //   longitude: coordinates.longitude,
      //   quotation,
      //   totalPanels,
      //   paymentMethod,
      //   percentage,
      //   avgValue,
      //   highestValue,
      //   additionalCost,
      //   electricalMeterDistance: electricalMeter?.distanceInFeet || 0,
      //   electricalMeterLatitude: electricalMeter?.coordinates?.latitude || null,
      //   electricalMeterLongitude: electricalMeter?.coordinates?.longitude || null,
      //   totalCost: totalCost
      // };
      // console.log("quotationPayload", quotationPayload)
      // await fetch('/api/submit', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({tabName: TAB_NAME.QUOTATION, data: [Object.values(quotationPayload)]}),
      // });

      // await Promise.all([
      //   // saveToSpreadsheet(SPREADSHEET_ID, TAB_NAME.EMAIL, emailPayload),
      //   saveToSpreadsheet(SPREADSHEET_ID, TAB_NAME.QUOTATION, quotationPayload),
      // ]);

      setCurrentStepIndex(3);
    } catch (error) {
      console.error("Error saving to spreadsheet:", error);
      showToast("Failed to save quote data", "error");
    } finally {
      setIsSavingToSpreadsheet(false);
    }
  };

  useEffect(() => {
    if (chartRef.current) {
      setChartWidth(chartRef.current.clientWidth);
    }

    setQuoteId(`${Math.floor(Math.random() * 900 + 100)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 9000 + 1000)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {Toast}
      <div className="flex flex-col lg:flex-row gap-4 mt-8">
        {/* Pay Cash Option */}
        <div className={cn("flex-1 border rounded-xl p-6 transition-all duration-300", paymentMethod === 'cash' ? 'border-custom-primary' : 'border-neutral-300')}>
          <h2 className="text-2xl font-medium leading-[26.4px] tracking-[-0.02em]">Pay Cash</h2>
          <div className='flex flex-row justify-between mt-2'>
            <p className="text-sm text-neutral-400 w-[275px]">Own the system, maximize savings Pay for a turnkey system; Government incentives cover 30% - 65% of the cost.</p>
            <div>
              <p className="text-neutral-400 text-xs font-medium tracking-[0.06em] text-right">SOLAR SYSTEM NET COST</p>
              <p className="text-[44px] text-right leading-[51.92px] tracking-[-0.1px] mt-4 text-custom-primary">${netCostAfterTax.toLocaleString()} <span className="text-lg font-medium text-right line-through text-neutral-400">${Math.floor(totalCost).toLocaleString()}</span></p>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-neutral-400 text-xs font-medium tracking-[0.06em]">DETAILS:</p>
            <div className="mt-2">
              <div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
                <p className="w-[200px] lg:w-[400px]">Start With A 25% Deposit To Secure Your Order</p>
                <p className="text-custom-primary">${Math.floor(totalCost * 0.25).toLocaleString()}</p>
              </div>
              <div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
                <p className="w-[200px] lg:w-[400px]">Pay 50% Just Before Installation Day</p>
                <p className="text-custom-primary">${Math.floor(totalCost * 0.5).toLocaleString()}</p>
              </div>
              <div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
                <p className="w-[200px] lg:w-[400px]">Complete The Final 25% After Installation Is Done</p>
                <p className="text-custom-primary">${Math.floor(totalCost * 0.25).toLocaleString()}</p>
              </div>
              <div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
                <p className="w-[200px] lg:w-[400px]">Federal Investment Tax Credit (ITC) 30%</p>
                <p className="text-[#EB5757]">- ${federalTaxCreditCash.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <button className={cn("w-full rounded-full py-3 mt-6 font-medium transition-all duration-300", {
            'bg-custom-primary text-white': paymentMethod === 'cash',
            'bg-blue-200 text-custom-primary': paymentMethod === 'unselected',
            'bg-neutral-300 text-neutral-400': paymentMethod === 'finance'
          })}
            onClick={() => setPaymentMethod('cash')}>
            {paymentMethod === 'cash' ? 'Selected' : 'Choose'}
          </button>
        </div>

        {/* $0-Down Finance Option */}
        <div className={cn("flex-1 flex flex-col justify-between border rounded-xl p-6 transition-all duration-300", paymentMethod === 'finance' ? 'border-custom-primary' : 'border-neutral-300')}>
          <div>
            <h2 className="text-2xl font-medium leading-[26.4px] tracking-[-0.02em]">$0-Down Finance</h2>
            <div className="flex flex-row justify-between mt-2">
              <p className="text-sm text-neutral-400 w-[275px]">Own the system; no up-front cost. Qualify for government incentives; Interest may be tax deductible.</p>
              <div className="w-full lg:w-auto lg:min-w-[165px]">
                <p className="text-neutral-400 text-xs font-medium tracking-[0.06em] uppercase text-right">Solar System monthly Cost</p>
                <p className="text-[44px] text-right leading-[51.92px] tracking-[-0.1px] mt-4 text-custom-primary">${monthlyPayment.toLocaleString()} <span className="text-lg font-medium text-right line-through text-neutral-400">${Math.floor(monthlyPayment * 1.43).toLocaleString()}</span></p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-neutral-400 text-xs font-medium tracking-[0.06em]">DETAILS:</p>
              <div className="mt-4">
                <div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
                  <p className="w-[154px] lg:w-[267px]">Monthly Payments Starting After Your System Is Installed</p>
                  <p><span className="text-custom-primary">${monthlyPayment.toLocaleString()}</span><span className="text-xs font-medium ml-[6px]">/MONTH</span></p>
                </div>
                <div className="flex justify-between border-b border-neutral-200 font-medium py-[18px]">
                  <p className="w-[163px] lg:w-[302px]">Federal Investment Tax Credit (ITC) 30%</p>
                  <p><span className="text-[#EB5757]">- ${federalTaxCreditMonthly.toLocaleString()}</span><span className="text-xs font-medium ml-[6px]">/MONTH</span></p>
                </div>
              </div>
            </div>
          </div>
          <button className={cn("w-full rounded-full py-3 mt-6 font-medium transition-all duration-300", {
            'bg-custom-primary text-white': paymentMethod === 'finance',
            'bg-blue-200 text-custom-primary': paymentMethod === 'unselected',
            'bg-neutral-300 text-neutral-400': paymentMethod === 'cash'
          })}
            onClick={() => setPaymentMethod('finance')}>
            {paymentMethod === 'finance' ? 'Selected' : 'Choose'}
          </button>
        </div>
      </div>
      <p className="text-sm mt-6">*prices can change according to the contour conditions of the land such as (Mountain, Flat Sandy Soil etc.)</p>
      
      {/* <div className="flex flex-col gap-6 mt-10">
        <div className="w-full lg:w-[632px] flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-custom-primary font-medium text-base">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
              className="w-full h-[64px] text-base text-custom-black border border-neutral-300 rounded-full px-5 outline-none"
            />
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-row gap-2 items-center">
              <img src="/images/icons/directbox-send.svg" alt="email" className="w-6 h-6" />
              <p className="text-sm text-custom-primary">The quote will be sent to the email address you provided above</p>
            </div>
            <button
              onClick={handleSaveQuote}
              disabled={!isEmailValid || !email || isSavingQuote}
              className={cn(
                "h-8 px-6 flex items-center justify-center rounded-full border text-sm font-medium transition-all duration-300",
                isEmailValid && email && !isSavingQuote
                  ? "border-neutral-300 text-custom-primary hover:bg-custom-primary hover:text-white"
                  : "border-neutral-200 text-neutral-400 cursor-not-allowed"
              )}
            >
              {isSavingQuote ? "Saving..." : "Save Quote"}
            </button>
          </div>
        </div>
      </div> */}

      <hr className="my-10" />

      <button
        onClick={handleContinue}
        disabled={paymentMethod === 'unselected' || isSavingToSpreadsheet}
        className={cn(
          "w-full max-w-[185px] rounded-full py-3 mt-6 font-medium transition-all duration-300",
          paymentMethod !== 'unselected' && !isSavingToSpreadsheet
            ? "bg-custom-primary text-white hover:bg-custom-primary/90"
            : "bg-neutral-300 text-neutral-400 cursor-not-allowed"
        )}
      >
        {isSavingToSpreadsheet ? "Saving..." : "Continue"}
      </button>

      <div className="mt-[100px] p-6 border border-neutral-300 rounded-[16px] lg:border-0 bg-white shadow-[4px_4px_40px_0px_rgba(0,0,0,0.04)]">
        <h3 className="text-2xl font-medium leading-[31.2px] lg:leading-[26.4px] tracking-[-0.02em]">Future-Proof Your Energy Costs with Solar</h3>
        <div className="mt-6" ref={chartRef}>
          <p className="pl-1 lg:pl-6 text-xs font-medium lg:font-bold text-custom-primary leading-[18px] lg:leading-[13.2px] tracking-[0.06em] lg:tracking-[0.5px] mt-[48.5px] flex flex-row items-start lg:items-center gap-[6px] uppercase">
            <img src="/images/icons/lamp.png" alt="lamp" width={16} height={16} />
            25 Years of Solar Savings - Guaranteed at 17 CENTS per Watt
          </p>
          <div className="x-overflow-auto lg:x-overflow-visible">
            <LineChart
              width={chartWidth}
              height={500}
              data={data}
              className="mt-6"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <ReferenceArea
                x1={2025}
                x2={2050}
                y1={10}
                y2={90}
                fill="url(#gradient)"
              />
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(200, 215, 239, 1)" />
                  <stop offset="1%" stopColor="rgba(99, 142, 210, 0.35)" />
                  <stop offset="100%" stopColor="rgba(251, 252, 255, 0.35)" />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" padding={{ left: 59, right: 20 }} axisLine={false} tickLine={false} />
              <YAxis tickCount={9} domain={[10, 90]} tickFormatter={(tick) => `$${tick}`} axisLine={false} tickLine={false} />
              <Tooltip itemStyle={{ color: '#214A8B' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ color: '#000501', fontSize: '16px', fontWeight: 590, padding: '40px 0 0 0' }}
                payload={[
                  { value: 'Solar Electricity', type: 'circle', color: '#214A8B' },
                  { value: 'Regular Electricity', type: 'circle', color: '#F2994A' }
                ]}
              />
              <Line type="monotone" dataKey="solar" name="Solar Electricity" stroke="#214A8B" fill="#214A8B" dot={{ r: 5 }} />
              <Line type="monotone" dataKey="regular" name="Regular Electricity" stroke="#D3D4D6" fill="#F2994A" dot={{ r: 5 }} />
            </LineChart>
          </div>
        </div>
      </div>

      {/* <Step2Table /> */}
    </div>
  )
}
