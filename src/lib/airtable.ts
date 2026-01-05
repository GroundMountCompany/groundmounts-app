const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = 'Leads';

export interface LeadFields {
  Name?: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  City?: string;
  State?: string;
  Zip?: string;
  Panels?: number;
  'System Size kW'?: number;
  'Monthly Bill Avg'?: number;
  'Monthly Bill High'?: number;
  'Offset Percentage'?: number;
  'Trenching Distance ft'?: number;
  'Trenching Cost'?: number;
  'Total Investment'?: number;
  Source?: string;
  Status?: string;
}

export async function createLead(fields: LeadFields) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('[AIRTABLE_CONFIG_ERROR] Missing:', {
      hasApiKey: !!AIRTABLE_API_KEY,
      hasBaseId: !!AIRTABLE_BASE_ID,
    });
    throw new Error('Airtable configuration missing');
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const payload = { fields };

  console.log('[AIRTABLE_REQUEST] URL:', url);
  console.log('[AIRTABLE_REQUEST] Payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AIRTABLE_ERROR] Status:', response.status);
    console.error('[AIRTABLE_ERROR] StatusText:', response.statusText);
    console.error('[AIRTABLE_ERROR] Response:', errorText);
    console.error('[AIRTABLE_ERROR] Payload sent:', JSON.stringify(payload, null, 2));
    throw new Error(`Airtable error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('[AIRTABLE_SUCCESS] Record created:', result.id);
  return result;
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
