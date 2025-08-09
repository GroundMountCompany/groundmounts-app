import React from "react";
import { useQuoteContext } from "@/contexts/quoteContext";
import { updateSheet } from "@/lib/utils";
import { useState, useEffect } from "react";
import { enqueueOrSend } from "@/lib/leadQueue";
import { useSearchParams } from 'next/navigation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
          honeypot: company,
          ttc_ms: Date.now() - startedAt,
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
            honeypot: company,
            ttc_ms: Date.now() - startedAt,
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      {/* Card container */}
      <div className="mx-auto w-full max-w-[640px]">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-[0_6px_30px_rgba(0,0,0,0.06)]">
          {/* Header */}
          <div className="border-b border-neutral-200 px-6 py-5 sm:px-8">
            <p className="text-sm font-medium tracking-wide text-neutral-500">
              Step 3
            </p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight text-neutral-900">
              Get Your Custom Ground Mount Quote
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Enter your best email (and phone if you want SMS). We&apos;ll send your full quote now and follow up if you want help choosing options.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={(e) => { e.preventDefault(); handleSendEmail(); }} className="px-6 py-6 sm:px-8 sm:py-8">
            {/* Honeypot (keep) */}
            <input
              name="company"
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              className="sr-only"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />

            {/* Inputs */}
            <div className="grid grid-cols-1 gap-4 sm:gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-semibold text-neutral-800">
                  Email Address <span className="font-normal text-rose-600">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none ring-0 transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  placeholder="you@example.com"
                />
                {status && status.includes('Failed') && (
                  <p className="text-sm text-rose-600">{status}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="phone" className="text-sm font-semibold text-neutral-800">
                  Phone Number <span className="font-normal text-neutral-500">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="[0-9\\-()+ ]*"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none ring-0 transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  placeholder="(555) 555-5555"
                />
              </div>
            </div>

            {/* CTA */}
            <div className="mt-6 sm:mt-7">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-neutral-900 text-base font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                    Sending…
                  </span>
                ) : (
                  "Send Me My Quote"
                )}
              </button>
            </div>

            {/* Trust & expectations */}
            <div className="mt-6 grid gap-3 text-sm text-neutral-700">
              <div className="rounded-lg bg-neutral-50 p-4">
                <ul className="list-disc space-y-1 pl-5">
                  <li>You&apos;ll get your full custom quote instantly.</li>
                  <li>We may follow up with a quick email or text to offer a free, no‑pressure call to walk through the numbers.</li>
                  <li>Not interested? Just reply <span className="rounded bg-neutral-200 px-1 py-0.5 text-xs font-semibold">STOP</span>.</li>
                </ul>
              </div>
              <p className="text-center text-[13px] text-neutral-500">
                We will <span className="font-semibold">NEVER</span> sell your info.
                This design tool wasn&apos;t free to build—we just ask for your email in return (fair, right?).
              </p>
            </div>

            {/* Status / errors */}
            <div className="mt-4">
              <p role="status" aria-live="polite" className="text-sm text-neutral-600">
                {isSubmitting ? "Sending your quote…" : (status && status.includes('sent') ? status : '')}
              </p>
              {status && status.includes('Failed') && (
                <p className="mt-1 text-sm font-medium text-rose-600">
                  {status}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default React.memo(Step3Form);
