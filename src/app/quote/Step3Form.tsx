import Button from "@/components/common/Button";
import { useQuoteContext } from "@/contexts/quoteContext";
import { updateSheet } from "@/lib/utils";
import { useState, useEffect } from "react";

interface Step3FormProps {}

const loadingMessages = [
  "Gathering property information...",
  "Analyzing electricity usage...",
  "Determining solar and meter locations...",
  "Running final calculations...",
  "Your quote is ready!"
];

export default function Step3Form({}: Step3FormProps) {
  const [currentPhase, setCurrentPhase] = useState<'loading' | 'form'>('loading');
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [showMessage, setShowMessage] = useState(true);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [textMe, setTextMe] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Phase 2: Modal Form
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header with image */}
        <div className="relative h-48 bg-gradient-to-br from-blue-600 to-blue-800">
          <img
            src="/images/quote-email-preview.png"
            alt="Custom ground mount quote preview"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <h2 className="text-2xl font-bold text-white text-center px-6">
              Get Your Custom Ground Mount Quote
            </h2>
          </div>
        </div>

        {/* Form content */}
        <div className="p-6">
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
                Phone Number (Optional)
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

            {/* Text me checkbox */}
            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={textMe}
                  onChange={(e) => setTextMe(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Text me my quote</span>
              </label>
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
            <p className="text-xs text-gray-600 mt-6 leading-relaxed text-center">
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
