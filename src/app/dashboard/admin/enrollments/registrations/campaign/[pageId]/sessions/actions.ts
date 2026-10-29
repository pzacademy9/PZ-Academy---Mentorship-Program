"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { pktToIso, type WindowOverride } from "@/lib/attendance/rules";
import {
  createSession,
  deleteSession,
  getSessionById,
  isLiveEnrolled,
  markAllPresent,
  markPresent,
  setMinPct,
  unmarkPresent,
  updateSession,
  type SessionInput,
} from "@/lib/data/attendance";
import { createSessionSend, listSessionSendState } from "@/lib/data/session-emails";
import { runEmailSend } from "@/lib/data/participant-sends";
import { getBatchProgramId } from "@/lib/data/batch-feedback";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";

export type ActionResult = { ok: boolean; message?: string; staleReminder?: boolean };

const NOT_ALLOWED = "You do not have permission to do this.";
const SAVE_FAILED = "Something went wrong. Please try again.";
const NO_SESSION = "That class was not found";
const NO_PAGE = "That batch was not found";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const BAD_TIME = "Please enter a valid date and time";
const SEND_MESSAGES: Record<string, string> = {
  no_zoom: "No Zoom link on this class",
  already_sent: "Reminder already sent",
  started: "This class has already started",
  disabled: "Reminders are switched off for this class",
  no_recipients: "Nobody to send to",
  not_set_up: "Email is not set up",
  too_soon: "Wait a minute before sending again",
  no_feedback_link: "This class has no feedback link yet",
  still_sending: "The last feedback email is still being sent. Please wait until it finishes.",
};
const OVERRIDES: readonly WindowOverride[] = ["auto", "open", "closed"];

/** What the form sends: the time is typed in PKT as `YYYY-MM-DDTHH:mm`. */
type NewFields = "endsAt" | "speaker" | "customTime" | "customZoom";
export type SessionForm = Omit<SessionInput, "startsAt" | NewFields> &
  Partial<Pick<SessionInput, NewFields>> & { startsAtLocal: string; endsAtLocal?: string };

function refresh(pageId: string) {
  revalidatePath(`/dashboard/admin/enrollments/registrations/campaign/${pageId}/sessions`);
}

const isUrlOrEmpty = (v: string) => v.trim() === "" || /^https?:\/\/\S+$/i.test(v.trim());

function parseForm(f: SessionForm): { ok: true; input: SessionInput } | { ok: false; message: string } {
  const startsAt = pktToIso(f.startsAtLocal);
  if (!startsAt) return { ok: false, message: BAD_TIME };
  if (!Number.isInteger(f.number) || f.number < 1) return { ok: false, message: "Class number must be 1 or more" };
  if (!Number.isInteger(f.emailLeadMinutes) || f.emailLeadMinutes < 0 || f.emailLeadMinutes > 10080) {
    return { ok: false, message: "Minutes before must be a whole number between 0 and 10080" };
  }
  if (!isUrlOrEmpty(f.zoomUrl) || !isUrlOrEmpty(f.kahootUrl)) {
    return { ok: false, message: "Links must start with http:// or https://" };
  }
  let endsAt: string | null = null;
  if (f.endsAtLocal !== undefined && f.endsAtLocal.trim() !== "") {
    endsAt = pktToIso(f.endsAtLocal);
    if (!endsAt) return { ok: false, message: BAD_TIME };
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return { ok: false, message: "The end time must be after the start time" };
    }
  } else if (f.endsAt !== undefined) {
    endsAt = f.endsAt;
  }
  return {
    ok: true,
    input: {
      endsAt,
      speaker: (f.speaker ?? "").trim(),
      customTime: f.customTime ?? true,
      customZoom: f.customZoom ?? true,
      number: f.number,
      title: f.title.trim(),
      startsAt,
      zoomUrl: f.zoomUrl.trim(),
      kahootUrl: f.kahootUrl.trim(),
      includeKahoot: f.includeKahoot,
      includeAttendanceLink: f.includeAttendanceLink,
      emailEnabled: f.emailEnabled,
      emailLeadMinutes: f.emailLeadMinutes,
    },
  };
}

export async function addSession(pageId: string, form: SessionForm): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId)) return { ok: false, message: NO_PAGE };
  const parsed = parseForm(form);
  if (!parsed.ok) return parsed;
  try {
    const res = await createSession(pageId, parsed.input);
    if (!res.ok) return { ok: false, message: res.message };
    refresh(pageId);
    return { ok: true, message: "Class added" };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function saveSession(sessionId: string, form: SessionForm): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  const parsed = parseForm(form);
  if (!parsed.ok) return parsed;
  try {
    const before = await getSessionById(sessionId);
    if (!before) return { ok: false, message: "That class no longer exists" };
    // Fields the old per-class form never sends keep what the class already has.
    const patch: Partial<SessionInput> = { ...parsed.input };
    if (form.endsAt === undefined && form.endsAtLocal === undefined) delete patch.endsAt;
    if (form.speaker === undefined) delete patch.speaker;
    if (form.customTime === undefined) delete patch.customTime;
    if (form.customZoom === undefined) delete patch.customZoom;
    const res = await updateSession(sessionId, patch);
    if (!res.ok) return { ok: false, message: res.message ?? SAVE_FAILED };
    refresh(before.page_id);
    const timeChanged = new Date(before.starts_at).getTime() !== new Date(parsed.input.startsAt).getTime();
    const state = timeChanged ? (await listSessionSendState([sessionId]))[sessionId] : undefined;
    return { ok: true, message: "Class saved", staleReminder: !!state?.reminderAt };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function removeSession(sessionId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  try {
    const s = await getSessionById(sessionId);
    if (!s) return { ok: false, message: NO_SESSION };
    await deleteSession(sessionId);
    refresh(s.page_id);
    return { ok: true, message: "Class deleted" };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function setOverride(sessionId: string, value: WindowOverride): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  if (!OVERRIDES.includes(value)) return { ok: false, message: SAVE_FAILED };
  try {
    const res = await updateSession(sessionId, { windowOverride: value });
    if (!res.ok) return { ok: false, message: res.message ?? SAVE_FAILED };
    const s = await getSessionById(sessionId);
    if (s) refresh(s.page_id);
    return { ok: true };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

/** Admin writes ignore the window and the start time, but only people live on this batch can be marked. */
export async function toggleMark(sessionId: string, personId: string, present: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  if (!isUuid(personId)) return { ok: false, message: "That student was not found" };
  try {
    const s = await getSessionById(sessionId);
    if (!s) return { ok: false, message: "That class no longer exists" };
    if (present) {
      if (!(await isLiveEnrolled(s.page_id, personId))) {
        return { ok: false, message: "This person is not a live student of this batch" };
      }
      await markPresent(sessionId, personId, "admin", auth.user.id);
    } else {
      await unmarkPresent(sessionId, personId);
    }
    refresh(s.page_id);
    return { ok: true };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function markEveryonePresent(sessionId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  try {
    const s = await getSessionById(sessionId);
    if (!s) return { ok: false, message: "That class no longer exists" };
    const { added } = await markAllPresent(sessionId, auth.user.id);
    refresh(s.page_id);
    return { ok: true, message: added === 1 ? "1 student marked present" : `${added} students marked present` };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

export async function saveMinPct(pageId: string, pct: number): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId)) return { ok: false, message: NO_PAGE };
  try {
    const res = await setMinPct(pageId, pct);
    if (!res.ok) return { ok: false, message: "Enter a whole number from 0 to 100" };
    refresh(pageId);
    return { ok: true, message: "Minimum saved" };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

/** Creates (or reuses) the public link to the batch's combined feedback report. Only runs on an admin click. */
export async function openProgramReport(pageId: string): Promise<{ ok: boolean; path?: string; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId)) return { ok: false, message: NO_PAGE };
  try {
    const programId = await getBatchProgramId(pageId);
    if (!programId) return { ok: false, message: "This batch has no combined report" };
    const { shareUrl } = await generateFeedbackShareToken("program", programId, auth.user.id);
    return { ok: true, path: shareUrl };
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

async function sendNow(sessionId: string, kind: "reminder" | "update" | "feedback", opts?: { resend?: boolean }): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  try {
    const res = await (opts ? createSessionSend(sessionId, kind, opts) : createSessionSend(sessionId, kind));
    if (!res.ok) return { ok: false, message: SEND_MESSAGES[res.reason] ?? SAVE_FAILED };
    // One batch of 40 now; the rest is picked up by the timer that runs the sends.
    let out: { sent: number; failed: number; pending: number };
    try {
      out = await runEmailSend(res.sendId, 40);
    } catch {
      return { ok: false, message: "The email was started but may not have gone out. Check Messages sent before trying again." };
    }
    const s = await getSessionById(sessionId);
    if (s) refresh(s.page_id);
    return sendMessage(out, kind === "feedback" ? "student" : "person");
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
}

function sendMessage(out: { sent: number; failed: number; pending: number }, noun: "person" | "student" = "person"): ActionResult {
  const people = (n: number) => (noun === "student" ? `${n} ${n === 1 ? "student" : "students"}` : `${n} ${n === 1 ? "person" : "people"}`);
  if (out.failed > 0) {
    return { ok: out.sent > 0, message: `Sent to ${people(out.sent)}, ${out.failed} could not be sent. Open Messages sent to retry.` };
  }
  if (out.pending > 0) {
    return { ok: true, message: `Sent to ${people(out.sent)} so far. The rest will go out within a few minutes.` };
  }
  return { ok: true, message: `Email sent to ${people(out.sent)}` };
}

export async function sendReminderNow(sessionId: string): Promise<ActionResult> {
  return sendNow(sessionId, "reminder");
}

export async function emailUpdatedTime(sessionId: string): Promise<ActionResult> {
  return sendNow(sessionId, "update");
}

/** A plain second send of the class details (Zoom link, attendance link): same email kind, neutral wording. */
export async function resendClassDetails(sessionId: string): Promise<ActionResult> {
  return sendNow(sessionId, "update", { resend: true });
}

/** Emails the class's feedback link to every enrolled student of the batch. */
export async function emailFeedbackLink(sessionId: string): Promise<ActionResult> {
  return sendNow(sessionId, "feedback");
}
