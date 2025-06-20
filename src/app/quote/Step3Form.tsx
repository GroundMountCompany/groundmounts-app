import Button from "@/components/common/Button";
import { useQuoteContext } from "@/contexts/quoteContext";
import { updateSheet } from "@/lib/utils";
import { useState } from "react";

interface Step3FormProps {}

export default function Step3Form({}: Step3FormProps) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

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
        await updateSheet("O", email);
        await updateSheet("P", phone);
      } else {
        setStatus("Failed to send email.");
      }
    } catch {
      setStatus("Failed to send email.");
    }
  };

  return (
    <div>
      <div className="mt-6 mb-8 rounded-xl bg-white border border-blue-300 p-5 text-sm text-gray-800 shadow-sm">
        <p className="font-semibold text-blue-700 mb-2">We will NEVER sell your info.</p>
        <p className="mb-2">
          This design tool wasn't free to build—we just ask for your email in return (fair, right?).
        </p>
        <p className="mb-2">
          You'll get your full custom quote instantly. Then we may follow up with a quick email or
          text to offer a <span className="font-semibold text-gray-900">free, no-pressure meeting</span> to walk through the numbers.
        </p>
        <p>
          Not interested? Just reply <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">STOP</code>. Low stakes. Big savings.
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-80">
        <div className="flex flex-col relative">
          <label htmlFor="phone" className="text-xs font-medium uppercase">
            Phone
          </label>
          <input
            type="text"
            id="phone"
            className="w-full mt-2 p-4 border outline-none shadow-sm text-neutral-700 rounded-full text-sm font-medium h-[53px] border-neutral-300 bg-white"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setPhone(e.target.value);
            }}
          />
          <img
            src="/images/icons/dollar.png"
            alt="dollar icon"
            className="absolute right-4 bottom-[18px]"
          />
        </div>

        <div className="flex flex-col relative">
          <label htmlFor="email" className="text-xs font-medium uppercase">
            Email
          </label>
          <input
            type="text"
            id="email"
            className="w-full mt-2 p-4 border outline-none shadow-sm text-neutral-700 rounded-full text-sm font-medium h-[53px] border-neutral-300 bg-white"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setEmail(e.target.value);
            }}
          />
          <img
            src="/images/icons/dollar.png"
            alt="dollar icon"
            className="absolute right-4 bottom-[18px]"
          />
        </div>
      </div>

      <Button className="mt-10" type="primary" size="big" onClick={handleSendEmail}>
        Send My Quote →
      </Button>

      {status && <p className="text-sm mt-2 text-gray-600">{status}</p>}
    </div>
  );
}
