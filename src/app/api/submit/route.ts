import { google } from 'googleapis';
import { NextResponse } from 'next/server';

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

async function ensureLeadRow(tabName: string, leadId: string): Promise<number> {
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

export async function POST(request: Request) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const body = await request.json();
    console.log("stp1", { version: 'v4', auth }, sheets)
    const { tabName, leadId, column, value } = body;
    console.log("stp1 body", body)

    if (!tabName || !leadId) {
      return NextResponse.json(
        { error: 'tabName and leadId are required' },
        { status: 400 }
      );
    }

    // Step 1: Ensure leadId exists in column A, get its row
    const row = await ensureLeadRow(tabName, leadId);
    console.log("stp1 row", tabName, leadId, row)

    if (!column || typeof value === 'undefined') {
      // Step 2: No quiz data — just inserting leadId
      return NextResponse.json({
        success: true,
        message: 'Lead ID ensured',
        leadId,
        row,
      });
    }

    // Step 3: Update specified cell
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
    console.log("stp1 updateRes", colLetter, cell, leadId, updateRes)
    console.log("stp1 updateRes ret", {
      success: true,
      updatedCell: cell,
      response: updateRes.data,
    })

    return NextResponse.json({
      success: true,
      updatedCell: cell,
      response: updateRes.data,
    });

  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update sheet',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
