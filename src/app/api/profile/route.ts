import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { updateProfileSchema } from "@/lib/validations/profile";
import { diffSingleImageFileId } from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";

/**
 * Self-service profile update -- any authenticated user may edit their own
 * name/avatar, no role gate. The security boundary is `eq("id", user.id)`
 * below: the caller's own session id, never a client-supplied one.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = updateProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const update: { full_name?: string; avatar_url?: string | null } = {};
  if (parsed.data.fullName !== undefined) update.full_name = parsed.data.fullName;
  let nextAvatarUrl: string | null | undefined;
  if (parsed.data.avatarUrl !== undefined) {
    nextAvatarUrl = parsed.data.avatarUrl || null;
    update.avatar_url = nextAvatarUrl;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Read the old avatar before overwriting it -- a replaced or removed photo
  // otherwise just orphans the previous file in Drive forever.
  let warning: string | null = null;
  if (nextAvatarUrl !== undefined) {
    const { data: existing } = await admin.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
    warning = await trashDriveFiles(diffSingleImageFileId(existing?.avatar_url ?? null, nextAvatarUrl));
  }

  const { error } = await admin.from("profiles").update(update).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not save changes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warning });
}
