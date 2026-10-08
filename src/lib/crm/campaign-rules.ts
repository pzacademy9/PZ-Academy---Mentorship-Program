// Pure rules for agent campaigns. No I/O, safe to import from client components.
export const MAX_CAMPAIGN_RECIPIENTS = 2000;
export const MAX_SAME_TEXT_RUN = 3;
export const VARIETY_MESSAGE =
  "Add {{first_name}} to your message so each person gets their own greeting. WhatsApp looks at identical text sent to many people.";

export type CampaignStatus = "draft" | "active" | "paused" | "done";
export type CampaignRecipientStatus = "pending" | "sent" | "skipped" | "blocked";
export type DroppedCounts = { notOwned: number; doNotContact: number; noPhone: number; duplicates: number };

export function hasNameTag(template: string): boolean {
  return /\{\{\s*(first_name|full_name)\s*\}\}/.test(template);
}

export function varietyBlocked(template: string, recipientCount: number): boolean {
  return recipientCount > MAX_SAME_TEXT_RUN && !hasNameTag(template);
}

export function describeDropped(d: DroppedCounts): string[] {
  const out: string[] = [];
  if (d.notOwned > 0) out.push(`${d.notOwned} skipped: not your contact`);
  if (d.doNotContact > 0) out.push(`${d.doNotContact} skipped: asked not to be messaged`);
  if (d.noPhone > 0) out.push(`${d.noPhone} skipped: no phone number`);
  if (d.duplicates > 0) out.push(`${d.duplicates} skipped: picked twice`);
  return out;
}

export function splitTodayTomorrow(selected: number, remainingToday: number): { today: number; tomorrow: number } {
  const today = Math.max(0, Math.min(selected, remainingToday));
  return { today, tomorrow: selected - today };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function defaultCampaignName(now: Date): string {
  return `Campaign ${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]}`;
}

export type RefusalClass = "block-recipient" | "pause" | "retry";
const BLOCK = new Set(["do-not-contact", "no-phone", "not-owner", "not-found"]);
const PAUSE = new Set(["frozen", "quiet_hours", "daily_cap", "hourly_cap", "number-not-assigned"]);
export function classifyRefusal(reason: string): RefusalClass {
  if (BLOCK.has(reason)) return "block-recipient";
  if (PAUSE.has(reason)) return "pause";
  return "retry";
}

const PAUSE_TEXT: Record<string, string> = {
  frozen: "This number is paused.",
  quiet_hours: "Messaging is paused overnight.",
  daily_cap: "Today's new chats are used up.",
  hourly_cap: "This hour's new chats are used up.",
  "number-not-assigned": "No WhatsApp number is assigned to you.",
};
export function pauseReasonText(reason: string, message?: string | null): string {
  if (message && message.trim() !== "") return message;
  return PAUSE_TEXT[reason] ?? "Sending is paused.";
}
