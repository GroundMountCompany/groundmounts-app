'use client';

import { useRef, useState } from 'react';
import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';
import { MAX_MONTHS, sanitiseExtraction, type BillMonth } from '@/lib/billSchema';
import { downscaleImage } from '@/lib/downscaleImage';

/**
 * Upload a bill, then check what we read.
 *
 * Nothing here is a dead end. Every failure — unreadable photo, wrong file, a
 * model that timed out, a bill with no usage on it — lands on the same
 * sentence and leaves the manual fields below untouched and ready. The upload
 * is a shortcut, not a gate.
 *
 * Nothing is used unreviewed either: the extracted months are shown in an
 * editable table and only reach the sizing maths when the customer presses the
 * button that says so.
 *
 * The phase and the draft live in the store, not here. Somebody who confirms
 * their bill and then refreshes — or comes back tomorrow to a persisted
 * funnel — should see that it is confirmed, with a way to change it, rather
 * than an upload button offering to do the work again.
 */

export interface BillUploadProps {
  /** Called with the months the customer confirmed, and the annual total. */
  onConfirm: (months: BillMonth[], annualKwh: number, ratePerKwh: number | null) => void;
  /** Called when they throw it away, so sizing goes back to the typed figures. */
  onDiscard: () => void;
}

/** A year's usage from however many months we have. */
export function annualFromMonths(months: BillMonth[]): { annual: number; scaled: boolean } {
  // Capped as well as sorted upstream: a year is twelve months wherever the
  // count is added up, so no path can size against thirteen.
  const usable = months
    .filter((m) => Number.isFinite(m.kwh) && m.kwh > 0)
    .slice(0, MAX_MONTHS);
  if (!usable.length) return { annual: 0, scaled: false };

  const total = usable.reduce((sum, m) => sum + m.kwh, 0);
  if (usable.length >= MAX_MONTHS) return { annual: Math.round(total), scaled: false };

  // Fewer than twelve months is a partial picture, and a partial picture
  // scaled up is a guess — so it is scaled, and the screen says so rather than
  // presenting the number as if it were read off the page.
  return { annual: Math.round((total / usable.length) * 12), scaled: true };
}

const money = (amount: number) =>
  amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function BillUpload({ onConfirm, onDiscard }: BillUploadProps) {
  const phase = useQuoteStore((s) => s.billPhase);
  const setPhase = useQuoteStore((s) => s.setBillPhase);
  const draft = useQuoteStore((s) => s.billDraft);
  const draftRate = useQuoteStore((s) => s.billDraftRate);
  const setDraft = useQuoteStore((s) => s.setBillDraft);
  const confirmed = useQuoteStore((s) => s.billMonths);
  const confirmedAnnual = useQuoteStore((s) => s.billAnnualKwh);
  const clearBill = useQuoteStore((s) => s.clearBillMonths);

  // Only the failure message is local: it describes one attempt, not the
  // funnel's state, and it should not survive a refresh.
  const [reason, setReason] = useState(UI.billFailed);
  const [failed, setFailed] = useState(false);
  // Two inputs, because one cannot be both.
  //
  // `capture` is not a hint on iOS — it *replaces* the picker with the camera,
  // so a customer whose bill is already a photo in their library had no way in
  // at all. The camera stays, because somebody standing at their meter box
  // wants it, but it is now one of two doors rather than the only one.
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const months = draft ?? [];

  const upload = async (file: File) => {
    setFailed(false);
    setPhase('reading');
    try {
      // Shrunk here, not apologised for later: a phone photo is 8-12 MB and
      // Vercel rejects a body over 4.5 MB before this route sees it.
      const upload = await downscaleImage(file);

      // Test hook. What matters is the size of what leaves the browser, and
      // Playwright does not hand back the body of a multipart upload — so the
      // e2e reads it here instead. Set only by playwright.config.ts; the
      // comparison inlines to `false` in a real build and the branch is
      // dropped. See MapCanvas for why this is not gated on NODE_ENV.
      if (process.env.NEXT_PUBLIC_E2E_HOOKS === '1') {
        cameraRef.current?.setAttribute('data-upload-bytes', String(upload.size));
        cameraRef.current?.setAttribute('data-original-bytes', String(file.size));
      }

      const form = new FormData();
      form.append('file', upload);

      const res = await fetch('/api/bill/extract', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok || !json.extraction?.months?.length) {
        setReason(typeof json?.reason === 'string' ? json.reason : UI.billFailed);
        setFailed(true);
        setPhase('none');
        return;
      }

      // Sanitised again here, with the same function the route uses. The
      // route caps and orders what the model returns; this caps and orders
      // what arrives over the network, so the table can never show a
      // thirteenth month whatever the response says.
      const clean = sanitiseExtraction(json.extraction);
      if (!clean.months.length) {
        setReason(UI.billFailed);
        setFailed(true);
        setPhase('none');
        return;
      }
      setDraft(clean.months, clean.ratePerKwh);
    } catch {
      setReason(UI.billFailed);
      setFailed(true);
      setPhase('none');
    }
  };

  const editKwh = (index: number, raw: string) => {
    const kwh = Number(raw.replace(/[^\d]/g, ''));
    setDraft(
      months.map((m, i) => (i === index ? { ...m, kwh: Number.isFinite(kwh) ? kwh : 0 } : m)),
      draftRate
    );
  };

  /** Typed in cents, stored in dollars — the same units the rate field uses. */
  const editRate = (raw: string) => {
    const cents = Number(raw.replace(/[^\d.]/g, ''));
    setDraft(months, Number.isFinite(cents) && cents > 0 ? cents / 100 : null);
  };

  /** Both inputs land here — the file is a file however it was chosen. */
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    // Cleared so choosing the same file twice still fires.
    e.target.value = '';
  };

  const { annual, scaled } = annualFromMonths(months);
  const rateCentsText = draftRate ? String(Math.round(draftRate * 100)) : '';

  return (
    <div className="space-y-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        // The camera door. On iOS this bypasses the picker entirely.
        capture="environment"
        data-testid="bill-file"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={libraryRef}
        type="file"
        // No `capture` attribute, deliberately: its absence is what makes iOS
        // offer Photo Library and Browse (Files). Adding one back closes the
        // only route in for a bill that is already saved on the phone.
        accept="image/*,application/pdf"
        data-testid="bill-file-library"
        className="hidden"
        onChange={onPick}
      />

      {phase === 'confirmed' && (
        <div
          data-testid="bill-confirmed"
          className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3"
        >
          <span className="text-[16px] text-neutral-800">
            {UI.billConfirmed} {(confirmedAnnual ?? 0).toLocaleString()} {UI.billAnnualSuffix}
          </span>
          <button
            type="button"
            data-testid="bill-edit"
            onClick={() => setDraft(confirmed ?? [], draftRate)}
            className="min-h-[44px] shrink-0 text-[16px] font-semibold text-neutral-900 underline"
          >
            {UI.billEditAgain}
          </button>
        </div>
      )}

      {phase !== 'review' && phase !== 'confirmed' && (
        <div className="space-y-2">
          <button
            type="button"
            data-testid="bill-upload"
            disabled={phase === 'reading'}
            onClick={() => cameraRef.current?.click()}
            className="min-h-[56px] w-full rounded-xl border border-dashed border-neutral-400 px-4 py-3 text-left disabled:opacity-60"
          >
            <span className="block text-[17px] font-semibold text-neutral-900">
              {phase === 'reading' ? UI.billReading : UI.billTakePhoto}
            </span>
            <span className="block text-[15px] text-neutral-500">{UI.billTakePhotoNote}</span>
          </button>
          <button
            type="button"
            data-testid="bill-upload-library"
            disabled={phase === 'reading'}
            onClick={() => libraryRef.current?.click()}
            className="min-h-[56px] w-full rounded-xl border border-dashed border-neutral-400 px-4 py-3 text-left disabled:opacity-60"
          >
            <span className="block text-[17px] font-semibold text-neutral-900">
              {UI.billChooseFile}
            </span>
            <span className="block text-[15px] text-neutral-500">
              {failed ? reason : UI.billChooseFileNote}
            </span>
          </button>
        </div>
      )}

      {failed && phase === 'none' && (
        <p data-testid="bill-failed" className="text-[15px] text-neutral-600">
          {reason}
        </p>
      )}

      {phase === 'review' && (
        <div
          data-testid="bill-review"
          className="space-y-3 rounded-xl border border-neutral-200 p-3"
        >
          <div>
            <p className="text-[17px] font-semibold text-neutral-900">{UI.billMonthsTitle}</p>
            <p className="text-[15px] text-neutral-600">{UI.billMonthsNote}</p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-3 text-[15px] uppercase tracking-wide text-neutral-500">
              <span className="flex-1">{UI.billMonthHeader}</span>
              <span className="w-20 text-right">{UI.billCostHeader}</span>
              <span className="w-24 text-right">{UI.billKwhHeader}</span>
            </div>
            {months.map((month, i) => (
              <div key={`${month.month}-${i}`} className="flex items-center gap-3">
                <span className="flex-1 text-[17px] text-neutral-900">{month.month}</span>
                {/* Read-only: the cost helps them recognise the month, and the
                    sizing does not use it. */}
                <span
                  data-testid={`bill-cost-${i}`}
                  className="w-20 text-right text-[16px] text-neutral-500"
                >
                  {month.cost === null ? UI.billNoCost : money(month.cost)}
                </span>
                <input
                  data-testid={`bill-kwh-${i}`}
                  inputMode="numeric"
                  aria-label={`${month.month} ${UI.billKwhHeader}`}
                  value={month.kwh === 0 ? '' : String(month.kwh)}
                  onChange={(e) => editKwh(i, e.target.value)}
                  className="h-12 w-24 rounded-lg border border-neutral-300 px-3 text-right text-[17px]"
                />
              </div>
            ))}
          </div>

          <label className="flex items-center gap-3">
            <span className="flex-1 text-[16px] text-neutral-700">{UI.billRateLabel}</span>
            <input
              data-testid="bill-rate"
              inputMode="decimal"
              value={rateCentsText}
              placeholder={UI.billRatePlaceholder}
              onChange={(e) => editRate(e.target.value)}
              className="h-12 w-24 rounded-lg border border-neutral-300 px-3 text-right text-[17px]"
            />
          </label>

          <p data-testid="bill-annual" className="text-[16px] text-neutral-700">
            {UI.billAnnualPrefix} {annual.toLocaleString()} {UI.billAnnualSuffix}
          </p>
          {scaled && (
            <p data-testid="bill-scaled" className="text-[15px] text-neutral-500">
              {UI.billScaledNote}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="bill-confirm"
              onClick={() => onConfirm(months, annual, draftRate)}
              className="min-h-[56px] flex-1 rounded-xl bg-neutral-900 px-4 text-[17px] font-semibold text-white"
            >
              {UI.billMonthsUse}
            </button>
            <button
              type="button"
              data-testid="bill-discard"
              onClick={() => {
                // Back to the typed figures entirely: the stored months go, and
                // so does the annual total that was overriding them.
                clearBill();
                setFailed(false);
                onDiscard();
              }}
              className="min-h-[56px] rounded-xl border border-neutral-300 px-4 text-[17px] font-medium text-neutral-900"
            >
              {UI.billMonthsDiscard}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
