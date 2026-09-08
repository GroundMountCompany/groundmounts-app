'use client';

import { useState } from 'react';
import { UI } from '@/config/copy';
import { requestResumeEmail } from '@/lib/partialSave';
import { track } from '@/lib/analytics';

type Phase = 'link' | 'asking' | 'sending' | 'sent' | 'failed';

/**
 * A way out that is not giving up.
 *
 * The middle of this funnel asks somebody to stand in their garden and draw an
 * array on a satellite photo. People get interrupted. Without this the only
 * exits are finishing and closing the tab, and closing the tab is the one the
 * owner loses.
 *
 * Small and quiet on purpose: it must not compete with Continue. It is a link,
 * not a button, and it is the last thing on the step rather than the first.
 */
export default function FinishLater() {
  const [phase, setPhase] = useState<Phase>('link');
  const [email, setEmail] = useState('');

  const submit = async () => {
    const trimmed = email.trim();
    // Deliberately the same shape the server checks. A message here beats a
    // round trip that comes back saying the same thing.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setPhase('failed');
      return;
    }
    setPhase('sending');
    track('resume_requested');
    setPhase((await requestResumeEmail(trimmed)) ? 'sent' : 'failed');
  };

  if (phase === 'sent') {
    return (
      <p data-testid="finish-later-sent" className="text-[16px] text-neutral-700">
        {UI.finishLaterSent}
      </p>
    );
  }

  if (phase === 'link') {
    return (
      <button
        type="button"
        data-testid="finish-later"
        onClick={() => setPhase('asking')}
        className="min-h-[44px] text-[16px] text-neutral-600 underline underline-offset-2"
      >
        {UI.finishLater}
      </button>
    );
  }

  return (
    <div data-testid="finish-later-form" className="space-y-2">
      <label className="block">
        <span className="block text-[16px] text-neutral-700">{UI.finishLaterPrompt}</span>
        <input
          id="finish-later-email"
          data-testid="finish-later-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear the complaint as soon as they start fixing it.
            if (phase === 'failed') setPhase('asking');
          }}
          className="mt-1 h-14 w-full rounded-xl border border-neutral-300 px-4 text-[17px] outline-none focus:border-neutral-500"
        />
      </label>

      {phase === 'failed' && (
        <p data-testid="finish-later-failed" className="text-[15px] text-amber-700">
          {UI.finishLaterFailed}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="finish-later-send"
          disabled={phase === 'sending'}
          onClick={submit}
          className="min-h-[48px] flex-1 rounded-xl bg-neutral-900 px-4 text-[16px] font-semibold text-white disabled:opacity-60"
        >
          {phase === 'sending' ? UI.finishLaterSending : UI.finishLaterSend}
        </button>
        <button
          type="button"
          data-testid="finish-later-cancel"
          onClick={() => setPhase('link')}
          className="min-h-[48px] rounded-xl border border-neutral-300 px-4 text-[16px] text-neutral-900"
        >
          {UI.finishLaterCancel}
        </button>
      </div>

      {/* Said plainly, next to the box. An email address given here buys a
          link back and nothing else. */}
      <p className="text-[15px] text-neutral-500">{UI.finishLaterNote}</p>
    </div>
  );
}
