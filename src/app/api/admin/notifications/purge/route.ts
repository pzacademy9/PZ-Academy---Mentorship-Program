import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { purgeNotificationsSchema } from "@/lib/validations/notification";

/**
 * Deletes READ notifications older than the cutoff, across every user.
 *
 * Unread rows are never touched here, regardless of age — an unread
 * notification is still live information for whoever it belongs to, not
 * storage to reclaim. Service-role client: this crosses user_id boundaries,
 * which 0041's own-row DELETE policy deliberately does not allow.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = purgeNotificationsSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - parsed.data.olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminSupabase();
  const { error, count } = await admin
    .from("notifications")
    .delete({ count: "exact" })
    .eq("is_read", true)
    .lt("created_at", cutoff);

  if (error) {
    return NextResponse.json({ error: "Could not purge notifications" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
