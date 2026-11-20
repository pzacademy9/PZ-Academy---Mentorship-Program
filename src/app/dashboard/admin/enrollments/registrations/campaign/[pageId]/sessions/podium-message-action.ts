"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { attendanceBase } from "@/lib/attendance/links";
import { podiumMessage } from "@/lib/classes/share-messages";
import { getPortalBatch } from "@/lib/data/portal";
import { podium, resolvePodiumPick, rowsFor } from "@/lib/progress/leaderboard";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type PodiumMessageResult = { ok: true; text: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string): PodiumMessageResult => ({ ok: false, message });

/** The ready-to-post top-three message for one class of a batch. Admin only; reads the same board the public picture shows. */
export async function getPodiumMessage(pageId: string, sessionId: string): Promise<PodiumMessageResult> {
  const auth = await requireAdmin("classes");
  if (!auth.ok) return fail("You do not have permission to do this.");
  if (!UUID.test(pageId ?? "")) return fail("That batch was not found");
  if (!UUID.test(sessionId ?? "")) return fail("That class was not found");
  try {
    const { data, error } = await createAdminSupabase().from("landing_pages").select("slug, title").eq("id", pageId).maybeSingle();
    const page = data as { slug: string | null; title: string } | null;
    if (error || !page || !page.slug) return fail("That batch was not found");
    const view = await getPortalBatch(page.slug);
    if (!view) return fail("That batch was not found");
    const pick = resolvePodiumPick(view, sessionId);
    if (!pick) return fail("That class was not found");
    const entries = podium(rowsFor(view, pick.id)).map((r) => ({ rank: r.rank, name: r.name, score: r.score }));
    if (entries.length === 0) return fail("No ranked students yet.");
    return {
      ok: true,
      text: podiumMessage({ batchTitle: page.title, boardLabel: pick.label, entries, progressLink: `${attendanceBase()}/progress/${page.slug}` }),
    };
  } catch {
    return fail("Something went wrong. Please try again.");
  }
}
