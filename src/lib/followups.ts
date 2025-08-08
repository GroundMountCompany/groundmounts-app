// src/lib/followups.ts
// Wire these to your existing Sheets client read/write fns used in src/lib/sheets.ts
// Keep implementations minimal; do not change auth or env wiring here.

import { google } from 'googleapis';
import { withRetry } from './utils';

const auth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export type FollowupRow = {
  lead_id: string;
  email: string;
  created_at_ms: number;
  followup_due_ms: number;
  followup_sent: boolean;
  // Store serialized quote data for follow-up email
  quote_data?: string;
};

const FOLLOWUPS_SHEET_NAME = process.env.FOLLOWUPS_SHEET_NAME || "Followups";

// Internal functions for Sheets operations
async function appendFollowupRowInternal(row: FollowupRow): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  const values = [
    row.lead_id,
    row.email,
    row.created_at_ms.toString(),
    row.followup_due_ms.toString(),
    row.followup_sent.toString(),
    row.quote_data || ''
  ];

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: `${FOLLOWUPS_SHEET_NAME}!A:F`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [values],
    },
  });

  if (!appendRes.data.updates?.updatedRows) {
    throw new Error('Failed to append followup row');
  }
}

async function fetchAllFollowupsInternal(): Promise<{ rows: any[][], rowStartIndex: number }> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: `${FOLLOWUPS_SHEET_NAME}!A:F`,
  });

  const rows = response.data.values || [];
  return { rows, rowStartIndex: 1 }; // Sheets are 1-indexed
}

async function updateFollowupSentInternal(rowIndex: number): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth });
  
  const updateRes = await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: `${FOLLOWUPS_SHEET_NAME}!E${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['TRUE']],
    },
  });

  if (!updateRes.data) {
    throw new Error('Failed to update followup sent status');
  }
}

// Public API functions with retry logic
export async function enqueueFollowup(row: FollowupRow): Promise<void> {
  return withRetry(async () => {
    await appendFollowupRowInternal(row);
  }, 4, 400);
}

export async function fetchDueFollowups(nowMs: number): Promise<FollowupRow[]> {
  return withRetry(async () => {
    const { rows } = await fetchAllFollowupsInternal();
    
    const dueFollowups: FollowupRow[] = [];
    
    for (const row of rows) {
      if (row.length >= 5) {
        const leadId = row[0];
        const email = row[1];
        const createdAtMs = parseInt(row[2], 10);
        const followupDueMs = parseInt(row[3], 10);
        const followupSent = row[4]?.toLowerCase() === 'true';
        const quoteData = row[5] || '';
        
        // Check if due and not sent
        if (!followupSent && followupDueMs <= nowMs) {
          dueFollowups.push({
            lead_id: leadId,
            email,
            created_at_ms: createdAtMs,
            followup_due_ms: followupDueMs,
            followup_sent: followupSent,
            quote_data: quoteData,
          });
        }
      }
    }
    
    return dueFollowups;
  }, 4, 400);
}

export async function markFollowupSent(lead_id: string): Promise<void> {
  return withRetry(async () => {
    const { rows, rowStartIndex } = await fetchAllFollowupsInternal();
    
    // Find the row with matching lead_id
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === lead_id) {
        const rowIndex = rowStartIndex + i;
        await updateFollowupSentInternal(rowIndex);
        return;
      }
    }
    
    throw new Error(`Lead ID ${lead_id} not found in followups sheet`);
  }, 4, 400);
}