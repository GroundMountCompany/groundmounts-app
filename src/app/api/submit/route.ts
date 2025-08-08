import { NextResponse } from 'next/server';
import { findLeadById, ensureLeadIndexed, updateLeadRow, writeLeadToSheet } from '@/lib/sheets';
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from '@/lib/guard';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Apply guards before processing (except for legacy format)
    if (!body.tabName) { // Only apply guards to new format
      const ip = getClientIp({ headers: request.headers });
      if (!rateLimitOk(ip)) {
        return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
      }

      if (isBotHoneypot((body as Record<string, unknown>).honeypot as string)) {
        return NextResponse.json({ ok: true, ignored: true });
      }

      if ((body as Record<string, unknown>).ttc_ms !== undefined && !minTimeOk((body as Record<string, unknown>).ttc_ms as number)) {
        return NextResponse.json({ ok: false, error: "too_fast" }, { status: 400 });
      }
    }

    // Handle both old format (tabName, leadId, column, value) and new format (full lead object)
    if (body.tabName && body.leadId) {
      // Legacy format - keep for backwards compatibility
      const { tabName, leadId, column, value } = body;
      const { ensureLeadRow, updateSheetCell } = await import('@/lib/sheets');
      
      const row = await ensureLeadRow(tabName, leadId);

      if (!column || typeof value === 'undefined') {
        return NextResponse.json({
          ok: true,
          message: 'Lead ID ensured',
          leadId,
          row,
        });
      }

      const updateResult = await updateSheetCell(tabName, row, column, value);
      return NextResponse.json({
        ok: true,
        updatedCell: `${tabName}!${column}${row}`,
        response: updateResult,
      });
    }

    // New format - full lead object with idempotent handling
    const { id } = body;
    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const existing = await findLeadById(id);
    if (existing) {
      await updateLeadRow(existing.rowRef, body);
      console.log("[LEAD_UPDATED]", id, "row:", existing.rowRef);
      return NextResponse.json({ ok: true, updated: true });
    } else {
      const { rowRef } = await writeLeadToSheet(body);
      await ensureLeadIndexed(id, rowRef);
      console.log("[LEAD_CREATED]", id, "row:", rowRef);
      return NextResponse.json({ ok: true, created: true, rowRef });
    }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[SUBMIT_ROUTE_ERROR]', msg);
    return NextResponse.json(
      { ok: false, error: msg || "submit_failed" },
      { status: 500 }
    );
  }
}
