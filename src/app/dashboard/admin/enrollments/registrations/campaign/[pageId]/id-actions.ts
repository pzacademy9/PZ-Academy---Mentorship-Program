"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { listBatchIdsForAdmin } from "@/lib/data/pz-people";

/** Admin only: every enrolled person of a batch with their PZ ID. Emails are never returned. */
export async function getBatchIdList(pageId: string): Promise<Array<{ name: string; pzId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error("You do not have permission to do this.");
  const rows = await listBatchIdsForAdmin(pageId);
  return rows.map((r) => ({ name: r.name, pzId: r.pzId }));
}
