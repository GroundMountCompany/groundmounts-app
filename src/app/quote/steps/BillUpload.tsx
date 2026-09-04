'use client';

import { useRef, useState } from 'react';
import { UI } from '@/config/copy';
import type { BillMonth } from '@/lib/billSchema';

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
 */

type Phase = 'idle' | 'reading' | 'review' | 'confirmed' | 'failed';

export interface BillUploadProps {
  /** Called with the months the customer confirmed, and the annual total. */
  onConfirm: (months: BillMonth[], annualKwh: number, scaled: boolean) => void;
}

/** A year's usage from however many months we have. */
export function annualFromMonths(months: BillMonth[]): { annual: number; scaled: boolean } {
  const usable = months.filter((m) => Number.isFinite(m.kwh) && m.kwh > 0);
  if (!usable.length) return { annual: 0, scaled: false };

  const total = usable.reduce((sum, m) => sum + m.kwh, 0);
  if (usable.length >= 12) return { annual: Math.round(total), scaled: false };

  // Fewer than twelve months is a partial picture, and a partial picture
  // scaled up is a guess — so it is scaled, and the screen says so rather than
  // presenting the number as if it were read off the page.
  return { annual: Math.round((total / usable.length) * 12), scaled: true };
}

export default function BillUpload({ onConfirm }: BillUploadProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [reason, setReason] = useState(UI.billFailed);
  const [months, setMonths] = useState<BillMonth[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setPhase('reading');
    try {
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/bill/extract', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok || !json.extraction?.months?.length) {
        setReason(typeof json?.reason === 'string' ? json.reason : UI.billFailed);
        setPhase('failed');
        return;
      }

      setMonths(json.extraction.months as BillMonth[]);
      setPhase('review');
    } catch {
      setReason(UI.billFailed);
      setPhase('failed');
    }
  };

  const editKwh = (index: number, raw: string) => {
    const kwh = Number(raw.replace(/[^\d]/g, ''));
    setMonths((current) =>
      current.map((m, i) => (i === index ? { ...m, kwh: Number.isFinite(kwh) ? kwh : 0 } : m))
    );
  };

  const { annual, scaled } = annualFromMonths(months);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        // `capture` opens the camera on a phone rather than the file browser,
        // which is what somebody standing next to their meter box wants.
        accept="image/jpeg,image/png,application/pdf"
        capture="environment"
        data-testid="bill-file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          // Cleared so choosing the same file twice still fires.
          e.target.value = '';
        }}
      />

      {phase === 'confirmed' && (
        <div
          data-testid="bill-confirmed"
          className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3"
        >
          <span className="text-[16px] text-neutral-800">
            {UI.billConfirmed} {annual.toLocaleString()} {UI.billAnnualSuffix}
          </span>
          <button
            type="button"
            data-testid="bill-edit"
            onClick={() => setPhase('review')}
            className="min-h-[44px] shrink-0 text-[16px] font-semibold text-neutral-900 underline"
          >
            {UI.billEditAgain}
          </button>
        </div>
      )}

      {phase !== 'review' && phase !== 'confirmed' && (
        <button
          type="button"
          data-testid="bill-upload"
          disabled={phase === 'reading'}
          onClick={() => inputRef.current?.click()}
          className="min-h-[56px] w-full rounded-xl border border-dashed border-neutral-400 px-4 py-3 text-left disabled:opacity-60"
        >
          <span className="block text-[17px] font-semibold text-neutral-900">
            {phase === 'reading' ? UI.billReading : UI.billUpload}
          </span>
          <span className="block text-[15px] text-neutral-500">
            {phase === 'failed' ? reason : UI.billUploadNote}
          </span>
        </button>
      )}

      {phase === 'failed' && (
        <p data-testid="bill-failed" className="text-[15px] text-neutral-600">
          {reason}
        </p>
      )}

      {phase === 'review' && (
        <div data-testid="bill-review" className="space-y-3 rounded-xl border border-neutral-200 p-3">
          <div>
            <p className="text-[17px] font-semibold text-neutral-900">{UI.billMonthsTitle}</p>
            <p className="text-[15px] text-neutral-600">{UI.billMonthsNote}</p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-3 text-[15px] uppercase tracking-wide text-neutral-500">
              <span className="flex-1">{UI.billMonthHeader}</span>
              <span className="w-28 text-right">{UI.billKwhHeader}</span>
            </div>
            {months.map((month, i) => (
              <div key={`${month.month}-${i}`} className="flex items-center gap-3">
                <span className="flex-1 text-[17px] text-neutral-900">{month.month}</span>
                <input
                  data-testid={`bill-kwh-${i}`}
                  inputMode="numeric"
                  value={month.kwh === 0 ? '' : String(month.kwh)}
                  onChange={(e) => editKwh(i, e.target.value)}
                  className="h-12 w-28 rounded-lg border border-neutral-300 px-3 text-right text-[17px]"
                />
              </div>
            ))}
          </div>

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
              onClick={() => {
                // Collapse to a line the customer can re-open. Leaving the
                // table up after "Use these numbers" gives them no signal that
                // anything happened, and two places showing usage at once.
                setPhase('confirmed');
                onConfirm(months, annual, scaled);
              }}
              className="min-h-[56px] flex-1 rounded-xl bg-neutral-900 px-4 text-[17px] font-semibold text-white"
            >
              {UI.billMonthsUse}
            </button>
            <button
              type="button"
              data-testid="bill-discard"
              onClick={() => {
                setMonths([]);
                setPhase('idle');
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
