import React from "react";
import { useQuoteContext } from "@/contexts/quoteContext";
import { updateSheet } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { enqueueOrSend } from "@/lib/leadQueue";
import { useSearchParams } from 'next/navigation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Step3FormProps {}

const loadingMessages = [
  "Calculating your system size...",
  "Estimating federal tax credits...",
  "Finalizing your custom quote...",
];

function Step3Form({}: Step3FormProps) {
  const [currentPhase, setCurrentPhase] = useState<'loading' | 'form' | 'success'>('loading');
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [showMessage, setShowMessage] = useState(true);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [textMe, setTextMe] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [company, setCompany] = useState(""); // Honeypot field
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
    startedAt,
    avgValue,
  } = useQuoteContext();

  // Calculate derived values for display
  const systemSizeKw = useMemo(() => ((totalPanels * 435) / 1000).toFixed(1), [totalPanels]);
  const totalCost = useMemo(() => quotation + (additionalCost || 0), [quotation, additionalCost]);
  const taxCredit = useMemo(() => Math.floor(totalCost * 0.3), [totalCost]);
  const netCost = useMemo(() => totalCost - taxCredit, [totalCost, taxCredit]);
  const monthlySavings = useMemo(() => Math.round(avgValue * (percentage / 100)), [avgValue, percentage]);

  // Phase 1: Loading sequence (faster)
  useEffect(() => {
    if (currentPhase !== 'loading') return;

    const messageTimer = setInterval(() => {
      setShowMessage(false);

      setTimeout(() => {
        if (currentMessageIndex < loadingMessages.length - 1) {
          setCurrentMessageIndex(prev => prev + 1);
          setShowMessage(true);
        } else {
          setTimeout(() => {
            setCurrentPhase('form');
          }, 800);
        }
      }, 200);
    }, 900);

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
          avgBill: avgValue,
          honeypot: company,
          ttc_ms: Date.now() - startedAt,
        }),
      });

      if (res.ok) {
        setStatus("Email sent!");
        await updateSheet("O", email);
        await updateSheet("P", phone);

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
            honeypot: company,
            ttc_ms: Date.now() - startedAt,
          });
          console.log("[FINAL_LEAD_CAPTURED]", leadId, email);
        } catch (error) {
          console.error("[FINAL_LEAD_CAPTURE_ERROR]", error);
        }

        setTimeout(() => {
          setCurrentPhase('success');
        }, 1200);
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
      <div className="fixed inset-0 bg-gradient-to-b from-neutral-900 to-neutral-800 z-50 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="mb-6">
            <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
          </div>
          <p
            className={`text-base text-white/90 transition-opacity duration-200 ${
              showMessage ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {loadingMessages[currentMessageIndex]}
          </p>
        </div>
      </div>
    );
  }

  // Phase 3: Success State
  if (currentPhase === 'success') {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-green-600 to-green-700 z-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          {/* Success checkmark */}
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">
            Your Quote is On Its Way!
          </h2>
          <p className="text-white/90 mb-8">
            Check your inbox in the next 60 seconds. If you don&apos;t see it, check spam.
          </p>

          <a
            href="https://www.groundmounts.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full bg-white text-green-700 font-bold py-4 px-6 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Visit GroundMounts.com
          </a>
          <p className="text-white/70 text-sm mt-4">
            Questions? Reply to the email anytime.
          </p>
        </div>
      </div>
    );
  }

  // Phase 2: The High-Converting Form
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-neutral-900 to-neutral-800">
      <div className="min-h-full flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-lg">

          {/* Your System Summary - Show them what they built */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 mb-4 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-white/90 text-sm font-medium">Your Custom System</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/60 text-xs mb-0.5">Panels</p>
                <p className="text-white text-lg font-bold">{totalPanels}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/60 text-xs mb-0.5">System Size</p>
                <p className="text-white text-lg font-bold">{systemSizeKw} kW</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/60 text-xs mb-0.5">Est. Tax Credit</p>
                <p className="text-green-400 text-lg font-bold">${taxCredit.toLocaleString()}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/60 text-xs mb-0.5">Monthly Savings</p>
                <p className="text-green-400 text-lg font-bold">~${monthlySavings}</p>
              </div>
            </div>
          </div>

          {/* Main Form Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header - Urgency + Specificity */}
            <div className="px-5 pt-6 pb-4 sm:px-6 text-center">
              <h1 className="text-2xl sm:text-[26px] font-extrabold text-neutral-900 leading-tight">
                Get Your ${netCost.toLocaleString()} Quote
              </h1>
              <p className="mt-2 text-neutral-600 text-sm leading-relaxed">
                The full breakdown hits your inbox in under 60 seconds.<br className="hidden sm:block" />
                Exact costs. Tax credits. Payback timeline.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={(e) => { e.preventDefault(); handleSendEmail(); }} className="px-5 pb-6 sm:px-6">
              {/* Honeypot */}
              <input
                name="company"
                aria-hidden="true"
                tabIndex={-1}
                autoComplete="off"
                className="sr-only"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />

              {/* Email Input - Primary */}
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-semibold text-neutral-800 mb-2">
                  Where should we send it?
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 w-full rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 text-base outline-none transition-all focus:border-neutral-900 focus:bg-white focus:ring-0"
                  placeholder="your@email.com"
                />
              </div>

              {/* Phone Input - Secondary */}
              <div className="mb-5">
                <label htmlFor="phone" className="block text-sm font-semibold text-neutral-800 mb-2">
                  Phone <span className="font-normal text-neutral-400">(for questions only)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="[0-9\-()+ ]*"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-14 w-full rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 text-base outline-none transition-all focus:border-neutral-900 focus:bg-white focus:ring-0"
                  placeholder="(555) 555-5555"
                />
              </div>

              {/* CTA Button - Benefit Focused */}
              <button
                type="submit"
                disabled={isSubmitting || !email}
                className="w-full h-14 rounded-xl bg-green-600 text-white text-base font-bold transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    See My Exact Savings
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>

              {/* Error display */}
              {status && status.includes('Failed') && (
                <p className="mt-3 text-sm text-red-600 text-center">{status}</p>
              )}

              {/* Trust Signals - Tight */}
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  No spam, ever
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-300"></span>
                <span>Instant delivery</span>
                <span className="w-1 h-1 rounded-full bg-neutral-300"></span>
                <span>Free</span>
              </div>
            </form>

            {/* Social Proof Bar */}
            <div className="bg-neutral-50 border-t border-neutral-100 px-5 py-3 sm:px-6">
              <p className="text-center text-xs text-neutral-600">
                <span className="font-semibold text-neutral-800">847 Texas homeowners</span> got their quote this month
              </p>
            </div>
          </div>

          {/* Bottom reassurance */}
          <p className="text-center text-white/50 text-xs mt-4 px-4">
            Your information stays private. We never sell or share your data.
          </p>
        </div>
      </div>
    </div>
  );
}

export default React.memo(Step3Form);
