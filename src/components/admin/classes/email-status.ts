import { formatPkt } from "@/lib/attendance/rules";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";
import { audienceFromJson } from "@/lib/classes/audience";

/** One plain line about the class emails, for the Attendance card and the edit dialog. */
export function emailStatusLine(session: Pick<SessionRow, "email_enabled" | "audience">, sends: SessionSendState | undefined): string {
  if (sends?.reminderAt) {
    const base = `Reminder email sent ${formatPkt(sends.reminderAt)}`;
    return sends.updateAt ? `${base}. Class details email sent ${formatPkt(sends.updateAt)}` : base;
  }
  if (sends?.updateAt) return `Class details email sent ${formatPkt(sends.updateAt)}`;
  if (session.email_enabled && !audienceFromJson(session.audience)) return "Choose who gets this email";
  return session.email_enabled ? "Reminder email not sent yet" : "Reminder email is switched off";
}
