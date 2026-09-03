'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useQuoteStore, clearPersistedQuote } from '@/store/quoteStore';
import { buildLeadPayload } from '@/lib/leadPayload';
import { enqueueOrSend } from '@/lib/leadQueue';
import { useBrand } from '@/contexts/BrandContext';
import { PANELS } from '@/config/pricing';
import { annualKwh, TX_FALLBACK_CURVE } from '@/lib/production';

/**
 * The hook: they can see exactly what they designed, and the price is the one
 * thing behind the form.
 */
export default function Step6Quote() {
  const brand = useBrand();
  const searchParams = useSearchParams();

  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelTier = useQuoteStore((s) => s.panelTier);
  const azimuth = useQuoteStore((s) => s.azimuth);
  const trenchFeet = useQuoteStore((s) => s.trenchFeet);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const production = annualKwh(TX_FALLBACK_CURVE, kw, azimuth);
  const ready = name.trim() !== '' && email.trim() !== '' && phone.trim() !== '';

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);

    const state = useQuoteStore.getState();
    const payload = buildLeadPayload(
      state,
      {
        name,
        email,
        phone,
        state: searchParams.get('state') || 'TX',
        source: searchParams.get('source') || brand.domain,
        honeypot: company,
      },
      Date.now()
    );

    try {
      await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: payload.id,
          email,
          address: payload.address,
          quotation: payload.quote.quotation,
          totalPanels: payload.quote.totalPanels,
          additionalCost: payload.quote.additionalCost,
          trenchFeet: payload.quote.trenchFeet,
          percentage: payload.quote.percentage,
          avgBill: payload.quote.avgBill,
          honeypot: company,
          ttc_ms: payload.ttc_ms,
        }),
      });

      await enqueueOrSend(payload);
      clearPersistedQuote();
      setDone(true);
    } catch {
      setError('That did not go through. Try once more.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div data-testid="success-screen" className="space-y-4">
        <h3 className="text-[22px] font-semibold text-neutral-900">{UI.successTitle}</h3>
        <p className="text-[17px] text-neutral-700">{UI.successBody}</p>
        <a
          href={brand.calendlyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 w-full items-center justify-center rounded-xl bg-green-700 text-[17px] font-semibold text-white"
        >
          {UI.bookCall}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visible, unblurred: this is what they built. */}
      <div data-testid="design-summary" className="rounded-xl border border-neutral-200 p-4">
        <dl className="grid grid-cols-2 gap-y-2 text-[17px]">
          <dt className="text-neutral-500">Panels</dt>
          <dd className="text-right font-semibold">{totalPanels}</dd>
          <dt className="text-neutral-500">System</dt>
          <dd className="text-right font-semibold">{kw.toFixed(1)} kW</dd>
          <dt className="text-neutral-500">Production</dt>
          <dd className="text-right font-semibold">{production.toLocaleString()} kWh/yr</dd>
          <dt className="text-neutral-500">Trench</dt>
          <dd className="text-right font-semibold">{trenchFeet} ft</dd>
        </dl>
      </div>

      <div data-testid="price-blur" className="relative overflow-hidden rounded-xl border border-neutral-200 p-6">
        <p className="select-none text-center text-[28px] font-bold text-neutral-900 blur-md">
          $00,000 – $00,000
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[17px] font-semibold text-neutral-800">{UI.priceHidden}</span>
        </div>
      </div>

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <label className="block">
        <span className="block text-[17px] font-medium">Name</span>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Smith"
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>
      <label className="block">
        <span className="block text-[17px] font-medium">Email</span>
        <input
          id="email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>
      <label className="block">
        <span className="block text-[17px] font-medium">Phone</span>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>

      {error && <p className="text-[17px] text-red-700">{error}</p>}

      <button
        type="button"
        data-testid="submit-lead"
        onClick={submit}
        disabled={!ready || submitting}
        className="h-14 w-full rounded-xl bg-green-700 text-[17px] font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Sending' : STEPS[5].cta}
      </button>

      <EducationCard copy={STEPS[5].education} />
    </div>
  );
}
