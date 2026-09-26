import { upsertLeadByLeadId, getLeadRecord, updateLeadRecord } from '@/lib/airtable';
import type { LeadFields } from '@/lib/airtable';
import { cacheSet, storeGet } from '@/lib/server/redis';
import { PHONE_ROW_PREFIX } from '@/lib/leadKeys';

/**
 * How long a design stays linked to the caller's row.
 *
 * Matched to the quote email's own link to its lead: the webhook can't write
 * anything once that one is gone, so there's no point keeping this longer.
 */
export const PHONE_ROW_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Remember that this design was filed onto a caller's row.
 *
 * The design's Lead ID stays on its own partial row (see fileOnPhoneRow in the
 * leads route), so without this the call-time pick and the email events that
 * arrive later, keyed on that Lead ID, would land on the leftover partial.
 * Best-effort: a lost link sends those writes to the partial row, which is
 * where they always went.
 */
export async function rememberPhoneRow(leadId: string, recordId: string): Promise<void> {
  await cacheSet(PHONE_ROW_PREFIX + leadId, recordId, PHONE_ROW_TTL_SECONDS);
}

/**
 * Write a few fields to whichever row holds this lead.
 *
 * The caller's row, when the design was filed onto one; otherwise the design's
 * own row by Lead ID, as before. A caller who has since become a Customer is
 * not written to: those fields go to the design's row instead, and the
 * Customer's row is left exactly as the owner left it.
 *
 * Throws when the store or Airtable can't be read or written, so the caller
 * answers the way it already does for a failed write.
 */
export async function writeLeadFields(fields: LeadFields, leadId: string): Promise<void> {
  const recordId = await storeGet<string>(PHONE_ROW_PREFIX + leadId);
  if (recordId) {
    const current = await getLeadRecord(recordId);
    if (current.Status !== 'Customer') {
      await updateLeadRecord(recordId, fields);
      return;
    }
    console.log('[LEAD_ROW] caller row is a Customer now, writing to the design row', leadId);
  }
  await upsertLeadByLeadId(fields, leadId);
}
