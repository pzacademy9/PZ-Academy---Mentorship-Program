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

export type AuditCategory = "sessions" | "programs" | "responses" | "questionBank" | "sharing";
export type AuditTone = "create" | "destructive" | "moderate" | "neutral" | "share";

export interface AuditActionInfo {
  label: string;
  category: AuditCategory;
  tone: AuditTone;
}

/**
 * setCoverImage/removeCoverImage are logged identically by both
 * feedback-sessions.ts and feedback-programs.ts — the log has no way to
 * tell which one a given row came from (detail is a bare id, no type
 * prefix). Bucketed under "sessions" as the more common case; a real
 * data-shape limitation, not something this lookup can resolve.
 */
const AUDIT_ACTIONS: Record<string, AuditActionInfo> = {
  createFeedbackSession: { label: "Created session", category: "sessions", tone: "create" },
  updateFeedbackSessionDetails: { label: "Updated session details", category: "sessions", tone: "neutral" },
  updateFeedbackSessionQuestions: { label: "Updated session questions", category: "sessions", tone: "neutral" },
  setFeedbackSessionStatus: { label: "Changed session status", category: "sessions", tone: "neutral" },
  setFeedbackSessionMentor: { label: "Changed session mentor", category: "sessions", tone: "neutral" },
  deleteFeedbackSession: { label: "Deleted session", category: "sessions", tone: "destructive" },
  setCoverImage: { label: "Set cover image", category: "sessions", tone: "neutral" },
  removeCoverImage: { label: "Removed cover image", category: "sessions", tone: "neutral" },
  createFeedbackProgram: { label: "Created program", category: "programs", tone: "create" },
  deleteFeedbackProgram: { label: "Deleted program", category: "programs", tone: "destructive" },
  deleteResponse: { label: "Deleted response", category: "responses", tone: "destructive" },
  showResponse: { label: "Showed response", category: "responses", tone: "moderate" },
  hideResponse: { label: "Hid response", category: "responses", tone: "moderate" },
  featureResponse: { label: "Featured response", category: "responses", tone: "moderate" },
  unfeatureResponse: { label: "Unfeatured response", category: "responses", tone: "moderate" },
  saveQuestionBank: { label: "Updated question bank", category: "questionBank", tone: "neutral" },
  generateShareToken: { label: "Generated share link", category: "sharing", tone: "share" },
};

/** Pure lookup — never throws, so a page render never breaks because a future mutation added a logFeedbackAudit call this table doesn't know about yet. */
export function describeAuditAction(action: string): AuditActionInfo {
  return AUDIT_ACTIONS[action] ?? { label: action, category: "sessions", tone: "neutral" };
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
