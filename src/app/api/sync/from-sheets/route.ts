import { NextRequest, NextResponse } from "next/server";
import { leadSheetSyncSchema } from "@/lib/validations/leads";
import { getLeadById, applyStatusAndNotesFromSheet } from "@/lib/data/leads";

/**
 * Receives status/notes edits from gas/sheets-sync/Code.gs's onEditLeads
 * trigger. Token check happens before any DB access, mirroring
 * /api/webhooks/sheets-sync's ordering — an unauthenticated caller must
 * never cause a read or write.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !process.env.SHEETS_SYNC_SECRET || body.token !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  const parsed = leadSheetSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }
  const { id, status, notes, updatedAt } = parsed.data;

  const lead = await getLeadById(id);
  if (!lead) {
    return NextResponse.json({ status: "error", message: `No lead with id ${id}` });
  }

  // Loop guard: an edit whose own timestamp is not strictly newer than the
  // lead's current updated_at is this row's own last outbound write echoing
  // back, not a genuine ops-team edit — ignore it rather than re-applying it.
  if (new Date(updatedAt).getTime() <= new Date(lead.updatedAt).getTime()) {
    return NextResponse.json({ status: "success", message: "Stale update ignored" });
  }

  await applyStatusAndNotesFromSheet(id, status, notes ?? null);
  return NextResponse.json({ status: "success", message: "Lead updated" });
}
