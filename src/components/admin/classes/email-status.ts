import { formatPkt } from "@/lib/attendance/rules";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";
import { audienceFromJson } from "@/lib/classes/audience";

type StatusSession = Pick<SessionRow, "email_enabled" | "audience" | "starts_at" | "email_lead_minutes">;

/** When the reminder goes out (class start minus the lead minutes), only while the switch is on, an audience is chosen and that time is still ahead. */
export function reminderSendIso(session: StatusSession, now: Date): string | null {
  if (!session.email_enabled || !audienceFromJson(session.audience)) return null;
  const startMs = new Date(session.starts_at).getTime();
  if (Number.isNaN(startMs)) return null;
  const sendMs = startMs - session.email_lead_minutes * 60_000;
  return sendMs > now.getTime() ? new Date(sendMs).toISOString() : null;
}

/** One plain line about the class emails, for the Links and emails tab and the edit dialog. */
export function emailStatusLine(session: StatusSession, sends: SessionSendState | undefined, now: Date): string {
  if (sends?.reminderAt) {
    const base = `Reminder email sent ${formatPkt(sends.reminderAt)}`;
    return sends.updateAt ? `${base}. Class details email sent ${formatPkt(sends.updateAt)}` : base;
  }
  if (sends?.updateAt) return `Class details email sent ${formatPkt(sends.updateAt)}`;
  if (session.email_enabled && !audienceFromJson(session.audience)) return "Choose who gets this email";
  if (!session.email_enabled) return "Reminder email is switched off";
  const sendIso = reminderSendIso(session, now);
  if (sendIso) return `Reminder set. Goes out ${formatPkt(sendIso)}`;
  const startMs = new Date(session.starts_at).getTime();
  if (!Number.isNaN(startMs) && now.getTime() < startMs) return "Reminder is due and goes out within a few minutes";
  return "Reminder email not sent yet";
}
