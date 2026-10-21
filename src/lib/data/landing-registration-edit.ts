import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { saveSnapshots } from "@/lib/data/landing-sheet-sync";
import { enqueueSheetDetails, runJobsDirect, runJobsFor } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";

export type DetailsEditResult =
  | { ok: true; changed: ("name" | "email" | "whatsapp")[] }
  | { ok: false; reason: "not-found" | "nothing-to-change" | "bad-name" | "bad-email" | "email-taken" | "bad-whatsapp" | "db-error" };

type Field = "name" | "email" | "whatsapp";

/** Same normalization the sheet-sync planner compares with. */
const normName = (s: string) => s.trim();
const normEmail = (s: string) => s.trim().toLowerCase();
const normWa = (s: string) => s.replace(/\D/g, "");

/**
 * Edit a person's name, email and WhatsApp from the admin side, then queue the matching sheet row update.
 * Never touches status, amount, student_id, enrolment or email_status. The sheet row is found by Ref ID plus
 * the email the sheet shows now, so that old email is remembered (insert-only) BEFORE the update.
 */
export async function updateRegistrationDetails(p: { registrationId: string; name?: string; email?: string; whatsapp?: string }): Promise<DetailsEditResult> {
  const wanted: Partial<Record<Field, string>> = {};
  if (p.name !== undefined) {
    const name = normName(p.name);
    if (name.length < 1 || name.length > 200) return { ok: false, reason: "bad-name" };
    wanted.name = name;
  }
  if (p.email !== undefined) {
    const email = normEmail(p.email);
    if (email.indexOf("@") < 1) return { ok: false, reason: "bad-email" };
    wanted.email = email;
  }
  if (p.whatsapp !== undefined) {
    const wa = normWa(p.whatsapp);
    if (wa.length < 8 || wa.length > 15) return { ok: false, reason: "bad-whatsapp" };
    wanted.whatsapp = wa;
  }

  const db = createAdminSupabase();
  const { data, error } = await db
    .from("landing_registrations")
    .select("id, page_id, name, email, whatsapp, status, amount_received")
    .eq("id", p.registrationId)
    .maybeSingle();
  if (error) { console.error("[landing-registration-edit] read failed:", error.code); return { ok: false, reason: "db-error" }; }
  if (!data) return { ok: false, reason: "not-found" };

  const current: Record<Field, string> = { name: normName(data.name), email: normEmail(data.email), whatsapp: normWa(data.whatsapp) };
  const changed = (["name", "email", "whatsapp"] as const).filter((f) => wanted[f] !== undefined && wanted[f] !== current[f]);
  if (changed.length === 0) return { ok: false, reason: "nothing-to-change" };

  if (changed.includes("email")) {
    const likeSafe = (wanted.email as string).replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: taken, error: tErr } = await db
      .from("landing_registrations").select("id").eq("page_id", data.page_id).neq("id", data.id).ilike("email", likeSafe).limit(1);
    if (tErr) { console.error("[landing-registration-edit] email check failed:", tErr.code); return { ok: false, reason: "db-error" }; }
    if ((taken ?? []).length > 0) return { ok: false, reason: "email-taken" };
  }

  // The sheet still shows the old values: remember them first. Insert-only, so an existing record is never overwritten.
  try {
    await saveSnapshots(
      [{ id: data.id, status: data.status as RegistrationStatus, amountReceived: data.amount_received, name: data.name, email: data.email, whatsapp: data.whatsapp }],
      { insertOnly: true },
    );
  } catch {
    console.error("[landing-registration-edit] could not remember the sheet values");
    return { ok: false, reason: "db-error" };
  }

  const patch: Partial<Record<Field, string>> = {};
  for (const f of changed) patch[f] = wanted[f];
  const { error: uErr } = await db.from("landing_registrations").update(patch).eq("id", data.id);
  if (uErr) {
    if (uErr.code === "23505") return { ok: false, reason: "email-taken" };
    console.error("[landing-registration-edit] update failed:", uErr.code);
    return { ok: false, reason: "db-error" };
  }

  // A problem here never fails the edit. If the job row was written, the cron drain retries it; if the enqueue
  // itself failed there is no job row, so the sheet is only updated by the direct attempt below (or a later scan).
  try {
    const queued = await enqueueSheetDetails(data.id).catch(() => {
      console.error("[landing-registration-edit] could not queue the sheet details job for registration", data.id);
      return false;
    });
    runInBackground(queued ? runJobsFor(data.id) : runJobsDirect(data.id, ["sheet_details"]));
  } catch {
    console.error("[landing-registration-edit] sheet details push crashed");
  }
  return { ok: true, changed: [...changed] };
}
