import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendParticipantEmail } from "@/lib/brevo-participants";

/**
 * Admin fixes for one person's permanent PZ ID record: see the details, correct the name,
 * issue a new ID (the old one keeps working as an alias), add or remove an email, and
 * send the ID by email. Callers guard access (requireAdmin("students")).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIVE_STATUSES = ["paid", "free"];

export type FixResult = { ok: true } | { ok: false; message: string };

export type PersonDetail = {
  id: string;
  pzId: string;
  name: string;
  emails: string[];
  /** Other IDs that still lead to this person (old or merged IDs), lower case. */
  oldIds: string[];
  batches: { title: string; mode: string; status: string }[];
  quizResults: number;
  attendance: number;
};

const TRY_AGAIN = "Something went wrong. Nothing was changed. Please try again.";
const NOT_FOUND = "This student was not found. Search again.";

/** Trimmed name with single spaces, 2 to 80 characters, at least one letter. Null when not usable. */
export function cleanPersonName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return null;
  // Latin (with accents) or Arabic/Urdu letters.
  if (!/[A-Za-z\u00C0-\u024F\u0600-\u06FF]/.test(name)) return null;
  return name;
}

function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

async function loadPerson(id: string): Promise<{ id: string; pz_id: string; display_name: string } | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await createAdminSupabase()
    .from("pz_people")
    .select("id, pz_id, display_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("person read failed");
  return (data as { id: string; pz_id: string; display_name: string } | null) ?? null;
}

async function emailsOf(id: string): Promise<string[]> {
  const { data, error } = await createAdminSupabase().from("pz_person_emails").select("email").eq("person_id", id);
  if (error) throw new Error("email read failed");
  return ((data ?? []) as { email: string }[]).map((e) => e.email).sort();
}

export async function getPersonDetail(id: string): Promise<PersonDetail | null> {
  const person = await loadPerson(String(id ?? ""));
  if (!person) return null;
  const supabase = createAdminSupabase();
  const [emails, aliases, regs, quiz, marks] = await Promise.all([
    emailsOf(person.id),
    supabase.from("pz_id_aliases").select("alias_norm").eq("person_id", person.id),
    supabase
      .from("landing_registrations")
      .select("page_id, mode, status, created_at")
      .eq("person_id", person.id)
      .eq("is_test", false)
      .order("created_at", { ascending: true }),
    supabase.from("batch_quiz_results").select("id", { count: "exact", head: true }).eq("person_id", person.id),
    supabase.from("batch_session_marks").select("id", { count: "exact", head: true }).eq("person_id", person.id),
  ]);
  if (aliases.error || regs.error || quiz.error || marks.error) throw new Error("person detail read failed");

  const current = person.pz_id.trim().toLowerCase();
  const oldIds = ((aliases.data ?? []) as { alias_norm: string }[])
    .map((a) => a.alias_norm)
    .filter((a) => a !== current)
    .sort();

  const regRows = ((regs.data ?? []) as { page_id: string; mode: string; status: string }[]).filter((r) =>
    LIVE_STATUSES.includes(r.status),
  );
  const pageIds = Array.from(new Set(regRows.map((r) => r.page_id)));
  const titles = new Map<string, string>();
  if (pageIds.length > 0) {
    const pages = await supabase.from("landing_pages").select("id, title").in("id", pageIds);
    if (pages.error) throw new Error("page read failed");
    for (const p of (pages.data ?? []) as { id: string; title: string }[]) titles.set(p.id, p.title);
  }

  return {
    id: person.id,
    pzId: person.pz_id,
    name: person.display_name,
    emails,
    oldIds,
    batches: regRows.map((r) => ({ title: titles.get(r.page_id) ?? "Unknown batch", mode: r.mode, status: r.status })),
    quizResults: quiz.count ?? 0,
    attendance: marks.count ?? 0,
  };
}

/** Corrects the display name everywhere it shows. The ID itself does not change. */
export async function renamePerson(id: string, rawName: string): Promise<FixResult> {
  const name = cleanPersonName(rawName);
  if (!name) return { ok: false, message: "Type the full name (2 to 80 characters, with letters)." };
  try {
    if (!(await loadPerson(String(id ?? "")))) return { ok: false, message: NOT_FOUND };
    const { error } = await createAdminSupabase().from("pz_people").update({ display_name: name }).eq("id", id);
    return error ? { ok: false, message: TRY_AGAIN } : { ok: true };
  } catch {
    return { ok: false, message: TRY_AGAIN };
  }
}

/** Issues a new ID from the current name. The old ID keeps working (see migration 0104). */
export async function reissuePersonId(id: string): Promise<{ ok: true; oldId: string; newId: string } | { ok: false; message: string }> {
  try {
    const person = await loadPerson(String(id ?? ""));
    if (!person) return { ok: false, message: NOT_FOUND };
    const oldId = person.pz_id;
    const { data, error } = await createAdminSupabase().rpc("pz_reissue_id", { p_person: person.id });
    if (error) {
      const missing = (error as { code?: string }).code === "PGRST202" || /could not find the function/i.test(String((error as { message?: string }).message ?? ""));
      return {
        ok: false,
        message: missing
          ? "This button needs the new SQL first. Paste the SQL from the owner steps, then try again."
          : TRY_AGAIN,
      };
    }
    if (typeof data !== "string" || !data) return { ok: false, message: TRY_AGAIN };
    return { ok: true, oldId, newId: data };
  } catch {
    return { ok: false, message: TRY_AGAIN };
  }
}

export async function addPersonEmail(id: string, rawEmail: string): Promise<FixResult> {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, message: "That does not look like an email address." };
  try {
    if (!(await loadPerson(String(id ?? "")))) return { ok: false, message: NOT_FOUND };
    const supabase = createAdminSupabase();
    const { data: owner, error } = await supabase.from("pz_person_emails").select("person_id").eq("email", email).maybeSingle();
    if (error) return { ok: false, message: TRY_AGAIN };
    const ownerId = (owner as { person_id: string } | null)?.person_id;
    if (ownerId === id) return { ok: false, message: "This email is already on file for this student." };
    if (ownerId) {
      const other = await loadPerson(ownerId);
      return {
        ok: false,
        message: `This email belongs to ${other ? `${other.display_name} (${other.pz_id})` : "another student"}. If they are the same person, merge the two IDs instead.`,
      };
    }
    const ins = await supabase.from("pz_person_emails").insert({ email, person_id: id });
    return ins.error ? { ok: false, message: TRY_AGAIN } : { ok: true };
  } catch {
    return { ok: false, message: TRY_AGAIN };
  }
}

export async function removePersonEmail(id: string, rawEmail: string): Promise<FixResult> {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, message: "Pick an email from the list." };
  try {
    if (!(await loadPerson(String(id ?? "")))) return { ok: false, message: NOT_FOUND };
    const emails = await emailsOf(id);
    if (!emails.includes(email)) return { ok: false, message: "This email is not on file for this student." };
    if (emails.length < 2) return { ok: false, message: "A student must keep at least one email. Add the right email first, then remove this one." };
    const { error } = await createAdminSupabase().from("pz_person_emails").delete().eq("email", email).eq("person_id", id);
    return error ? { ok: false, message: TRY_AGAIN } : { ok: true };
  } catch {
    return { ok: false, message: TRY_AGAIN };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain, phone-friendly email with the student's PZ ID. */
export function idEmailHtml(name: string, pzId: string): string {
  const first = escapeHtml(name.trim().split(/\s+/)[0] || "there");
  const id = escapeHtml(pzId);
  const font = "font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;";
  return (
    `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f3f7f4;${font}">` +
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e6e4;">` +
    `<div style="background:#0f3d22;padding:22px 24px;color:#ffffff;"><p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7ed957;font-weight:700;">PZ Academy</p>` +
    `<p style="margin:6px 0 0;font-size:20px;font-weight:800;">Your PZ ID</p></div>` +
    `<div style="padding:22px 24px;color:#1d2a22;font-size:14px;line-height:1.6;">` +
    `<p style="margin:0 0 12px;">Hello ${first},</p>` +
    `<p style="margin:0 0 14px;">Here is your permanent PZ ID. Please keep it safe.</p>` +
    `<p style="margin:0 0 14px;padding:14px;border:2px dashed #7ed957;border-radius:10px;text-align:center;font-family:Courier New,monospace;font-size:22px;font-weight:800;letter-spacing:2px;color:#0f3d22;">${id}</p>` +
    `<p style="margin:0 0 6px;">Use it as your Kahoot nickname in every quiz, and to mark your attendance and see your results.</p>` +
    `<p style="margin:16px 0 0;">PZ Academy</p></div></div></body></html>`
  );
}

/** Sends the ID to one of the student's own emails only. */
export async function sendIdEmail(id: string, rawEmail: string): Promise<FixResult> {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, message: "Pick an email from the list." };
  try {
    const person = await loadPerson(String(id ?? ""));
    if (!person) return { ok: false, message: NOT_FOUND };
    if (!(await emailsOf(person.id)).includes(email)) return { ok: false, message: "This email is not on file for this student." };
    const res = await sendParticipantEmail({
      to: email,
      toName: person.display_name,
      subject: "Your PZ ID",
      htmlContent: idEmailHtml(person.display_name, person.pz_id),
    });
    return res.ok ? { ok: true } : { ok: false, message: "The email could not be sent. Please try again later." };
  } catch {
    return { ok: false, message: "The email could not be sent. Please try again later." };
  }
}
