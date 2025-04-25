export async function saveToSpreadsheet(spreadsheetId: string, tabName: string, data: object) {
  try {
    const response = await fetch('/api/saveToSpreadsheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spreadsheetId,
        tabName,
        data
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save data to spreadsheet');
    }
  } catch (error) {
    console.error("Error in saveToSpreadsheet:", error);
    throw error;
  }
}
