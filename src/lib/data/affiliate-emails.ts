// src/lib/data/affiliate-emails.ts
// The history of emails sent to affiliates. Logging never throws: a missing log must not undo an accept.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type AffiliateEmailKind = "accepted" | "dropped" | "left" | "progress" | "motivation";
export interface AffiliateEmailRow {
  id: string;
  kind: AffiliateEmailKind;
  toEmail: string;
  status: "sent" | "failed";
  error: string | null;
  createdAt: string;
}

/** Writes one history row. Returns false (never throws) when it could not be saved. */
export async function logAffiliateEmail(e: { affiliateId: string; kind: AffiliateEmailKind; toEmail: string; ok: boolean; error?: string }): Promise<boolean> {
  try {
    const { error } = await createAdminSupabase().from("affiliate_emails").insert({
      affiliate_id: e.affiliateId,
      kind: e.kind,
      to_email: e.toEmail,
      status: e.ok ? "sent" : "failed",
      error: e.ok ? null : (e.error ?? "Send failed").slice(0, 500),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * How many emails were sent (status 'sent') in the last 24 hours, for the daily sending limit.
 * On a read error it returns 300 so callers stop sending rather than overshoot.
 */
export async function countSentLast24h(): Promise<number> {
  try {
    const { count, error } = await createAdminSupabase()
      .from("affiliate_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if (error) return 300;
    return count ?? 0;
  } catch {
    return 300;
  }
}

/** One affiliate's emails, newest first. */
export async function listAffiliateEmails(affiliateId: string): Promise<AffiliateEmailRow[]> {
  const { data, error } = await createAdminSupabase()
    .from("affiliate_emails")
    .select("id, kind, to_email, status, error, created_at")
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as AffiliateEmailKind,
    toEmail: r.to_email,
    status: r.status as "sent" | "failed",
    error: r.error,
    createdAt: r.created_at,
  }));
}

/** Ids of affiliates whose most recent email failed. Empty when the history cannot be read. */
export async function affiliatesWithFailedEmail(): Promise<Set<string>> {
  const failed = new Set<string>();
  try {
    const { data, error } = await createAdminSupabase()
      .from("affiliate_emails")
      .select("affiliate_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error || !data) return failed;
    const seen = new Set<string>();
    for (const r of data) {
      if (seen.has(r.affiliate_id)) continue;
      seen.add(r.affiliate_id);
      if (r.status === "failed") failed.add(r.affiliate_id);
    }
  } catch {
    /* an unreadable history just shows no flags */
  }
  return failed;
}

/**
 * Deletes history rows so the table never grows without limit. Give an affiliate id to clear that person's
 * history, or olderThanDays to clear everything older than that (0 = all). Returns how many rows went. Throws on a database error.
 */
export async function clearAffiliateEmails(scope: { affiliateId: string } | { olderThanDays: number }): Promise<number> {
  const db = createAdminSupabase();
  const q =
    "affiliateId" in scope
      ? db.from("affiliate_emails").delete({ count: "exact" }).eq("affiliate_id", scope.affiliateId)
      : db
          .from("affiliate_emails")
          .delete({ count: "exact" })
          .lt("created_at", new Date(Date.now() - scope.olderThanDays * 86_400_000).toISOString());
  const { error, count } = await q;
  if (error) throw error;
  return count ?? 0;
}
