import { formatPkt } from "@/lib/attendance/rules";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";

/** One plain line about the class emails, for the Attendance card and the edit dialog. */
export function emailStatusLine(session: Pick<SessionRow, "email_enabled">, sends: SessionSendState | undefined): string {
  if (sends?.reminderAt) {
    const base = `Reminder email sent ${formatPkt(sends.reminderAt)}`;
    return sends.updateAt ? `${base}. Time change email sent ${formatPkt(sends.updateAt)}` : base;
  }
  if (sends?.updateAt) return `Time change email sent ${formatPkt(sends.updateAt)}`;
  return session.email_enabled ? "Reminder email not sent yet" : "Reminder email is switched off";
}
