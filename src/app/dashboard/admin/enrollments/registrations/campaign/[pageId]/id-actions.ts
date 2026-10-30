"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { listBatchIdsForAdmin } from "@/lib/data/pz-people";
import { resolveCandidates } from "@/lib/data/participant-campaigns";
import { pzIdsFor } from "@/lib/data/participant-sends";
import type { CampaignSelection } from "@/components/admin/registrations/CampaignRegistrations";

/** Admin only: every enrolled person of a batch with their PZ ID. Emails are never returned. */
export async function getBatchIdList(pageId: string): Promise<Array<{ name: string; pzId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error("You do not have permission to do this.");
  const rows = await listBatchIdsForAdmin(pageId);
  return rows.map((r) => ({ name: r.name, pzId: r.pzId }));
}

/**
 * Admin only: the PZ IDs of the chosen people. `null` means the whole batch. Only people who
 * have a PZ ID are returned, and never an email or phone.
 */
export async function getSelectionIdList(
  pageId: string,
  selection: CampaignSelection | null,
): Promise<Array<{ name: string; pzId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error("You do not have permission to do this.");
  if (selection === null) {
    const rows = await listBatchIdsForAdmin(pageId);
    return rows.map((r) => ({ name: r.name, pzId: r.pzId }));
  }
  const candidates = await resolveCandidates(
    selection.mode === "ids" ? { pageId, ids: selection.ids } : { pageId, filters: selection.filters },
  );
  const pz = await pzIdsFor(candidates.map((c) => c.registrationId));
  const out: Array<{ name: string; pzId: string }> = [];
  for (const c of candidates) {
    const pzId = pz.get(c.registrationId);
    if (pzId) out.push({ name: c.name, pzId });
  }
  return out;
}
