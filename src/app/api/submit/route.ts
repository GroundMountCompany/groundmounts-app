import { NextResponse } from 'next/server';
import { ensureLeadRow, updateSheetCell } from '@/lib/sheets';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tabName, leadId, column, value } = body;

    if (!tabName || !leadId) {
      return NextResponse.json(
        { error: 'tabName and leadId are required' },
        { status: 400 }
      );
    }

    // Step 1: Ensure leadId exists in column A, get its row (with retry)
    const row = await ensureLeadRow(tabName, leadId);

    if (!column || typeof value === 'undefined') {
      // Step 2: No additional data — just inserting leadId
      return NextResponse.json({
        ok: true,
        message: 'Lead ID ensured',
        leadId,
        row,
      });
    }

    // Step 3: Update specified cell (with retry)
    const updateResult = await updateSheetCell(tabName, row, column, value);

    if (!updateResult) {
      throw new Error('Sheets update failed: no result returned');
    }

    return NextResponse.json({
      ok: true,
      updatedCell: `${tabName}!${column}${row}`,
      response: updateResult,
    });

  } catch (e: any) {
    console.error('[SUBMIT_ROUTE_ERROR]', e?.message || e, e?.stack);
    return NextResponse.json(
      { ok: false, error: e?.message || "submit_failed" },
      { status: 500 }
    );
  }
}
