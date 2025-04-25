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

export async function POST(request: Request) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const body = await request.json();
    
    const timestamp = new Date().toISOString();
    const sessionId = `SESSION_${timestamp.replace(/[^0-9]/g, '')}`;

    const {tabName, data} = body;
    // Create three rows of data, one for each question

    // Append the data to the Google Sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.NEXT_PUBLIC_SPREADSHEET_ID,
      range: `${tabName}!A:Z`, // Six columns now: UserID, SessionID, Timestamp, State, Question, Answer
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: data,
      },
    });

    return NextResponse.json({ 
      success: true,
      // userId: data.userId,
      // sessionId: sessionId,
      data: response.data
    });
  } catch (error: any) {
    console.error('Error submitting to Google Sheets:', error);
    return NextResponse.json(
      { 
        error: 'Failed to submit data',
        details: error.message 
      },
      { status: 500 }
    );
  }
} 