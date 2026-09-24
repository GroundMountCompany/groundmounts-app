import type { LeadFields } from './airtableSchema';

/**
 * The words that mean "never contact this person".
 *
 * Shared with the phone agent (tgmc-agent), which writes exactly this phrase
 * into `disqualify_reason` when somebody says stop on a call or texts STOP,
 * and treats any record carrying it as do-not-contact. Same words here, so an
 * email unsubscribe is honoured by the phone agent and a STOP text by the
 * email follow-up, without either knowing about the other.
 */
export const OPT_OUT_PHRASE = 'asked not to be contacted';

export function isOptedOut(reason: unknown): boolean {
  return typeof reason === 'string' && reason.toLowerCase().includes(OPT_OUT_PHRASE);
}

/**
 * What to write when somebody clicks unsubscribe, or null when nothing needs
 * writing because it is already recorded.
 *
 * Status is left alone. An unsubscribe from marketing email does not make a
 * customer "Lost", and the owner decides what a lead's status is.
 *
 * An existing reason (say, "out of state") is kept and the opt-out appended,
 * rather than overwritten: both facts are worth having.
 */
export function unsubscribeFields(
  current: { email_status?: unknown; disqualify_reason?: unknown },
  now = new Date()
): LeadFields | null {
  const alreadyReason = isOptedOut(current.disqualify_reason);
  const alreadyStatus = current.email_status === 'unsubscribed';
  if (alreadyReason && alreadyStatus) return null;

  const fields: LeadFields = { email_status: 'unsubscribed' };
  if (!alreadyReason) {
    const note = `${OPT_OUT_PHRASE} (email, ${now.toISOString().slice(0, 10)})`;
    const existing = typeof current.disqualify_reason === 'string' ? current.disqualify_reason.trim() : '';
    fields.disqualify_reason = existing ? `${existing}; ${note}` : note;
  }
  return fields;
}
