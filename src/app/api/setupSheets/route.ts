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

const sheetId = process.env.NEXT_PUBLIC_SPREADSHEET_ID!;

const tabsToSetup: Record<string, string[]> = {
  quiz: ["User ID", "Session ID", "Timestamp", "State", "Question", "Answer"],
  quotation: [
    "Quote ID", "Address", "Latitude", "Longitude", "Quotation", "Total Panels",
    "Payment Method", "Percentage", "Average Value", "Highest Value", "Additional Cost",
    "Electrical Meter Distance (ft)", "Electrical Meter Latitude", "Electrical Meter Longitude", "Total Cost"
  ],
  email: [
    "Email", "Address", "Latitude", "Longitude", "Quotation", "Total Panels", "Payment Method",
    "Quote ID", "Additional Cost", "Electrical Meter Distance (ft)",
    "Electrical Meter Latitude", "Electrical Meter Longitude", "Percentage"
  ]
};

export async function GET() {
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const existingTabs = sheetMeta.data.sheets?.map(sheet => ({
      title: sheet.properties?.title,
      sheetId: sheet.properties?.sheetId
    })) ?? [];

    const requests: any[] = [];
    const titleToId: Record<string, number> = {};

    // Step 1: Create missing sheets
    for (const [tabName, headers] of Object.entries(tabsToSetup)) {
      const existing = existingTabs.find(t => t.title === tabName);
      if (!existing) {
        requests.push({
          addSheet: {
            properties: { title: tabName }
          }
        });
      } else {
        titleToId[tabName] = existing.sheetId!;
      }
    }

    // Step 2: Create sheets
    if (requests.length > 0) {
      const batchResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests }
      });

      batchResponse.data.replies?.forEach(reply => {
        const sheet = reply.addSheet?.properties;
        if (sheet?.title && sheet.sheetId !== undefined) {
          titleToId[sheet.title] = sheet.sheetId;
        }
      });
    }

    // Step 3: Set headers for newly created sheets only
    const headerRequests = Object.entries(tabsToSetup)
      .filter(([tabName]) => !existingTabs.some(t => t.title === tabName)) // only for newly created
      .map(([tabName, headers]) => ({
        updateCells: {
          rows: [{
            values: headers.map(h => ({
              userEnteredValue: { stringValue: h }
            }))
          }],
          fields: '*',
          start: {
            sheetId: titleToId[tabName],
            rowIndex: 0,
            columnIndex: 0
          }
        }
      }));

    if (headerRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: headerRequests }
      });
    }

    return NextResponse.json({ success: true, message: 'Tabs created and headers set.' });
  } catch (err: any) {
    console.error('Setup failed:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
