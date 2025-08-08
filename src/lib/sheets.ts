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

function getColumnLetter(column: string | number): string {
  if (typeof column === 'number') {
    let col = column;
    let letter = '';
    while (col > 0) {
      let rem = (col - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      col = Math.floor((col - 1) / 26);
    }
    return letter;
  }
  return column.toUpperCase();
}

async function ensureLeadRowInternal(tabName: string, leadId: string): Promise<number> {
  const sheets = google.sheets({ version: 'v4', auth });

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

async function updateSheetCellInternal(tabName: string, row: number, column: string | number, value: string): Promise<any> {
  const sheets = google.sheets({ version: 'v4', auth });
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

export async function updateSheetCell(tabName: string, row: number, column: string | number, value: string): Promise<any> {
  return withRetry(async () => {
    const result = await updateSheetCellInternal(tabName, row, column, value);
    if (!result) {
      throw new Error('Sheets update failed: no result');
    }
    return result;
  }, 4, 400);
}