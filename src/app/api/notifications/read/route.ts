import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { markNotificationsReadSchema } from "@/lib/validations/notification";

/**
 * Marks the caller's notifications read — one row when `id` is given, all of
 * them otherwise.
 *
 * No service-role client here: 0002's "notifications: own update" policy
 * already restricts UPDATE to user_id = auth.uid(), so the anon-key session
 * client is the right tool and the database enforces ownership. The explicit
 * .eq("user_id", user.id) is belt-and-braces, not the security boundary.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = markNotificationsReadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let query = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (parsed.data.id) query = query.eq("id", parsed.data.id);

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not update notifications" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
