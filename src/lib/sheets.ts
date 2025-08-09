import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { withRetry } from './utils';

// Type aliases for Google Sheets responses
type UpdateRes = sheets_v4.Schema$UpdateValuesResponse;

const auth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function getColumnLetter(column: string | number): string {
  if (typeof column === 'number') {
    let col = column;
    let letter = '';
    while (col > 0) {
      const rem = (col - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      col = Math.floor((col - 1) / 26);
    }
    return letter;
  }
  return column.toUpperCase();
}

async function ensureLeadRowInternal(tabName: string, leadId: string): Promise<number> {
  const sheets: sheets_v4.Sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: `${tabName}!A:A`,
  });

  const rows = response.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === leadId) {
      return i + 1; // Row index (1-indexed)
    }
  }

  // LeadId not found, so append it
  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: `${tabName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[leadId]],
    },
  });

  const updatedRange = appendRes.data.updates?.updatedRange;
  const match = updatedRange?.match(/!A(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

async function updateSheetCellInternal(tabName: string, row: number, column: string | number, value: string): Promise<UpdateRes> {
  const sheets: sheets_v4.Sheets = google.sheets({ version: 'v4', auth });
  const colLetter = getColumnLetter(column);
  const cell = `${tabName}!${colLetter}${row}`;

  const updateRes = await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: cell,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[value]],
    },
  });

  if (!updateRes.data) {
    throw new Error('Sheets update returned no data');
  }

  return updateRes.data;
}

// Wrapped functions with retry logic
export async function ensureLeadRow(tabName: string, leadId: string): Promise<number> {
  return withRetry(async () => {
    const result = await ensureLeadRowInternal(tabName, leadId);
    if (result === -1) {
      throw new Error('Failed to ensure lead row: no valid row returned');
    }
    return result;
  }, 4, 400);
}

export async function updateSheetCell(tabName: string, row: number, column: string | number, value: string): Promise<UpdateRes> {
  return withRetry(async () => {
    const result = await updateSheetCellInternal(tabName, row, column, value);
    if (!result) {
      throw new Error('Sheets update failed: no result');
    }
    return result;
  }, 4, 400);
}

// --- LeadIndex helpers ---
async function findLeadByIdInternal(id: string): Promise<{ rowRef: string | number } | null> {
  const sheets: sheets_v4.Sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: 'LeadIndex!A:B',
  });

  const rows = response.data.values || [];
  
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      return { rowRef: rows[i][1] || (i + 1) }; // Use stored rowRef or fallback to index
    }
  }

  return null;
}

async function indexLeadIdInternal(id: string, rowRef: string | number) {
  const sheets: sheets_v4.Sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: 'LeadIndex!A:C',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[id, rowRef, Date.now()]],
    },
  });
}

export async function findLeadById(id: string): Promise<{ rowRef: string | number } | null> {
  return withRetry(async () => {
    return await findLeadByIdInternal(id);
  }, 4, 400);
}

export async function indexLeadId(id: string, rowRef: string | number) {
  return withRetry(async () => {
    await indexLeadIdInternal(id, rowRef);
  }, 4, 400);
}

export async function ensureLeadIndexed(id: string, rowRef: string | number) {
  const existing = await findLeadById(id);
  if (existing) return existing;
  await indexLeadId(id, rowRef);
  return { rowRef };
}

// Write lead to main sheet and return rowRef
async function writeLeadToSheetInternal(lead: unknown): Promise<{ rowRef: number }> {
  const sheets: sheets_v4.Sheets = google.sheets({ version: 'v4', auth });
  
  // Prepare the row data - mapping lead fields to columns
  const leadObj = lead as Record<string, unknown>;
  const rowData: (string | number | boolean | null)[] = [
    String(leadObj.id || ""),           // A: lead_id
    String(leadObj.state || ""),        // B: state
    String(leadObj.address || ""),      // C: address
    String(leadObj.email || ""),        // D: email
    String(leadObj.phone || ""),        // E: phone
    leadObj.quote ? JSON.stringify(leadObj.quote) : "", // F: quote JSON
    leadObj.ts ? new Date(leadObj.ts as number).toISOString() : "", // G: timestamp
  ];

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
    range: 'Leads!A:G',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowData],
    },
  });

  const updatedRange = appendRes.data.updates?.updatedRange;
  const match = updatedRange?.match(/!A(\d+)/);
  const rowRef = match ? parseInt(match[1], 10) : -1;
  
  if (rowRef === -1) {
    throw new Error('Failed to get row reference from append operation');
  }

  return { rowRef };
}

export async function writeLeadToSheet(lead: unknown): Promise<{ rowRef: number }> {
  return withRetry(async () => {
    return await writeLeadToSheetInternal(lead);
  }, 4, 400);
}

// Update existing lead row
async function updateLeadRowInternal(rowRef: string | number, lead: unknown): Promise<void> {
  const sheets: sheets_v4.Sheets = google.sheets({ version: 'v4', auth });
  const row = typeof rowRef === 'string' ? parseInt(rowRef, 10) : rowRef;
  
  // Prepare update data - only update fields that are provided
  const updates: Array<{ range: string; values: string[][] }> = [];
  const leadObj = lead as Record<string, unknown>;
  
  if (leadObj.state) updates.push({ range: `Leads!B${row}`, values: [[leadObj.state as string]] });
  if (leadObj.address) updates.push({ range: `Leads!C${row}`, values: [[leadObj.address as string]] });
  if (leadObj.email) updates.push({ range: `Leads!D${row}`, values: [[leadObj.email as string]] });
  if (leadObj.phone) updates.push({ range: `Leads!E${row}`, values: [[leadObj.phone as string]] });
  if (leadObj.quote) updates.push({ range: `Leads!F${row}`, values: [[JSON.stringify(leadObj.quote)]] });
  if (leadObj.ts) updates.push({ range: `Leads!G${row}`, values: [[new Date(leadObj.ts as number).toISOString()]] });

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });
  }
}

export async function updateLeadRow(rowRef: string | number, lead: unknown): Promise<void> {
  return withRetry(async () => {
    await updateLeadRowInternal(rowRef, lead);
  }, 4, 400);
}