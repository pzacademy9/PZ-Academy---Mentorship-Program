import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { deleteNotificationSchema } from "@/lib/validations/notification";

/**
 * Deletes one of the caller's own notifications.
 *
 * No service-role client here: 0041's "notifications: own delete" policy
 * already restricts DELETE to user_id = auth.uid(), so the anon-key session
 * client is the right tool and the database enforces ownership. The explicit
 * .eq("user_id", user.id) is belt-and-braces, not the security boundary.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = deleteNotificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Could not delete notification" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
