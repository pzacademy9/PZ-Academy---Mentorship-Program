import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Best-effort: never throws into the caller — an audit-log failure must never block a real mutation. */
export async function logFeedbackAudit(params: {
  action: string;
  detail: string;
  actorProfileId: string | null;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("feedback_audit_log").insert({
      action: params.action,
      detail: params.detail,
      actor_profile_id: params.actorProfileId,
    });
  } catch (error) {
    console.error("[feedback-audit] failed to log:", error);
  }
}

export interface AuditLogEntry {
  id: string;
  action: string;
  detail: string;
  actorName: string | null;
  createdAt: string;
}

/**
 * No error check on the read — matches listFeedbackSessions's existing
 * convention for a list-display query (falls back to an empty array on
 * failure, shown as the page's own "No activity yet" empty state). This
 * is a display-only read with no integrity decision riding on it, unlike
 * the guard read in updateFeedbackSessionQuestions.
 */
export async function listFeedbackAuditLog(): Promise<AuditLogEntry[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_audit_log")
    .select("id, action, detail, created_at, actor:profiles!feedback_audit_log_actor_profile_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    detail: row.detail,
    actorName: row.actor?.full_name ?? null,
    createdAt: row.created_at,
  }));
}
