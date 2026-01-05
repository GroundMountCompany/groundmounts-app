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
    throw new Error('Airtable configuration missing');
  }

  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AIRTABLE_ERROR]', response.status, errorText);
    throw new Error(`Airtable error: ${response.statusText}`);
  }

  return response.json();
}

// Helper to parse address into components
export function parseAddress(fullAddress: string): { city?: string; state?: string; zip?: string } {
  // Expected format: "123 Main St, City, TX 75001" or similar
  const parts = fullAddress.split(',').map(p => p.trim());

  if (parts.length < 2) {
    return {};
  }

  // Last part usually has state and zip: "TX 75001"
  const lastPart = parts[parts.length - 1];
  const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)?/);

  const state = stateZipMatch?.[1];
  const zip = stateZipMatch?.[2];

  // City is typically the second-to-last part
  const city = parts.length >= 2 ? parts[parts.length - 2] : undefined;

  return { city, state, zip };
}
