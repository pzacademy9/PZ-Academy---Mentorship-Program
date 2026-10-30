// src/lib/data/landing-event-sheet.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeContent } from "@/lib/landing/content";
import type { MirrorResult } from "@/lib/data/landing-mirror";
import { parseMirrorResult } from "@/lib/landing/mirror/result";

export interface PageSheetInfo {
  id: string;
  slug: string;
  title: string;
  sheetId: string | null;
  driveFolderId: string | null;
  refPrefix: string | null;
  draftRefPrefix: string;
}

export async function getPageSheetInfo(id: string): Promise<PageSheetInfo | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .select("id, slug, title, draft, sheet_id, drive_folder_id, ref_prefix")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    sheetId: data.sheet_id,
    driveFolderId: data.drive_folder_id,
    refPrefix: data.ref_prefix,
    draftRefPrefix: normalizeContent(data.draft).registration.refPrefix,
  };
}

export interface PageMirrorInfo {
  sheetId: string | null;
  lastRunAt: string | null;
  lastResult: MirrorResult | null;
}

/** Read-only: the old-sheet mirror columns of one page. */
export async function getPageMirrorInfo(id: string): Promise<PageMirrorInfo | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .select("mirror_sheet_id, mirror_last_run_at, mirror_last_result")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    sheetId: data.mirror_sheet_id || null,
    lastRunAt: data.mirror_last_run_at,
    lastResult: parseMirrorResult(data.mirror_last_result),
  };
}

/** Saves the new sheet only if the page still has none (guards a double click). */
export async function saveEventSheet(
  id: string,
  v: { sheetId: string; driveFolderId: string; refPrefix: string },
): Promise<{ ok: true } | { ok: false; reason: "already-set" | "db-error" }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .update({ sheet_id: v.sheetId, drive_folder_id: v.driveFolderId, ref_prefix: v.refPrefix })
    .eq("id", id)
    .is("sheet_id", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "already-set" };
  return { ok: true };
}
