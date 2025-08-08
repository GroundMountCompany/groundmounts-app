import React from "react";
import Button from "@/components/common/Button";
import { useQuoteContext } from "@/contexts/quoteContext";
import { updateSheet } from "@/lib/utils";
import { useState, useEffect } from "react";
import { enqueueOrSend } from "@/lib/leadQueue";
import { useSearchParams } from 'next/navigation';

interface Step3FormProps {}

const loadingMessages = [
  "Gathering property information...",
  "Analyzing electricity usage...",
  "Determining solar and meter locations...",
  "Running final calculations...",
  "Your quote is ready!"
];

function Step3Form({}: Step3FormProps) {
  const [currentPhase, setCurrentPhase] = useState<'loading' | 'form' | 'success'>('loading');
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [showMessage, setShowMessage] = useState(true);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [textMe, setTextMe] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const selectedState = searchParams.get('state') || 'TX';

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
    leadId,
  } = useQuoteContext();

  // Phase 1: Loading sequence
  useEffect(() => {
    if (currentPhase !== 'loading') return;

    const messageTimer = setInterval(() => {
      setShowMessage(false);
      
      setTimeout(() => {
        if (currentMessageIndex < loadingMessages.length - 1) {
          setCurrentMessageIndex(prev => prev + 1);
          setShowMessage(true);
        } else {
          // Final message shown, transition to form
          setTimeout(() => {
            setCurrentPhase('form');
          }, 1200);
        }
      }, 300); // Fade out duration
    }, 1200); // Message display duration

    return () => clearInterval(messageTimer);
  }, [currentPhase, currentMessageIndex]);

  const handleSendEmail = async () => {
    if (!email) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/sendEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId,
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
        
        // Send complete lead data with final quote details
        try {
          await enqueueOrSend({
            id: leadId,
            state: selectedState,
            email,
            phone,
            address,
            quote: {
              quotation,
              totalPanels,
              paymentMethod,
              additionalCost,
              electricalMeter,
              percentage,
              coordinates,
            },
            ts: Date.now(),
          });
          console.log("[FINAL_LEAD_CAPTURED]", leadId, email);
        } catch (error) {
          console.error("[FINAL_LEAD_CAPTURE_ERROR]", error);
        }
        
        // Follow-up email is now handled server-side via /api/sendEmail
        
        // Wait 1.5 seconds then show success state
        setTimeout(() => {
          setCurrentPhase('success');
        }, 1500);
      } else {
        setStatus("Failed to send email.");
      }
    } catch {
      setStatus("Failed to send email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phase 1: Loading Screen
  if (currentPhase === 'loading') {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          </div>
          <div className="h-8 flex items-center justify-center">
            <p 
              className={`text-lg text-gray-700 transition-opacity duration-300 ${
                showMessage ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {loadingMessages[currentMessageIndex]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Phase 3: Success State
  if (currentPhase === 'success') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Check out our official website for Texas homeowners
            </h2>
            <a
              href="https://www.groundmounts.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-colors duration-200"
            >
              GroundMounts.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Phase 2: Modal Form
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header with image */}
        <div className="relative h-32">
          <img
            src="/images/quote-email-preview.png"
            alt="Custom ground mount quote preview"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Get Your Custom Ground Mount Quote
          </h2>
        </div>

        {/* Form content */}
        <div className="p-6 pt-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSendEmail(); }}>
            {/* Email input */}
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Phone input */}
            <div className="mb-4">
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-colors duration-200"
            >
              {isSubmitting ? 'Sending...' : 'Send Me My Quote'}
            </button>

            {/* Trust copy */}
            <p className="text-base text-gray-700 font-semibold text-center mt-8 leading-relaxed">
              <span className="font-semibold">We will NEVER sell your info.</span><br />
              This design tool wasn't free to build—we just ask for your email in return (fair, right?).<br />
              You'll get your full custom quote instantly. Then we may follow up with a quick email or text to offer a <strong>free, no-pressure meeting</strong> to walk through the numbers.<br />
              Not interested? Just reply <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">STOP</code>. Low stakes. Big savings.
            </p>

            {/* Status message */}
            {status && (
              <p className={`text-sm mt-3 text-center ${
                status.includes('sent') ? 'text-green-600' : 'text-red-600'
              }`}>
                {status}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default React.memo(Step3Form);
