'use client';

import { useState } from 'react';
import { UI } from '@/config/copy';
import { CALL_TIMES, type CallTime } from '@/lib/callTime';
import { track } from '@/lib/analytics';

/**
 * The one question left after the quote.
 *
 * It replaces a "Book a call" button that opened Calendly. Owner QA on the
 * people this tool is for: a booking calendar asks somebody who has just been
 * shown a five-figure number to pick a thirty-minute slot on a Tuesday, and
 * most of them closed the tab instead. "When's a good time?" with three chips
 * is the same information, asked the way a person would ask it.
 *
 * A failure here is quiet and recoverable. The lead is already filed, the
 * owner is already going to ring them, and a customer who taps a chip and sees
 * an error learns only that something is broken. So a failed write says so
 * plainly and leaves the chips up to try again.
 */
export default function CallTimeAsk({ leadId }: { leadId: string | null }) {
  const [chosen, setChosen] = useState<CallTime | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState<CallTime | null>(null);

  const choose = async (when: CallTime) => {
    if (!leadId || sending) return;
    setSending(when);
    setFailed(false);
    track('call_time_selected', { when });

    try {
      const res = await fetch('/api/call-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, when }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && json.ok) setChosen(when);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(null);
    }
  };

  return (
    <div data-testid="call-time" className="space-y-3">
      {chosen ? (
        <p data-testid="call-time-done" className="text-[17px] font-semibold text-neutral-900">
          {UI.callTimeGotIt(chosen)}
        </p>
      ) : (
        <>
          <p className="text-[17px] text-neutral-700">{UI.callTimeAsk}</p>
          <div className="flex gap-2">
            {CALL_TIMES.map((when) => (
              <button
                key={when}
                type="button"
                data-testid={`call-time-${when.toLowerCase()}`}
                disabled={sending !== null}
                onClick={() => void choose(when)}
                className="min-h-[56px] flex-1 basis-0 rounded-xl border border-neutral-300 bg-white px-2 text-[17px] font-semibold text-neutral-900 disabled:opacity-60"
              >
                {when}
              </button>
            ))}
          </div>
          {failed && (
            <p data-testid="call-time-failed" className="text-[15px] text-amber-700">
              {UI.callTimeFailed}
            </p>
          )}
        </>
      )}

      {/* Always on screen, answered or not. It is the only address on this
          page and the customer has just handed over five figures of intent. */}
      <p className="text-[16px] text-neutral-600">
        {UI.questionsPrefix}{' '}
        <a href={`mailto:${UI.contactEmail}`} className="underline underline-offset-2">
          {UI.contactEmail}
        </a>
      </p>
    </div>
  );
}
