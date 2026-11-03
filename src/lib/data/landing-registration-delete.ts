import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type DeleteRegistrationResult =
  | { ok: true; removedMembers: number }
  | { ok: false; reason: "not-found" | "member-row" | "mirrored" | "db-error" };

/**
 * Delete one registration for good (admin only; the route gates that). A group lead takes its members with it.
 * The registration's own records (status history, emails sent, sheet-sync notes, jobs, messages) go with it by the
 * database's cascade rules. The course access it gave (the enrollment tied to it) is removed first; if that fails,
 * nothing else is deleted. Sign-in accounts, PZ IDs, the voucher file in Drive and anything already sent stay.
 * A row that a mirrored sheet owns is refused: the next mirror run would create it again.
 */
export async function deleteRegistration(p: { registrationId: string }): Promise<DeleteRegistrationResult> {
  const db = createAdminSupabase();
  try {
    const { data: row, error } = await db.from("landing_registrations").select("id, row_type").eq("id", p.registrationId).maybeSingle();
    if (error) { console.error("[landing-registration-delete] read failed:", error.code); return { ok: false, reason: "db-error" }; }
    if (!row) return { ok: false, reason: "not-found" };
    if (row.row_type === "member") return { ok: false, reason: "member-row" };

    const { data: memberRows, error: mErr } = await db.from("landing_registrations").select("id").eq("lead_registration_id", row.id);
    if (mErr) { console.error("[landing-registration-delete] members read failed:", mErr.code); return { ok: false, reason: "db-error" }; }
    const memberIds = (memberRows ?? []).map((m) => m.id as string);
    const ids = [row.id as string, ...memberIds];

    const { data: mirrored, error: xErr } = await db.from("landing_mirror_rows").select("registration_id").in("registration_id", ids).limit(1);
    if (xErr) { console.error("[landing-registration-delete] mirror check failed:", xErr.code); return { ok: false, reason: "db-error" }; }
    if ((mirrored ?? []).length > 0) return { ok: false, reason: "mirrored" };

    const { error: eErr } = await db.from("enrollments").delete().in("landing_registration_id", ids);
    if (eErr) { console.error("[landing-registration-delete] enrollment removal failed:", eErr.code); return { ok: false, reason: "db-error" }; }

    const { error: dErr } = await db.from("landing_registrations").delete().eq("id", row.id);
    if (dErr) { console.error("[landing-registration-delete] delete failed:", dErr.code); return { ok: false, reason: "db-error" }; }
    return { ok: true, removedMembers: memberIds.length };
  } catch {
    console.error("[landing-registration-delete] crashed");
    return { ok: false, reason: "db-error" };
  }
}
