// Client-safe helpers for the Sales Workspace screens. Pure: no I/O, `now` injected.
// Never import server-only modules here; components import this file.
import type { OutcomeKind } from "@/lib/crm/followup";
import { formatDateTime, formatTime } from "@/lib/format";

export type BudgetJson = {
  dailyUsed: number; dailyCap: number; hourlyUsed: number; hourlyCap: number;
  hourlyWarning: boolean; quietHours: boolean; quietEndsAt: string | null;
  frozen: boolean; frozenUntil: string | null; nextUnlockAt: string | null;
};
export type AgentBudgetJson = { number: { id: string; label: string; phone_e164: string | null }; budget: BudgetJson };
export type QueueCardJson = {
  id: string; full_name: string; phone_e164: string; last_outcome: string | null;
  next_followup_at: string | null; last_note: string | null; warm: boolean; recently_contacted: boolean;
};
export type ContactRowJson = {
  id: string; full_name: string; phone_e164: string | null; owner_id: string | null; owner_name: string | null;
  last_outcome: string | null; next_followup_at: string | null; do_not_contact_at: string | null;
};
export type TimelineEntryJson = { id: string; kind: string; body: string | null; agent_name: string | null; created_at: string };
export type ContactDetailJson = {
  contact: ContactRowJson & { email: string | null; profession: string | null };
  timeline: TimelineEntryJson[]; canAct: boolean; restricted: boolean;
};
export type TemplateJson = { id: string; name: string; body: string };
export type SendOkJson = { link: string; nextUnlockAt: string; warnings: string[]; isNewChat: boolean; budget: BudgetJson };
export type ApiErrorJson = { error?: string; reason?: string; retryAt?: string | null };
export type SendLock =
  | { kind: "loading" } | { kind: "ready" } | { kind: "no-number" }
  | { kind: "frozen"; until: string | null } | { kind: "quiet"; until: string | null }
  | { kind: "wait"; until: string } | { kind: "daily-cap" } | { kind: "hourly-cap" };

const DAY_MS = 86_400_000;

export const DEFAULT_MESSAGE =
  "Hi {{first_name}}, this is PZ Academy. You asked us about our courses. Is now a good time to share the details? Reply STOP if you would rather not hear from us.";

export const OUTCOME_BUTTONS: readonly { kind: OutcomeKind; label: string }[] = [
  { kind: "replied", label: "Replied" },
  { kind: "interested", label: "Interested" },
  { kind: "bought", label: "Bought" },
  { kind: "not_interested", label: "Not interested" },
];

const left = (b: BudgetJson) => b.dailyCap - b.dailyUsed;

export function pickDefaultNumber(budgets: AgentBudgetJson[]): string | null {
  if (budgets.length === 0) return null;
  const open = budgets.filter((b) => !b.budget.frozen);
  const pool = open.length > 0 ? open : budgets;
  return [...pool].sort((a, b) => left(b.budget) - left(a.budget) || a.number.label.localeCompare(b.number.label))[0]
    .number.id;
}

export function secondsUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now.getTime()) / 1000));
}

export function formatWait(seconds: number, untilIso: string): string {
  if (seconds <= 120) return `in ${seconds}s`;
  if (seconds < 3600) return `in ${Math.ceil(seconds / 60)} min`;
  return `at ${formatTime(untilIso)}`;
}

export function sendLock(input: {
  budgets: AgentBudgetJson[] | null;
  selected: AgentBudgetJson | null;
  warm: boolean;
  now: Date;
}): SendLock {
  const { budgets, selected, warm, now } = input;
  if (budgets === null) return { kind: "loading" };
  if (budgets.length === 0 || !selected) return { kind: "no-number" };
  const b = selected.budget;
  if (b.frozen) return { kind: "frozen", until: b.frozenUntil };
  if (b.quietHours) return { kind: "quiet", until: b.quietEndsAt };
  if (b.nextUnlockAt && Date.parse(b.nextUnlockAt) > now.getTime()) return { kind: "wait", until: b.nextUnlockAt };
  if (!warm && b.dailyUsed >= b.dailyCap) return { kind: "daily-cap" };
  if (!warm && b.hourlyUsed >= b.hourlyCap) return { kind: "hourly-cap" };
  return { kind: "ready" };
}

export function lockCopy(lock: SendLock, now: Date): { button: string; detail: string | null } {
  switch (lock.kind) {
    case "loading":
      return { button: "Checking your limits…", detail: null };
    case "ready":
      return { button: "Message on WhatsApp", detail: null };
    case "no-number":
      return {
        button: "No WhatsApp number yet",
        detail: "Ask your admin to give you a WhatsApp number. You cannot send until then.",
      };
    case "frozen":
      return {
        button: "This number is paused",
        detail: lock.until
          ? `Paused until ${formatDateTime(lock.until)}. Ask your admin if you need it sooner.`
          : "Your admin paused this number. Ask them when it will be back.",
      };
    case "quiet":
      return {
        button: "Paused overnight",
        detail: lock.until ? `Messaging opens again at ${formatTime(lock.until)}.` : "Messaging is paused overnight.",
      };
    case "wait": {
      const s = secondsUntil(lock.until, now);
      return {
        button: `Next message unlocks ${formatWait(s, lock.until)}`,
        detail:
          s > 240
            ? "Break time. After a run of messages the app pauses for a few minutes."
            : "The app leaves a gap between messages so your sending looks less like a bulk sender.",
      };
    }
    case "daily-cap":
      return {
        button: "Today's new chats are used up",
        detail: "You can still message people who already replied. New chats open again tomorrow morning.",
      };
    case "hourly-cap":
      return {
        button: "This hour's new chats are used up",
        detail: "Take a short break. New chats open again within the hour.",
      };
  }
}

export function budgetLine(b: BudgetJson): string {
  return `${b.dailyUsed} of ${b.dailyCap} new chats used today`;
}

export function hourLine(b: BudgetJson): string {
  return `${b.hourlyUsed} of ${b.hourlyCap} this hour`;
}

export function explainSendError(body: ApiErrorJson | null, now: Date): string {
  const base = body?.error ?? "Could not send this message.";
  if (!body?.retryAt) return base;
  return `${base} Try again ${formatWait(secondsUntil(body.retryAt, now), body.retryAt)}.`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  sent: "Messaged on WhatsApp",
  replied: "Replied",
  interested: "Interested",
  bought: "Bought",
  not_interested: "Not interested",
  note: "Note",
  claimed: "Claimed",
  reassigned: "Assigned by admin",
  released: "Released to unclaimed",
};

export function activityLabel(kind: string): string {
  return ACTIVITY_LABELS[kind] ?? kind;
}

export function outcomeLabel(lastOutcome: string | null): string {
  return OUTCOME_BUTTONS.find((o) => o.kind === lastOutcome)?.label ?? "New";
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function leadPayload(f: { phone: string; name: string; email: string; profession: string; note: string }): Record<string, string> {
  const out: Record<string, string> = { phone: f.phone.trim() };
  for (const key of ["name", "email", "profession", "note"] as const) {
    const v = f[key].trim();
    if (v) out[key] = v;
  }
  return out;
}

export function recentlySent(timeline: TimelineEntryJson[], now: Date): boolean {
  return timeline.some((t) => t.kind === "sent" && now.getTime() - Date.parse(t.created_at) < DAY_MS);
}

