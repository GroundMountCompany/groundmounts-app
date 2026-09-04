const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = 'Leads';

import type { LeadFields } from './airtableSchema';

export type { LeadFields };

/**
 * Extract Airtable's machine-readable error reason without echoing the request.
 * Airtable error bodies describe the schema problem (e.g. UNKNOWN_FIELD_NAME),
 * not the submitted values, so this is safe to surface; the raw body is not.
 */
function airtableErrorReason(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const type = parsed?.error?.type;
    const message = parsed?.error?.message;
    if (type || message) return [type, message].filter(Boolean).join(': ').slice(0, 200);
  } catch {
    // fall through
  }
  return 'unparseable_error_body';
}

/**
 * Create or update the one record for this funnel.
 *
 * Airtable's upsert merges on a field value rather than a record id, which is
 * what lets a partial save at step 1 and the final submit twenty minutes later
 * be the same row. Without it the owner would get four rows per customer and
 * would have to work out which was the real one.
 *
 * `typecast` lets Airtable widen a single-select to a value it has not seen
 * before — the alternative is a 422 that loses the lead over a missing option.
 *
 * @param leadId Client-generated funnel id, used only for log correlation.
 *               Never log `fields` — a final submit carries name, email, phone
 *               and address.
 */
export async function upsertLeadByLeadId(fields: LeadFields, leadId: string) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('[AIRTABLE_CONFIG_ERROR] Missing:', {
      hasApiKey: !!AIRTABLE_API_KEY,
      hasBaseId: !!AIRTABLE_BASE_ID,
    });
    throw new Error('Airtable configuration missing');
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

  console.log('[AIRTABLE_REQUEST] upsertLead', leadId, 'step:', fields['Step Reached'] ?? 'final');

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: ['Lead ID'] },
      typecast: true,
      records: [{ fields: { ...fields, 'Lead ID': leadId } }],
    }),
  });

  if (!response.ok) {
    const reason = airtableErrorReason(await response.text());
    console.error(
      '[AIRTABLE_ERROR] upsertLead',
      leadId,
      'status:', response.status,
      'reason:', reason
    );
    throw new Error(`Airtable error: ${response.status} - ${reason}`);
  }

  const result = await response.json();
  const record = result.records?.[0];
  const created = (result.createdRecords ?? []).length > 0;
  console.log('[AIRTABLE_SUCCESS] upsertLead', leadId, created ? 'created' : 'updated', record?.id);
  return { id: record?.id as string | undefined, created };
}

// State name to abbreviation mapping
const STATE_ABBREVIATIONS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

// Helper to parse address into components
export function parseAddress(fullAddress: string): { city?: string; state?: string; zip?: string } {
  // Expected formats:
  // "123 Main St, Fort Worth, TX 76131"
  // "123 Main St, Fort Worth, Texas 76131"
  // "123 Main St, Fort Worth, Texas 76131, United States"
  // "123 Main St, Fort Worth, Texas 76131, USA"

  let parts = fullAddress.split(',').map(p => p.trim());

  if (parts.length < 2) {
    return {};
  }

  // Remove country if present (last part)
  const lastPart = parts[parts.length - 1].toLowerCase();
  if (lastPart === 'usa' || lastPart === 'united states' || lastPart === 'us') {
    parts = parts.slice(0, -1);
  }

  if (parts.length < 2) {
    return {};
  }

  // State/zip part is now the last part: "TX 76131" or "Texas 76131"
  const stateZipPart = parts[parts.length - 1];

  // Try to match abbreviated state (2 uppercase letters) with optional zip
  const abbrevMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5}(-\d{4})?)?$/);

  let state: string | undefined;
  let zip: string | undefined;

  if (abbrevMatch) {
    state = abbrevMatch[1];
    zip = abbrevMatch[2];
  } else {
    // Try to match spelled-out state name with zip
    // e.g., "Texas 76131" or just "Texas"
    const spelledMatch = stateZipPart.match(/^([A-Za-z\s]+?)\s*(\d{5}(-\d{4})?)?$/);
    if (spelledMatch) {
      const stateName = spelledMatch[1].trim().toLowerCase();
      state = STATE_ABBREVIATIONS[stateName];
      zip = spelledMatch[2];
    }
  }

  // City is the second-to-last part
  const city = parts.length >= 2 ? parts[parts.length - 2] : undefined;

  return { city, state, zip };
}
