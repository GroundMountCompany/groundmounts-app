// Step4Summary.tsx
import { useQuoteContext } from "@/contexts/quoteContext";
import { format } from "date-fns";
import { formatNumber, updateSheet } from "@/lib/utils";
import { useState } from "react";
import { TAB_NAME } from "@/constants/quote";

export default function Step4Summary() {
  const {
    address,
    coordinates,
    quotation,
    totalPanels,
    paymentMethod,
    quoteId,
    additionalCost,
    electricalMeter,
    percentage,
  } = useQuoteContext();
  const formattedDate = format(new Date(), "dd-MMM-yyyy");

  const totalCost = quotation + (additionalCost || 0);
  const federalTaxCredit = Math.floor(totalCost * 0.3);
  const netCostAfterTax = totalCost - federalTaxCredit;
  const systemSizeWatts = totalPanels * 400;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleSendEmail = async () => {
    if (!email) return;
    setStatus("Sending...");

    try {
      const res = await fetch("/api/sendEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          address,
          coordinates,
          quotation,
          totalPanels,
          paymentMethod,
          quoteId,
          additionalCost,
          electricalMeter,
          percentage,
        }),
      });

      if (res.ok) {
        setStatus("Email sent!");
        await updateSheet("O", email)

        // await fetch('/api/submit', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({tabName: TAB_NAME.EMAIL, data: [Object.values({
        //     email,
        //     address,
        //     latitude: coordinates.latitude,
        //     longitude: coordinates.longitude,
        //     quotation,
        //     totalPanels,
        //     paymentMethod,
        //     quoteId,
        //     additionalCost,
        //     electricalMeterDistance: electricalMeter?.distanceInFeet || 0,
        //     electricalMeterLatitude: electricalMeter?.coordinates?.latitude || null,
        //     electricalMeterLongitude: electricalMeter?.coordinates?.longitude || null,
        //     percentage
        //   })]}),
        // });
      } else {
        setStatus("Failed to send email.");
      }
    } catch {
      setStatus("Failed to send email.");
    }
  };

  return (
    <div className="flex flex-col w-full border border-neutral-200 rounded-lg p-6 lg:py-10 shadow-sm mt-10 lg:mt-0">
      <h3 className="text-xl font-medium tracking-[-0.02em] text-center">
        Summary
      </h3>

      <div className="flex flex-row justify-between mt-8">
        <div className="flex flex-col">
          <p className="text-xs font-medium tracking-[0.06em] text-neutral-400">
            Date
          </p>
          <p className="text-lg font-medium text-neutral-700">
            {formattedDate}
          </p>
        </div>
        <div className="flex flex-col text-right">
          <p className="text-xs font-medium tracking-[0.06em] text-neutral-400">
            Quote ID
          </p>
          <p className="text-lg font-medium text-neutral-700">{quoteId}</p>
        </div>
      </div>
      <div className="px-4 py-[14px] bg-blue-200 rounded-lg text-neutral-700 mt-[28px]">
        Address
      </div>
      <div className="flex flex-row justify-between px-0 lg:px-[29px] pt-5 pb-7">
        <p className="text-sm text-neutral-700 w-1/2">{address}</p>
        <p className="text-sm text-neutral-700 text-right w-1/2">
          {coordinates.latitude.toFixed(2)}° N,{" "}
          {coordinates.longitude.toFixed(2)}° W
        </p>
      </div>
      <div className="px-4 py-[14px] bg-blue-200 rounded-lg text-neutral-700">
        Total Plan
      </div>
      <div className="px-0 lg:px-[29px] pt-5">
        <div className="flex flex-row justify-between">
          <p className="text-sm text-neutral-700 w-1/2">
            ${formatNumber(totalCost)}
          </p>
          <p className="text-sm text-neutral-700 text-right w-1/2">
            Total System Cost
          </p>
        </div>
        <div className="flex flex-row justify-between mt-4">
          <p className="text-sm text-neutral-700 w-1/2">
            {formatNumber(systemSizeWatts)}W
          </p>
          <p className="text-sm text-neutral-700 text-right w-1/2">
            System Size ({percentage}% Offset)
          </p>
        </div>
        <div className="flex flex-row justify-between mt-4">
          <p className="text-sm text-neutral-700 w-1/2">
            ${formatNumber(paymentMethod === "cash" ? netCostAfterTax : 0)}
          </p>
          <p className="text-sm text-neutral-700 text-right w-1/2">
            Out-of-Pocket Cost
          </p>
        </div>
        <div className="flex flex-row justify-between mt-4">
          <p className="text-sm text-neutral-700 w-1/2">
            ${formatNumber(federalTaxCredit)}
          </p>
          <p className="text-sm text-neutral-700 text-right w-1/2">
            Federal Tax Credit (30%)
          </p>
        </div>
      </div>
      {additionalCost > 0 && (
        <>
          <div className="px-4 py-[14px] bg-blue-200 rounded-lg text-neutral-700 mt-6">
            Trenching to Meter
          </div>
          <div className="px-0 lg:px-[29px] pt-5">
            <div className="flex flex-row justify-between">
              <p className="text-sm text-neutral-700 w-1/2">
                Distance: {electricalMeter?.distanceInFeet || 0} feet
              </p>
              <p className="text-sm text-neutral-700 text-right w-1/2">
                + ${formatNumber(additionalCost)}
              </p>
            </div>
            <p className="text-xs text-neutral-400 mt-2">$45 per foot</p>
          </div>
        </>
      )}

      <div className="mt-6 border-t pt-4">
        <h4 className="text-lg font-semibold mb-2">Email quote summary</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-300 rounded-md p-2 w-full"
          />
          <button
            onClick={handleSendEmail}
            className="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700"
          >
            Send
          </button>
        </div>
        {status && <p className="text-sm mt-2 text-gray-600">{status}</p>}
      </div>
    </div>
  );
}
