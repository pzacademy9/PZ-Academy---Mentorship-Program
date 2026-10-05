// Browser-side helpers for the admin WhatsApp Safety & Limits page. Pure.
import type { SafetySettings } from "@/lib/crm/send-limits";
import type { BudgetJson } from "@/lib/crm/sales-ui";
import { formatDateTime } from "@/lib/format";

export type NumberAdminJson = {
  id: string; label: string; phone_e164: string | null; status: string; frozen_until: string | null;
  warmup_started_on: string; daily_cap: number | null; hourly_cap: number | null; created_at: string;
  agents: { id: string; name: string }[];
};
export type BlockedAttemptJson = {
  id: string; reason: string; created_at: string;
  number_label: string | null; agent_name: string | null; contact_name: string | null;
};

export const ADMIN_BATCH_NOTE =
  "Batches sent from CRM > WhatsApp are not counted against these limits. Avoid using a number for an admin batch on a day agents are sending from it.";

export function settingsPatch(stored: SafetySettings, draft: SafetySettings): Partial<SafetySettings> {
  const out: Partial<SafetySettings> = {};
  for (const key of Object.keys(stored) as (keyof SafetySettings)[]) {
    if (draft[key] !== stored[key]) (out as Record<string, unknown>)[key] = draft[key];
  }
  return out;
}

export function quietSegments(start: number, end: number): { from: number; to: number; quiet: boolean }[] {
  if (start === end) return [{ from: 0, to: 24, quiet: false }];
  if (start > end) {
    return [
      { from: 0, to: end, quiet: true },
      { from: end, to: start, quiet: false },
      { from: start, to: 24, quiet: true },
    ].filter((s) => s.to > s.from);
  }
  return [
    { from: 0, to: start, quiet: false },
    { from: start, to: end, quiet: true },
    { from: end, to: 24, quiet: false },
  ].filter((s) => s.to > s.from);
}

const REASONS: Record<string, string> = {
  frozen: "Number was paused",
  quiet_hours: "Tried to send at night",
  daily_cap: "Daily limit reached",
  hourly_cap: "Hourly limit reached",
  spacing: "Sent too soon after the last message",
  panic_freeze: 'Agent pressed "My WhatsApp warns or restricts me"',
};
export function blockedReasonLabel(reason: string): string {
  return REASONS[reason] ?? reason;
}

export function numberStatusLabel(row: NumberAdminJson, budget: BudgetJson | null, plainDailyCap: number): string {
  if (budget?.frozen || row.status === "frozen") {
    const until = budget?.frozenUntil ?? row.frozen_until;
    if (budget && !budget.frozen) return "Active";
    return until ? `Paused until ${formatDateTime(until)}` : "Paused (no end date)";
  }
  const cap = row.daily_cap ?? plainDailyCap;
  if (budget && budget.dailyCap < cap) return `Warming up: ${budget.dailyCap} a day today`;
  return "Active";
}

export function pausedNumbers(
  numbers: NumberAdminJson[],
  log: BlockedAttemptJson[],
  now: Date,
): { id: string; label: string; until: string | null; byAgent: string | null }[] {
  return numbers
    .filter((n) => n.status === "frozen" && (n.frozen_until === null || Date.parse(n.frozen_until) > now.getTime()))
    .map((n) => {
      const panic = log.find((l) => l.reason === "panic_freeze" && l.number_label === n.label);
      return { id: n.id, label: n.label, until: n.frozen_until, byAgent: panic?.agent_name ?? null };
    });
}

/** Same ranges and cross-field rules as the server's settingsUpdateSchema, so mistakes show before saving. */
const RANGES: Record<Exclude<keyof SafetySettings, "timezone">, [number, number, string]> = {
  daily_cap: [1, 500, "New chats per day"],
  hourly_cap: [1, 200, "New chats per hour"],
  hourly_warn_at: [1, 200, "Warning level"],
  spacing_min_s: [0, 3600, "Shortest gap"],
  spacing_max_s: [0, 3600, "Longest gap"],
  burst_size: [1, 100, "Messages before a break"],
  burst_break_min: [0, 240, "Break length"],
  quiet_start_hour: [0, 23, "Quiet from"],
  quiet_end_hour: [0, 23, "Quiet until"],
  warmup_start: [1, 500, "New-number start"],
  warmup_step: [0, 500, "Daily increase"],
  freeze_hours: [1, 720, "Panic pause"],
};

export function validateSettings(d: SafetySettings): string[] {
  const out: string[] = [];
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const [min, max, name] = RANGES[key];
    const v = d[key];
    if (!Number.isInteger(v) || v < min || v > max) out.push(`${name} must be a whole number from ${min} to ${max}.`);
  }
  if (out.length > 0) return out;
  if (d.spacing_max_s < d.spacing_min_s) out.push("The longest gap must be at least the shortest gap.");
  if (d.hourly_warn_at > d.hourly_cap) out.push("The warning must come at or before the hourly limit.");
  if (d.timezone.trim() === "") out.push("Enter a time zone, for example Asia/Karachi.");
  return out;
}
