"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listBatchIdsForAdmin } from "@/lib/data/pz-people";
import { resolveCandidates } from "@/lib/data/participant-campaigns";
import { pzIdsFor } from "@/lib/data/participant-sends";
import { filtersSchema } from "@/lib/validations/participants";
import type { CampaignSelection } from "@/components/admin/registrations/CampaignRegistrations";

/** Admin only: every enrolled person of a batch with their PZ ID. Emails are never returned. */
export async function getBatchIdList(pageId: string): Promise<Array<{ name: string; pzId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error("You do not have permission to do this.");
  const rows = await listBatchIdsForAdmin(pageId);
  return rows.map((r) => ({ name: r.name, pzId: r.pzId }));
}

const BAD_SELECTION = "That selection is not valid. Please reload the page and try again.";
const selectionSchema = z.union([
  z.object({ mode: z.literal("ids"), ids: z.array(z.string().uuid()).min(1).max(1000) }),
  z.object({ mode: z.literal("filter"), filters: filtersSchema }),
]);

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
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success) throw new Error(BAD_SELECTION);
  const sel = parsed.data;
  const candidates = await resolveCandidates(
    sel.mode === "ids" ? { pageId, ids: sel.ids } : { pageId, filters: sel.filters },
  );
  // Only people who are enrolled (paid or free), one row per person.
  const enrolled = candidates.filter((c) => c.status === "paid" || c.status === "free");
  const pz = await pzIdsFor(enrolled.map((c) => c.registrationId));
  const seen = new Set<string>();
  const out: Array<{ name: string; pzId: string }> = [];
  for (const c of enrolled) {
    const pzId = pz.get(c.registrationId);
    if (!pzId || seen.has(pzId)) continue;
    seen.add(pzId);
    out.push({ name: c.name, pzId });
  }
  return out;
}
