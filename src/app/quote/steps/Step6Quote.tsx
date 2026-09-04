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
import { annualKwh } from '@/lib/production';
import { useQuote } from './useQuote';


/** Whole dollars; nobody quotes a ground mount to the cent. */
function money(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

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

  // Contact details live in the store so a reload keeps them, and so the email
  // is guaranteed to go to the address that was filed with the lead.
  const name = useQuoteStore((s) => s.contactName);
  const email = useQuoteStore((s) => s.contactEmail);
  const phone = useQuoteStore((s) => s.contactPhone);
  const setContact = useQuoteStore((s) => s.setContact);
  const leadFiled = useQuoteStore((s) => s.leadFiled);
  const leadId = useQuoteStore((s) => s.leadId);
  const setStep = useQuoteStore((s) => s.setCurrentStepIndex);
  const resetQuote = useQuoteStore((s) => s.resetQuote);

  // Once the lead is filed those three fields are locked: changing the address
  // afterwards would email a different person than the Airtable record names.
  const locked = leadFiled !== null && leadFiled === leadId;

  const [company, setCompany] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const curve = useQuoteStore((s) => s.productionCurve);
  const quote = useQuote();
  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const production = annualKwh(curve, kw, azimuth);
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
      const store = useQuoteStore.getState();

      // Lead first. It is the thing the business cannot recover if it is lost;
      // the email is a courtesy that can be retried. Both are keyed on leadId so
      // a retry after a partial failure skips whatever already went through.
      if (store.leadFiled !== payload.id) {
        const result = await enqueueOrSend(payload);
        if (!result.ok) {
          setError(UI.submitFailed);
          return;
        }
        store.setLeadFiled(payload.id);
      }

      if (useQuoteStore.getState().emailSent !== payload.id) {
        const emailRes = await fetch('/api/sendEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The design, not the price. The route prices these inputs itself
          // with the same function this screen used, so the email cannot be
          // talked into quoting a number nobody computed.
          body: JSON.stringify({
            leadId: payload.id,
            email,
            address: payload.address,
            name,
            inputs: payload.quote.inputs,
            honeypot: company,
            ttc_ms: payload.ttc_ms,
          }),
        });

        if (!emailRes.ok) {
          // The lead is safe. Say so plainly, and retry only the email.
          setError(UI.emailFailedAfterSave);
          return;
        }
        useQuoteStore.getState().setEmailSent(payload.id);
      }

      clearPersistedQuote();
      setDone(true);
    } catch {
      setError(
        useQuoteStore.getState().leadFiled === payload.id
          ? UI.emailFailedAfterSave
          : UI.submitFailed
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div data-testid="success-screen" className="space-y-4">
        <div className="rounded-xl border border-neutral-200 p-5 text-center">
          <p className="text-[15px] uppercase tracking-wide text-neutral-500">
            {UI.priceRangeLabel}
          </p>
          <p data-testid="price-revealed" className="text-[26px] font-bold text-neutral-900">
            {money(quote.low)} – {money(quote.high)}
          </p>
          <p className="mt-1 text-[15px] text-neutral-600">{UI.priceEstimateNote}</p>
        </div>

        <div>
          <h4 className="text-[17px] font-semibold text-neutral-900">{UI.lineItemsTitle}</h4>
          <dl data-testid="line-items" className="mt-2 space-y-1 text-[16px]">
            {quote.lineItems.map((item) => (
              <div key={item.key} className="flex justify-between gap-4">
                <dt className="text-neutral-700">
                  {item.label}
                  {item.detail ? <span className="block text-[15px] text-neutral-500">{item.detail}</span> : null}
                </dt>
                <dd className="whitespace-nowrap font-semibold">{money(item.amount)}</dd>
              </div>
            ))}
          </dl>
        </div>

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
          <dt className="text-neutral-500">{UI.summaryPanels}</dt>
          <dd className="text-right font-semibold">{totalPanels}</dd>
          <dt className="text-neutral-500">{UI.summarySystem}</dt>
          <dd className="text-right font-semibold">{kw.toFixed(1)} kW</dd>
          <dt className="text-neutral-500">{UI.summaryProduction}</dt>
          <dd data-testid="summary-production" className="text-right font-semibold">
            {production.toLocaleString()} kWh/yr
          </dd>
          <dt className="text-neutral-500">{UI.summaryTrench}</dt>
          <dd className="text-right font-semibold">{trenchFeet} ft</dd>
        </dl>
      </div>

      <div
        data-testid="price-blur"
        className="relative overflow-hidden rounded-xl border border-neutral-200 p-6"
      >
        <p
          data-testid="price-range"
          className="select-none text-center text-[26px] font-bold text-neutral-900 blur-md"
        >
          {money(quote.low)} – {money(quote.high)}
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
        <span className="block text-[17px] font-medium">{UI.fieldName}</span>
        <input
          id="name"
          value={name}
          onChange={(e) => setContact('contactName', e.target.value)}
          readOnly={locked}
          placeholder={UI.namePlaceholder}
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>
      <label className="block">
        <span className="block text-[17px] font-medium">{UI.fieldEmail}</span>
        <input
          id="email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setContact('contactEmail', e.target.value)}
          readOnly={locked}
          placeholder={UI.emailPlaceholder}
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>
      <label className="block">
        <span className="block text-[17px] font-medium">{UI.fieldPhone}</span>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setContact('contactPhone', e.target.value)}
          readOnly={locked}
          placeholder={UI.phonePlaceholder}
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>

      {locked && (
        <div data-testid="contact-locked" className="space-y-2">
          <p className="text-[16px] text-neutral-600">{UI.lockedContactNote}</p>
          <button
            type="button"
            data-testid="start-over"
            onClick={() => {
              resetQuote();
              clearPersistedQuote();
              setStep(0);
            }}
            className="min-h-[48px] text-[17px] font-semibold text-blue-700 underline underline-offset-2"
          >
            {UI.startOver}
          </button>
        </div>
      )}

      {error && <p className="text-[17px] text-red-700">{error}</p>}

      <EducationCard copy={STEPS[5].education} />

      {/* Sticky, so it stays reachable while the contact fields scroll — the
          shell's own footer is empty on the last step. */}
      <div data-sticky-footer className="sticky bottom-0 -mx-5 bg-white px-5 pb-2 pt-3">
        <button
          type="button"
          data-testid="submit-lead"
          onClick={submit}
          disabled={!ready || submitting}
          className="h-14 w-full rounded-xl bg-green-700 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? UI.submitting : STEPS[5].cta}
        </button>
      </div>
    </div>
  );
}
