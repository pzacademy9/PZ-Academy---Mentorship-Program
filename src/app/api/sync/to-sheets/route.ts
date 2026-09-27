import { NextRequest, NextResponse } from "next/server";
import { getLeadSyncRow } from "@/lib/data/leads";
import { applyLeadSync } from "@/lib/gas/sheets-sync-client";

/**
 * Receiver for a Supabase Database Webhook on insert/update to `leads`.
 * Database Webhooks are dashboard-managed in this project's Supabase
 * version (Database -> Webhooks), not something a migration can create —
 * see this plan's "Deviation from spec" note. One-time manual setup:
 *
 *   1. Supabase Dashboard -> Database -> Webhooks -> Create a new hook
 *   2. Table: leads. Events: Insert, Update.
 *   3. Type: HTTP Request. Method: POST.
 *      URL: https://<your-domain>/api/sync/to-sheets
 *   4. Add HTTP header: x-sync-secret = <same value as SHEETS_SYNC_SECRET>
 *
 * Fire-and-forget toward GAS, mirroring pushStatusToSheet's "never block
 * the caller" contract — a dead GAS deployment must never turn into a
 * retry storm from Supabase's own webhook delivery system.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (!process.env.SHEETS_SYNC_SECRET || secret !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { record?: { id?: string } } | null;
  const leadId = body?.record?.id;
  if (!leadId) {
    return NextResponse.json({ error: "Missing record.id" }, { status: 400 });
  }

  const row = await getLeadSyncRow(leadId);
  if (row) {
    await applyLeadSync(row);
  }

  return NextResponse.json({ ok: true });
}
