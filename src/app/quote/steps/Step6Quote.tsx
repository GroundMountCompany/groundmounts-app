'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI } from '@/config/copy';
import { useQuoteStore, clearPersistedQuote } from '@/store/quoteStore';
import { track, trackLeadFiled } from '@/lib/analytics';
import CallTimeAsk from '../CallTimeAsk';
import dynamic from 'next/dynamic';

/*
  Loaded when it is needed, not before.

  Recharts is 110 kB, and this section only exists after the customer has
  filed a lead — so putting it in the first-load bundle taxes every visitor on
  LTE for a screen most of them have not reached yet.
*/
const ResultsSection = dynamic(() => import('@/components/results/ResultsSection'), {
  ssr: false,
  loading: () => <div data-testid="results-loading" className="h-[220px]" />,
});
import { buildLeadPayload } from '@/lib/leadPayload';
import { enqueueOrSend } from '@/lib/leadQueue';
import { useBrand } from '@/contexts/BrandContext';
import { PANELS } from '@/config/pricing';
import { annualKwh } from '@/lib/production';
import { useQuote } from './useQuote';
import { demoFromParam } from '@/lib/demoMode';


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
  // What the results comparison is built from: the bill they typed on step 2
  // and the share of it they asked the array to cover.
  const avgValue = useQuoteStore((s) => s.avgValue);
  const percentage = useQuoteStore((s) => s.percentage);

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
  /*
    The id of the lead that was actually filed.

    Held here rather than read from the store on the success screen, because
    `clearPersistedQuote()` runs a line before `setDone(true)` — the store is
    deliberately empty by the time this screen renders, so that a shared or
    kiosk phone does not hand the next visitor somebody else's design. The
    call-time answer still has to reach the right record.
  */
  const [filedLeadId, setFiledLeadId] = useState<string | null>(null);
  /**
   * What the server actually filed and emailed.
   *
   * The blurred range before submit is this page's own arithmetic, which is
   * fine — it is a preview. What gets revealed afterwards is the server's
   * answer, because that is the number in the customer's inbox and in the
   * owner's record, and showing them a fourth number would be worse than
   * showing them nothing.
   */
  const [filed, setFiled] = useState<{
    low: number;
    high: number;
    lineItems: Array<{ key: string; label: string; detail?: string; amount: number }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
    ?demo=results opens this screen already revealed, on the worked example,
    without sending anything anywhere.

    The results section only exists after a submit, so reviewing a wording
    change meant putting a real name and a real email through the real route
    and leaving a real record in the owner's Airtable. This is the same screen
    from a URL. It is deliberately not a shortcut past the form: nothing is
    filed, so `leadFiled` stays untouched and the funnel is not marked as done.

    Gated on NEXT_PUBLIC_DEMO_PARAMS, which is set on Preview and nowhere else.
    In production the comparison inlines to false and the parameter does
    nothing at all — see demoMode.ts.
  */
  const demo = demoFromParam(searchParams.get('demo'));
  useEffect(() => {
    if (demo !== 'results') return;
    // `filed` stays null, so the screen reveals its own arithmetic for the
    // seeded design — the same numbers the blurred preview was showing a
    // moment earlier. Nothing pretends a server answered.
    setDone(true);
  }, [demo]);

  const curve = useQuoteStore((s) => s.productionCurve);
  const quote = useQuote();
  const kw = (totalPanels * PANELS[panelTier].watts) / 1000;
  const production = annualKwh(curve, kw, azimuth);
  const ready = name.trim() !== '' && email.trim() !== '' && phone.trim() !== '';

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    track('unlock_tapped');

    const state = useQuoteStore.getState();
    const payload = buildLeadPayload(
      state,
      {
        name,
        email,
        phone,
        state: searchParams.get('state') || 'TX',
        // Attribution: which partner sent them. Recorded, and nothing more.
        source: searchParams.get('source') || brand.domain,
        // Identity: what the email says it is from.
        brand: searchParams.get('brand') || undefined,
        honeypot: company,
      },
      Date.now()
    );

    try {
      const store = useQuoteStore.getState();

      // One request. It files the lead, sends the quote email and notifies the
      // owner, and reports which of those happened. Two routes meant two site
      // lookups and two chances for the customer's email and the owner's record
      // to describe different numbers.
      //
      // The one case for a second request is a lead that was filed while its
      // email failed: `resend` sends the email alone rather than re-writing a
      // record that already exists.
      const alreadyFiled = store.leadFiled === payload.id;
      const result = await enqueueOrSend(
        alreadyFiled ? { ...payload, resend: true } : payload
      );

      if (result.body?.leadFiled) store.setLeadFiled(payload.id);

      if (!result.ok) {
        setError(
          useQuoteStore.getState().leadFiled === payload.id
            ? UI.emailFailedAfterSave
            : UI.submitFailed
        );
        return;
      }

      const body = result.body;
      if (typeof body?.priceLow === 'number' && typeof body?.priceHigh === 'number') {
        setFiled({
          low: body.priceLow,
          high: body.priceHigh,
          lineItems: body.lineItems ?? [],
        });
      }

      if (!result.body?.emailSent) {
        // The lead is safe. Say so plainly, and retry only the email.
        setError(UI.emailFailedAfterSave);
        return;
      }
      useQuoteStore.getState().setEmailSent(payload.id);

      /*
        Both counts, once, sharing an id.

        The same conversion is reported by the browser and by the server — the
        browser's can be blocked and the server's cannot, so neither alone is
        reliable. `payload.id` is the lead id, which is already unique per
        submission and already idempotent server-side, so Meta and PostHog
        both de-duplicate on it rather than counting the lead twice.
      */
      trackLeadFiled(payload.id, {
        value: Math.round(((body?.priceLow ?? 0) + (body?.priceHigh ?? 0)) / 2),
      });

      setFiledLeadId(payload.id);
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
            {money(filed?.low ?? quote.low)} – {money(filed?.high ?? quote.high)}
          </p>
          {/* One disclaimer, not two. This screen carried both "Estimates —
              final price after site visit" and "An estimate from your design.
              The real number comes after a site visit.", stacked, saying the
              same thing twice in slightly different words. */}
          <p data-testid="estimate-note-revealed" className="mt-1 text-[15px] text-neutral-500">
            {UI.estimateNote}
          </p>
        </div>

        <div>
          <h4 className="text-[17px] font-semibold text-neutral-900">{UI.lineItemsTitle}</h4>
          <dl data-testid="line-items" className="mt-2 space-y-1 text-[16px]">
            {(filed?.lineItems.length ? filed.lineItems : quote.lineItems).map((item) => (
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

        {/* The number above is only frightening on its own. This is what the
            utility takes over the same twenty-five years, which most people
            have never added up. */}
        <ResultsSection
          monthlyBillUsd={avgValue}
          // The midpoint of the range, which is the estimate the server filed:
          // low and high are that figure spread either side by a fixed
          // percentage, so the midpoint is it exactly.
          systemPriceUsd={Math.round(
            ((filed?.low ?? quote.low) + (filed?.high ?? quote.high)) / 2
          )}
          offsetFraction={percentage / 100}
          startYear={new Date().getFullYear()}
        />

        <h3 className="text-[22px] font-semibold text-neutral-900">{UI.successTitle}</h3>
        <p className="text-[17px] text-neutral-700">{UI.successBody}</p>

        {/* The lead id, not the store's current one: the store is cleared on
            this screen, and the answer belongs to the lead that was filed. */}
        <CallTimeAsk leadId={filedLeadId} />
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
        <p data-testid="estimate-note" className="mt-1 text-center text-[15px] text-neutral-500">
          {UI.estimateNote}
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
            className="min-h-[48px] text-[17px] font-semibold text-neutral-900 underline underline-offset-2"
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
