import { formatPkt } from "@/lib/attendance/rules";
import { audienceFromJson } from "@/lib/classes/audience";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";

export type ReminderTone = "ok" | "warn" | "idle";
export type ReminderLine = { text: string; tone: ReminderTone };

/** One plain-words line saying what will happen (or did) with a class reminder email. */
export function reminderLine(
  session: Pick<SessionRow, "starts_at" | "email_enabled" | "email_lead_minutes" | "audience">,
  sends: SessionSendState | undefined,
  now: Date,
): ReminderLine {
  const startMs = new Date(session.starts_at).getTime();
  if (Number.isNaN(startMs)) return { text: "Class time is not set", tone: "idle" };
  if (sends?.reminderAt) return { text: `Reminder sent ${formatPkt(sends.reminderAt)}`, tone: "ok" };
  if (now.getTime() >= startMs) return { text: "No reminder was sent for this class", tone: "idle" };
  if (!session.email_enabled) return { text: "Reminder is switched off", tone: "idle" };
  if (!audienceFromJson(session.audience)) return { text: "Choose who gets the reminder", tone: "warn" };
  const sendMs = startMs - session.email_lead_minutes * 60_000;
  if (now.getTime() >= sendMs) return { text: "Reminder is due and goes out within a few minutes", tone: "warn" };
  return { text: `Reminder will send ${formatPkt(new Date(sendMs).toISOString())}`, tone: "ok" };
}
