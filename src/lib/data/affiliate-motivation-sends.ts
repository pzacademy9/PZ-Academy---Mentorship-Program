// src/lib/data/affiliate-motivation-sends.ts
// History of Motivation sends: one row per button press on the screen, with an example of the email and who got it.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type MotivationRecipient = { name: string; ok: boolean };
export type MotivationSendRow = {
  id: string;
  createdAt: string;
  subject: string;
  recipientCount: number;
  failedCount: number;
  recipients: MotivationRecipient[];
};

const asRecipients = (v: unknown): MotivationRecipient[] =>
  Array.isArray(v)
    ? v
        .filter((r): r is { name: unknown; ok: unknown } => typeof r === "object" && r !== null)
        .map((r) => ({ name: typeof r.name === "string" ? r.name : "", ok: r.ok === true }))
    : [];

/**
 * Saves one send. The first call for an id inserts the row; later calls with the same id add to the counts and append
 * the names. The screen sends its chunks one after another, so read-then-update cannot race with itself here.
 * Never throws: history must not block or undo a send. Returns false when it could not be saved.
 */
export async function recordMotivationSend(e: {
  id: string;
  subject: string;
  html: string;
  sent: { name: string }[];
  failed: { name: string }[];
}): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const added: MotivationRecipient[] = [
      ...e.sent.map((s) => ({ name: s.name, ok: true })),
      ...e.failed.map((f) => ({ name: f.name, ok: false })),
    ];
    const { data: existing, error: readError } = await admin
      .from("affiliate_motivation_sends")
      .select("id, recipient_count, failed_count, recipients")
      .eq("id", e.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) {
      const { error } = await admin.from("affiliate_motivation_sends").insert({
        id: e.id,
        subject: e.subject,
        html: e.html,
        recipient_count: e.sent.length,
        failed_count: e.failed.length,
        recipients: added,
      });
      if (error) throw error;
      return true;
    }
    const { error } = await admin
      .from("affiliate_motivation_sends")
      .update({
        recipient_count: existing.recipient_count + e.sent.length,
        failed_count: existing.failed_count + e.failed.length,
        recipients: [...asRecipients(existing.recipients), ...added],
      })
      .eq("id", e.id);
    if (error) throw error;
    return true;
  } catch {
    console.error("[affiliate-motivation-sends] could not save the send history");
    return false;
  }
}

/** Newest first, without the html (that is loaded on demand). */
export async function listMotivationSends(limit = 50): Promise<MotivationSendRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("affiliate_motivation_sends")
    .select("id, created_at, subject, recipient_count, failed_count, recipients")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    subject: r.subject,
    recipientCount: r.recipient_count,
    failedCount: r.failed_count,
    recipients: asRecipients(r.recipients),
  }));
}

/** The saved example email, or null for an unknown id. Throws on a database error. */
export async function getMotivationSendHtml(id: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("affiliate_motivation_sends").select("html").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? data.html : null;
}
