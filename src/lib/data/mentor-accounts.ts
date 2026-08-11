import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Admin-facing mentor account linking (subsystem B). Mirrors the
 * conventions in src/lib/data/admin-mentors.ts: service-role client, every
 * caller already gated by requireAdmin() at its own route boundary.
 * Separate file from admin-mentors.ts because this is a distinct
 * responsibility (auth account linking) from registry CRUD.
 */

export async function findAccountIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (error) return null;
  return data ?? null;
}

export type InviteOrCheckResult =
  | { status: "invited"; email: string }
  | { status: "existing"; email: string }
  | { status: "error"; reason: "mentor-not-found" | "invite-failed" | "db-error" };

/**
 * Step 1 of the invite flow. If the email already has an account, this
 * does NOT write anything — it returns "existing" so the admin UI can show
 * a confirm dialog before confirmLinkExistingAccount() actually promotes
 * that account. Only a genuinely new email triggers an invite here.
 */
export async function inviteOrCheckMentorAccount(
  mentorId: string,
  email: string,
  redirectTo: string,
): Promise<InviteOrCheckResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("id, name").eq("id", mentorId).maybeSingle();
  if (!mentor) return { status: "error", reason: "mentor-not-found" };

  const existingId = await findAccountIdByEmail(email);
  if (existingId) {
    return { status: "existing", email };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: mentor.name },
  });
  if (inviteError || !invited?.user) {
    return { status: "error", reason: "invite-failed" };
  }

  // handle_new_user (0003/0017/0018) already inserted a profiles row with
  // role='student' and full_name from raw_user_meta_data.full_name (set
  // above) by the time inviteUserByEmail resolves. Only role needs fixing
  // here — full_name is already correct, and re-setting it would be
  // redundant, not wrong, but role must change before this mentor ever
  // logs in.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "mentor" })
    .eq("id", invited.user.id);
  if (profileError) return { status: "error", reason: "db-error" };

  const { error: mentorError } = await admin
    .from("mentors")
    .update({ profile_id: invited.user.id })
    .eq("id", mentorId);
  if (mentorError) return { status: "error", reason: "db-error" };

  return { status: "invited", email };
}

export type ConfirmLinkResult =
  | { ok: true }
  | { ok: false; reason: "mentor-not-found" | "account-not-found" | "db-error" };

/**
 * Step 2 of the invite flow, only reached after the admin confirms the
 * "this email already has an account" dialog. Promotes that account to
 * role='mentor' and links it. Deliberately does NOT touch full_name — this
 * is an existing account (e.g. a student) with its own real name already
 * set; overwriting it with the mentor registry's marketing name would be
 * wrong.
 */
export async function confirmLinkExistingAccount(mentorId: string, email: string): Promise<ConfirmLinkResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("id").eq("id", mentorId).maybeSingle();
  if (!mentor) return { ok: false, reason: "mentor-not-found" };

  const accountId = await findAccountIdByEmail(email);
  if (!accountId) return { ok: false, reason: "account-not-found" };

  const { error: profileError } = await admin.from("profiles").update({ role: "mentor" }).eq("id", accountId);
  if (profileError) return { ok: false, reason: "db-error" };

  const { error: mentorError } = await admin.from("mentors").update({ profile_id: accountId }).eq("id", mentorId);
  if (mentorError) return { ok: false, reason: "db-error" };

  return { ok: true };
}

export type UnlinkResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Clears mentors.profile_id AND reverts profiles.role back to 'student' —
 * leaving it as 'mentor' with no linked mentor row would be an orphaned
 * account that can still reach /dashboard/mentor (per middleware.ts) with
 * nothing to show.
 */
export async function unlinkMentorAccount(mentorId: string): Promise<UnlinkResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("profile_id").eq("id", mentorId).maybeSingle();
  if (!mentor) return { ok: false, reason: "not-found" };

  const { error: mentorError } = await admin.from("mentors").update({ profile_id: null }).eq("id", mentorId);
  if (mentorError) return { ok: false, reason: "db-error" };

  if (mentor.profile_id) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role: "student" })
      .eq("id", mentor.profile_id);
    if (profileError) return { ok: false, reason: "db-error" };
  }

  return { ok: true };
}

/** For display on the admin mentor detail page — no email column on mentors, so this is fetched live via the admin auth API rather than stored. */
export async function getLinkedAccountEmail(profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const admin = createAdminSupabase();
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}
