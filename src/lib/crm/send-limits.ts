// WhatsApp send limits for the Sales Workspace (spec Section 5). Pure: no I/O,
// `now` and the random source are injected. These numbers are cautious guesses
// at what protects a sending number; WhatsApp does not publish its limits, so
// nothing here (or in copy that uses it) may promise safety.

export type SafetySettings = {
  daily_cap: number;
  hourly_cap: number;
  hourly_warn_at: number;
  spacing_min_s: number;
  spacing_max_s: number;
  burst_size: number;
  burst_break_min: number;
  quiet_start_hour: number;
  quiet_end_hour: number;
  warmup_start: number;
  warmup_step: number;
  freeze_hours: number;
  timezone: string;
};

export const DEFAULT_SETTINGS: SafetySettings = {
  daily_cap: 60,
  hourly_cap: 20,
  hourly_warn_at: 15,
  spacing_min_s: 90,
  spacing_max_s: 180,
  burst_size: 10,
  burst_break_min: 10,
  quiet_start_hour: 21,
  quiet_end_hour: 9,
  warmup_start: 10,
  warmup_step: 10,
  freeze_hours: 48,
  timezone: "Asia/Karachi",
};

export type NumberState = {
  status: "active" | "frozen";
  frozenUntil: Date | null;
  /** Local calendar date (YYYY-MM-DD) the number started warming up. */
  warmupStartedOn: string;
  dailyCapOverride: number | null;
  hourlyCapOverride: number | null;
};

export type LastSend = { createdAt: Date; nextUnlockAt: Date; burstPos: number };

export type Usage = {
  newChatsToday: number;
  newChatsLastHour: number;
  lastSend: LastSend | null;
};

export type BlockReason = "frozen" | "quiet_hours" | "daily_cap" | "hourly_cap" | "spacing";

export type SendDecision =
  | { ok: true; isNewChat: boolean; burstPos: number; nextUnlockAt: Date; warnings: string[] }
  | { ok: false; reason: BlockReason; message: string; retryAt: Date | null };

const DAY_MS = 86_400_000;

export function localParts(now: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(now)) p[part.type] = part.value;
  return {
    dateKey: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** The instant the local calendar day containing `now` began. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const { hour, minute, second } = localParts(now, timeZone);
  const sinceMidnight = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight);
}

/** Warm-up restarts on the local date a freeze expires, so a recovered number does not return at full cap. */
export function warmupStartAfterFreeze(frozenUntil: Date, timezone: string): string {
  return localParts(frozenUntil, timezone).dateKey;
}

/** The later of an existing, still-running freeze end and a new one, so a freeze is never shortened. */
export function laterFreezeEnd(existing: Date | null, candidate: Date, now: Date): Date {
  return existing && existing > candidate && existing > now ? existing : candidate;
}

/** An admin-set freeze with no end date. A timed (panic) freeze must never replace or shorten it. */
export function isIndefinitelyFrozen(status: string, frozenUntil: string | null): boolean {
  return status === "frozen" && frozenUntil == null;
}

export function isQuietHours(now: Date, s: SafetySettings): boolean {
  const { hour } = localParts(now, s.timezone);
  if (s.quiet_start_hour === s.quiet_end_hour) return false;
  return s.quiet_start_hour > s.quiet_end_hour
    ? hour >= s.quiet_start_hour || hour < s.quiet_end_hour
    : hour >= s.quiet_start_hour && hour < s.quiet_end_hour;
}

/** The next moment quiet hours end (only meaningful while quiet). */
function quietEndsAt(now: Date, s: SafetySettings): Date {
  const dayStart = startOfLocalDay(now, s.timezone).getTime();
  const { hour } = localParts(now, s.timezone);
  const endToday = dayStart + s.quiet_end_hour * 3_600_000;
  const wraps = s.quiet_start_hour > s.quiet_end_hour;
  const target = wraps && hour >= s.quiet_start_hour ? endToday + DAY_MS : endToday;
  return new Date(target);
}

function daysBetween(fromKey: string, toKey: string): number {
  const parse = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / DAY_MS);
}

export function effectiveDailyCap(state: NumberState, s: SafetySettings, now: Date): number {
  const base = state.dailyCapOverride ?? s.daily_cap;
  const days = Math.max(0, daysBetween(state.warmupStartedOn, localParts(now, s.timezone).dateKey));
  return Math.min(base, s.warmup_start + s.warmup_step * days);
}

function effectiveHourlyCap(state: NumberState, s: SafetySettings): number {
  return state.hourlyCapOverride ?? s.hourly_cap;
}

function isFrozen(state: NumberState, now: Date): boolean {
  if (state.status !== "frozen") return false;
  return state.frozenUntil === null || state.frozenUntil.getTime() > now.getTime();
}

export function evaluateSend(input: {
  now: Date;
  settings: SafetySettings;
  state: NumberState;
  usage: Usage;
  isNewChat: boolean;
  rand: () => number;
}): SendDecision {
  const { now, settings: s, state, usage, isNewChat, rand } = input;

  if (isFrozen(state, now)) {
    return {
      ok: false,
      reason: "frozen",
      message: "This number is paused to protect it. Ask your admin when it will be back.",
      retryAt: state.frozenUntil,
    };
  }

  if (isQuietHours(now, s)) {
    return {
      ok: false,
      reason: "quiet_hours",
      message: "Messaging is paused overnight.",
      retryAt: quietEndsAt(now, s),
    };
  }

  const last = usage.lastSend;
  if (last && last.nextUnlockAt.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: "spacing",
      message: "Wait a moment before the next message.",
      retryAt: last.nextUnlockAt,
    };
  }

  if (isNewChat) {
    const dailyCap = effectiveDailyCap(state, s, now);
    if (usage.newChatsToday >= dailyCap) {
      return {
        ok: false,
        reason: "daily_cap",
        message: "You have reached today's limit for new chats on this number.",
        retryAt: new Date(startOfLocalDay(now, s.timezone).getTime() + DAY_MS),
      };
    }
    const hourlyCap = effectiveHourlyCap(state, s);
    if (usage.newChatsLastHour >= hourlyCap) {
      return {
        ok: false,
        reason: "hourly_cap",
        message: "That is the limit for this hour. Take a short break.",
        retryAt: null,
      };
    }
  }

  const breakMs = s.burst_break_min * 60_000;
  const continuesBurst =
    last !== null &&
    last.burstPos < s.burst_size &&
    now.getTime() - last.createdAt.getTime() < breakMs;
  const burstPos = continuesBurst ? last.burstPos + 1 : 1;

  const spread = s.spacing_max_s - s.spacing_min_s + 1;
  const gapSeconds = s.spacing_min_s + Math.floor(rand() * spread);
  const nextUnlockAt =
    burstPos >= s.burst_size
      ? new Date(now.getTime() + breakMs)
      : new Date(now.getTime() + gapSeconds * 1000);

  const warnings: string[] = [];
  if (isNewChat) {
    const hourlyCap = effectiveHourlyCap(state, s);
    const usedAfter = usage.newChatsLastHour + 1;
    if (usedAfter >= s.hourly_warn_at) {
      warnings.push(`${Math.max(0, hourlyCap - usedAfter)} left this hour, slow down`);
    }
  }

  return { ok: true, isNewChat, burstPos, nextUnlockAt, warnings };
}

export type BudgetSummary = {
  dailyUsed: number;
  dailyCap: number;
  hourlyUsed: number;
  hourlyCap: number;
  hourlyWarning: boolean;
  quietHours: boolean;
  quietEndsAt: Date | null;
  frozenUntil: Date | null;
  nextUnlockAt: Date | null;
};

export function budgetSummary(input: {
  now: Date;
  settings: SafetySettings;
  state: NumberState;
  usage: Usage;
}): BudgetSummary {
  const { now, settings: s, state, usage } = input;
  const quiet = isQuietHours(now, s);
  const unlock = usage.lastSend?.nextUnlockAt ?? null;
  return {
    dailyUsed: usage.newChatsToday,
    dailyCap: effectiveDailyCap(state, s, now),
    hourlyUsed: usage.newChatsLastHour,
    hourlyCap: effectiveHourlyCap(state, s),
    hourlyWarning: usage.newChatsLastHour >= s.hourly_warn_at,
    quietHours: quiet,
    quietEndsAt: quiet ? quietEndsAt(now, s) : null,
    frozenUntil: isFrozen(state, now) ? state.frozenUntil : null,
    nextUnlockAt: unlock && unlock.getTime() > now.getTime() ? unlock : null,
  };
}

/**
 * Re-check after our send row was inserted, to catch two taps racing on a
 * shared number. `usageWithOurs` counts include the row we just wrote;
 * `previousSend` is the newest send on the number written before ours.
 * A violation means the caller must delete its row and refuse.
 */
export function violationAfterInsert(input: {
  now: Date;
  settings: SafetySettings;
  state: NumberState;
  isNewChat: boolean;
  usageWithOurs: { newChatsToday: number; newChatsLastHour: number };
  previousSend: LastSend | null;
}): BlockReason | null {
  const { now, settings: s, state, isNewChat, usageWithOurs, previousSend } = input;
  if (previousSend && previousSend.nextUnlockAt.getTime() > now.getTime()) return "spacing";
  if (isNewChat) {
    if (usageWithOurs.newChatsToday > effectiveDailyCap(state, s, now)) return "daily_cap";
    if (usageWithOurs.newChatsLastHour > effectiveHourlyCap(state, s)) return "hourly_cap";
  }
  return null;
}
