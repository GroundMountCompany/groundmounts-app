import { NextResponse } from "next/server";
import { fetchDueFollowups, markFollowupSent } from "@/lib/followups";
import { getResendOrThrow } from "@/lib/resendSafe";
import FollowUpEmailTemplate from "@/components/common/FollowUpEmailTemplate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });
    }
    
    const resend = getResendOrThrow();
    const now = Date.now();
    const due = await fetchDueFollowups(now);

    let sent = 0;
    for (const f of due) {
      try {
        // Use minimal template props since we don't have full context stored
        const emailTemplate = FollowUpEmailTemplate({
          client: f.email,
          phone: 'Not provided',
          systemType: 'Ground Mount Solar System',
          address: 'Your property location',
          coordinates: 'GPS coordinates on file',
          materials: 'Custom solar panel system',
          estimatedCost: 'See original quote',
          totalCost: 'Total investment on file',
          trenching: 'Trenching cost included',
          date: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
          calendlyUrl: process.env.NEXT_PUBLIC_CALENDLY_URL || '#'
        });

        await resend.emails.send({
          from: "Ground Mounts Solar System <info@groundmounts.com>",
          to: f.email,
          subject: "Your Ground Mount Quote - Ready to Move Forward?",
          react: emailTemplate,
        });
        
        await markFollowupSent(f.lead_id);
        sent++;
        console.log("[FOLLOWUP_SENT]", f.lead_id, f.email);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[FOLLOWUP_SEND_FAIL]", f.lead_id, f.email, msg);
      }
    }

    console.log("[FOLLOWUP_SCHEDULED_SUCCESS]", "queued:", due.length, "sent:", sent);
    return NextResponse.json({ ok: true, queued: due.length, sent });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[FOLLOWUP_SCHEDULED_ERROR]", msg);
    return NextResponse.json({ ok: false, error: msg || "scheduled_failed" }, { status: 500 });
  }
}