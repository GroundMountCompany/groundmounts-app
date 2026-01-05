// src/lib/followups.ts
// Follow-up email functionality - currently disabled
// TODO: Implement follow-up tracking in Airtable if needed

export type FollowupRow = {
  lead_id: string;
  email: string;
  created_at_ms: number;
  followup_due_ms: number;
  followup_sent: boolean;
  quote_data?: string;
};

// Stub function - follow-ups are not currently stored
export async function enqueueFollowup(row: FollowupRow): Promise<void> {
  console.log("[FOLLOWUP_DISABLED] Follow-up tracking not implemented. Lead:", row.lead_id);
  // No-op - follow-ups can be implemented in Airtable if needed
}

// Stub function - returns empty array
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchDueFollowups(nowMs: number): Promise<FollowupRow[]> {
  console.log("[FOLLOWUP_DISABLED] Follow-up tracking not implemented.");
  return [];
}

// Stub function - no-op
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function markFollowupSent(lead_id: string): Promise<void> {
  console.log("[FOLLOWUP_DISABLED] Follow-up tracking not implemented.");
}
