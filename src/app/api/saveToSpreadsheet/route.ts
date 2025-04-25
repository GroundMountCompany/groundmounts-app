import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { spreadsheetId, tabName, data } = body;

    // Konfigurasi kredensial Google
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').split(String.raw`\n`).join('\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Konversi data menjadi array values
    const values = Object.values(data);
    console.log("spreadsheet", spreadsheetId, tabName, data)
    // Append data ke spreadsheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving to spreadsheet:', error);
    return NextResponse.json({ error: 'Failed to save to spreadsheet' }, { status: 500 });
  }
}
