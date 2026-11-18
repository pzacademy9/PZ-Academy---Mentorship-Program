import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { parseAudienceFilter, type AudienceFilter } from "@/lib/crm/audience-filter";
import { isMissingSchemaError } from "@/lib/data/cohort-export";

/**
 * Saved audiences (table crm_saved_audiences, migration 0116). Shared by every
 * admin with access. Reads degrade when the table is not there yet. A stored
 * filter is re-checked on every read; a bad one is flagged, never thrown.
 */

export type SavedAudience = {
  id: string;
  name: string;
  /** null when the stored choices no longer pass validation. */
  filter: AudienceFilter | null;
  invalid: boolean;
  createdAt: string;
};

type Row = { id: string; name: string; filters: unknown; created_at: string };

const COLS = "id, name, filters, created_at";

function toSaved(r: Row): SavedAudience {
  const parsed = parseAudienceFilter(r.filters);
  return {
    id: r.id,
    name: r.name,
    filter: parsed.ok ? parsed.filter : null,
    invalid: !parsed.ok,
    createdAt: r.created_at,
  };
}

type PgError = { message?: string; code?: string };
const isDuplicate = (e: PgError) => e.code === "23505";

export async function listSavedAudiences(): Promise<{ items: SavedAudience[]; needsUpdate: boolean }> {
  const { data, error } = await createAdminSupabase()
    .from("crm_saved_audiences")
    .select(COLS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) {
    if (isMissingSchemaError(error)) return { items: [], needsUpdate: true };
    throw new Error("saved audiences read failed");
  }
  return { items: ((data ?? []) as Row[]).map(toSaved), needsUpdate: false };
}

export async function getSavedAudience(id: string): Promise<{ item: SavedAudience | null; needsUpdate: boolean }> {
  const { data, error } = await createAdminSupabase()
    .from("crm_saved_audiences")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return { item: null, needsUpdate: true };
    throw new Error("saved audience read failed");
  }
  return { item: data ? toSaved(data as Row) : null, needsUpdate: false };
}

export async function createSavedAudience(input: {
  name: string;
  filter: AudienceFilter;
  adminId: string;
}): Promise<{ ok: true; item: SavedAudience } | { ok: false; reason: "duplicate" | "needsUpdate" }> {
  const { data, error } = await createAdminSupabase()
    .from("crm_saved_audiences")
    .insert({ name: input.name, filters: input.filter, created_by: input.adminId })
    .select(COLS)
    .single();
  if (error) {
    if (isDuplicate(error)) return { ok: false, reason: "duplicate" };
    if (isMissingSchemaError(error)) return { ok: false, reason: "needsUpdate" };
    throw new Error("saved audience create failed");
  }
  return { ok: true, item: toSaved(data as Row) };
}

export async function renameSavedAudience(input: {
  id: string;
  name: string;
}): Promise<{ ok: true; item: SavedAudience } | { ok: false; reason: "duplicate" | "notFound" | "needsUpdate" }> {
  // No trigger keeps updated_at, so the rename sets it here.
  const { data, error } = await createAdminSupabase()
    .from("crm_saved_audiences")
    .update({ name: input.name, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (isDuplicate(error)) return { ok: false, reason: "duplicate" };
    if (isMissingSchemaError(error)) return { ok: false, reason: "needsUpdate" };
    throw new Error("saved audience rename failed");
  }
  if (!data) return { ok: false, reason: "notFound" };
  return { ok: true, item: toSaved(data as Row) };
}

export async function deleteSavedAudience(id: string): Promise<{ ok: true } | { ok: false; reason: "needsUpdate" }> {
  const { error } = await createAdminSupabase().from("crm_saved_audiences").delete().eq("id", id);
  if (error) {
    if (isMissingSchemaError(error)) return { ok: false, reason: "needsUpdate" };
    throw new Error("saved audience delete failed");
  }
  return { ok: true };
}
