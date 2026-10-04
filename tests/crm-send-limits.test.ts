import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  budgetSummary,
  effectiveDailyCap,
  evaluateSend,
  isQuietHours,
  laterFreezeEnd,
  isIndefinitelyFrozen,
  localParts,
  startOfLocalDay,
  violationAfterInsert,
  warmupStartAfterFreeze,
  type NumberState,
  type Usage,
} from "@/lib/crm/send-limits";

// Asia/Karachi is UTC+5 with no daylight saving.
const S = DEFAULT_SETTINGS;
const at = (iso: string) => new Date(iso);
const NOON_PKT = at("2026-10-05T07:00:00.000Z"); // 12:00 local
const AFTERNOON = at("2026-10-05T10:00:00.000Z"); // 15:00 local

const oldNumber: NumberState = {
  status: "active",
  frozenUntil: null,
  warmupStartedOn: "2026-01-01",
  dailyCapOverride: null,
  hourlyCapOverride: null,
};
const idle: Usage = { newChatsToday: 0, newChatsLastHour: 0, lastSend: null };

const base = (over: Partial<Parameters<typeof evaluateSend>[0]> = {}) =>
  evaluateSend({
    now: AFTERNOON,
    settings: S,
    state: oldNumber,
    usage: idle,
    isNewChat: true,
    rand: () => 0,
    ...over,
  });

describe("localParts / startOfLocalDay", () => {
  it("reads local clock parts", () => {
    expect(localParts(at("2026-10-05T10:30:15.000Z"), "Asia/Karachi")).toEqual({
      dateKey: "2026-10-05",
      hour: 15,
      minute: 30,
      second: 15,
    });
  });
  it("starts the local day at local midnight, not UTC midnight", () => {
    expect(startOfLocalDay(at("2026-10-05T10:30:15.250Z"), "Asia/Karachi")).toEqual(
      at("2026-10-04T19:00:00.000Z"),
    );
  });
  it("rolls over exactly at local midnight", () => {
    expect(localParts(at("2026-10-05T18:59:59.000Z"), "Asia/Karachi").dateKey).toBe("2026-10-05");
    expect(localParts(at("2026-10-05T19:00:00.000Z"), "Asia/Karachi").dateKey).toBe("2026-10-06");
  });
});

describe("isQuietHours (21:00-09:00 local)", () => {
  it("is quiet from 21:00:00 and not at 20:59:59", () => {
    expect(isQuietHours(at("2026-10-05T15:59:59.000Z"), S)).toBe(false);
    expect(isQuietHours(at("2026-10-05T16:00:00.000Z"), S)).toBe(true);
  });
  it("stays quiet after midnight and ends at 09:00:00", () => {
    expect(isQuietHours(at("2026-10-05T19:30:00.000Z"), S)).toBe(true); // 00:30
    expect(isQuietHours(at("2026-10-06T03:59:59.000Z"), S)).toBe(true); // 08:59:59
    expect(isQuietHours(at("2026-10-06T04:00:00.000Z"), S)).toBe(false); // 09:00:00
  });
  it("supports a non-wrapping window", () => {
    const s = { ...S, quiet_start_hour: 1, quiet_end_hour: 5 };
    expect(isQuietHours(at("2026-10-05T21:00:00.000Z"), s)).toBe(true); // 02:00 local
    expect(isQuietHours(at("2026-10-05T10:00:00.000Z"), s)).toBe(false);
  });
});

describe("effectiveDailyCap (warm-up)", () => {
  const st = (warmupStartedOn: string, dailyCapOverride: number | null = null): NumberState => ({
    ...oldNumber,
    warmupStartedOn,
    dailyCapOverride,
  });
  it("starts at 10 and rises by 10 a day", () => {
    expect(effectiveDailyCap(st("2026-10-05"), S, AFTERNOON)).toBe(10);
    expect(effectiveDailyCap(st("2026-10-04"), S, AFTERNOON)).toBe(20);
    expect(effectiveDailyCap(st("2026-10-03"), S, AFTERNOON)).toBe(30);
  });
  it("reaches the cap on day 5 and never exceeds it", () => {
    expect(effectiveDailyCap(st("2026-09-30"), S, AFTERNOON)).toBe(60);
    expect(effectiveDailyCap(st("2026-01-01"), S, AFTERNOON)).toBe(60);
  });
  it("a per-number override below the ramp wins", () => {
    expect(effectiveDailyCap(st("2026-01-01", 40), S, AFTERNOON)).toBe(40);
  });
  it("a future warm-up start never goes below the starting cap", () => {
    expect(effectiveDailyCap(st("2026-10-10"), S, AFTERNOON)).toBe(10);
  });
});

describe("evaluateSend", () => {
  it("allows a first send and plans the spacing within 90-180 s", () => {
    const lo = base({ rand: () => 0 });
    const hi = base({ rand: () => 0.999999 });
    expect(lo.ok && lo.nextUnlockAt).toEqual(new Date(AFTERNOON.getTime() + 90_000));
    expect(hi.ok && hi.nextUnlockAt).toEqual(new Date(AFTERNOON.getTime() + 180_000));
    expect(lo.ok && lo.burstPos).toBe(1);
    expect(lo.ok && lo.isNewChat).toBe(true);
  });

  it("blocks a frozen number until the freeze ends, allows after", () => {
    const frozen = (frozenUntil: Date | null): NumberState => ({
      ...oldNumber,
      status: "frozen",
      frozenUntil,
    });
    const r = base({ state: frozen(at("2026-10-06T10:00:00.000Z")) });
    expect(r).toMatchObject({ ok: false, reason: "frozen", retryAt: at("2026-10-06T10:00:00.000Z") });
    expect(base({ state: frozen(at("2026-10-05T09:00:00.000Z")) }).ok).toBe(true);
    expect(base({ state: frozen(null) })).toMatchObject({ ok: false, reason: "frozen" });
  });

  it("blocks in quiet hours and says when it ends", () => {
    const r = base({ now: at("2026-10-05T17:00:00.000Z") }); // 22:00 local
    expect(r).toMatchObject({ ok: false, reason: "quiet_hours", retryAt: at("2026-10-06T04:00:00.000Z") });
    const early = base({ now: at("2026-10-05T20:00:00.000Z") }); // 01:00 local
    expect(early).toMatchObject({ ok: false, reason: "quiet_hours", retryAt: at("2026-10-06T04:00:00.000Z") });
  });

  it("enforces spacing, inclusive at the unlock instant", () => {
    const lastSend = (unlockMs: number) => ({
      createdAt: new Date(AFTERNOON.getTime() - 60_000),
      nextUnlockAt: new Date(AFTERNOON.getTime() + unlockMs),
      burstPos: 1,
    });
    const blocked = base({ usage: { ...idle, lastSend: lastSend(30_000) } });
    expect(blocked).toMatchObject({ ok: false, reason: "spacing" });
    expect(base({ usage: { ...idle, lastSend: lastSend(0) } }).ok).toBe(true);
  });

  it("enforces the daily cap for new chats only, retrying at local midnight", () => {
    const full: Usage = { ...idle, newChatsToday: 60 };
    expect(base({ usage: full })).toMatchObject({
      ok: false,
      reason: "daily_cap",
      retryAt: at("2026-10-05T19:00:00.000Z"),
    });
    expect(base({ usage: full, isNewChat: false }).ok).toBe(true);
  });

  it("uses the warm-up cap for a new number", () => {
    const fresh: NumberState = { ...oldNumber, warmupStartedOn: "2026-10-05" };
    expect(base({ state: fresh, usage: { ...idle, newChatsToday: 10 } })).toMatchObject({
      ok: false,
      reason: "daily_cap",
    });
    expect(base({ state: fresh, usage: { ...idle, newChatsToday: 9 } }).ok).toBe(true);
  });

  it("enforces the hourly cap and warns from the 15th", () => {
    expect(base({ usage: { ...idle, newChatsLastHour: 20 } })).toMatchObject({
      ok: false,
      reason: "hourly_cap",
    });
    const warn = base({ usage: { ...idle, newChatsLastHour: 14 } });
    expect(warn.ok && warn.warnings).toEqual(["5 left this hour, slow down"]);
    const quiet = base({ usage: { ...idle, newChatsLastHour: 13 } });
    expect(quiet.ok && quiet.warnings).toEqual([]);
  });

  it("locks for the burst break on the 10th send", () => {
    const prev = {
      createdAt: new Date(AFTERNOON.getTime() - 100_000),
      nextUnlockAt: new Date(AFTERNOON.getTime() - 10_000),
      burstPos: 9,
    };
    const r = base({ usage: { ...idle, lastSend: prev } });
    expect(r.ok && r.burstPos).toBe(10);
    expect(r.ok && r.nextUnlockAt).toEqual(new Date(AFTERNOON.getTime() + 10 * 60_000));
  });

  it("restarts the burst after the break was served or a long gap", () => {
    const afterBreak = {
      createdAt: new Date(AFTERNOON.getTime() - 11 * 60_000),
      nextUnlockAt: new Date(AFTERNOON.getTime() - 60_000),
      burstPos: 10,
    };
    expect((base({ usage: { ...idle, lastSend: afterBreak } }) as { burstPos: number }).burstPos).toBe(1);
    const longGap = { ...afterBreak, burstPos: 3 };
    expect((base({ usage: { ...idle, lastSend: longGap } }) as { burstPos: number }).burstPos).toBe(1);
  });

  it("replies obey frozen, quiet hours and spacing but not the caps", () => {
    const capped: Usage = { newChatsToday: 99, newChatsLastHour: 99, lastSend: null };
    expect(base({ usage: capped, isNewChat: false }).ok).toBe(true);
    expect(base({ now: at("2026-10-05T17:00:00.000Z"), isNewChat: false })).toMatchObject({
      ok: false,
      reason: "quiet_hours",
    });
  });
});

describe("budgetSummary", () => {
  it("reports used / cap, hourly warning and the next unlock", () => {
    const b = budgetSummary({
      now: AFTERNOON,
      settings: S,
      state: oldNumber,
      usage: {
        newChatsToday: 12,
        newChatsLastHour: 16,
        lastSend: {
          createdAt: new Date(AFTERNOON.getTime() - 10_000),
          nextUnlockAt: new Date(AFTERNOON.getTime() + 74_000),
          burstPos: 2,
        },
      },
    });
    expect(b).toMatchObject({
      dailyUsed: 12,
      dailyCap: 60,
      hourlyUsed: 16,
      hourlyCap: 20,
      hourlyWarning: true,
      quietHours: false,
      frozenUntil: null,
      nextUnlockAt: new Date(AFTERNOON.getTime() + 74_000),
    });
  });
  it("hides an unlock time that has already passed", () => {
    const b = budgetSummary({
      now: AFTERNOON,
      settings: S,
      state: oldNumber,
      usage: {
        ...idle,
        lastSend: {
          createdAt: new Date(AFTERNOON.getTime() - 200_000),
          nextUnlockAt: new Date(AFTERNOON.getTime() - 20_000),
          burstPos: 1,
        },
      },
    });
    expect(b.nextUnlockAt).toBeNull();
  });
});

describe("violationAfterInsert (race re-check)", () => {
  const args = {
    now: AFTERNOON,
    settings: S,
    state: oldNumber,
    isNewChat: true,
    usageWithOurs: { newChatsToday: 5, newChatsLastHour: 5 },
    previousSend: null as null | { createdAt: Date; nextUnlockAt: Date; burstPos: number },
  };
  it("passes when nothing is broken", () => {
    expect(violationAfterInsert(args)).toBeNull();
  });
  it("flags spacing when an earlier send was still locking the number", () => {
    const previousSend = {
      createdAt: new Date(AFTERNOON.getTime() - 1000),
      nextUnlockAt: new Date(AFTERNOON.getTime() + 60_000),
      burstPos: 1,
    };
    expect(violationAfterInsert({ ...args, previousSend })).toBe("spacing");
  });
  it("flags the daily and hourly caps once our own row is counted", () => {
    expect(violationAfterInsert({ ...args, usageWithOurs: { newChatsToday: 61, newChatsLastHour: 5 } })).toBe("daily_cap");
    expect(violationAfterInsert({ ...args, usageWithOurs: { newChatsToday: 5, newChatsLastHour: 21 } })).toBe("hourly_cap");
  });
  it("ignores the caps for non-new chats", () => {
    expect(
      violationAfterInsert({ ...args, isNewChat: false, usageWithOurs: { newChatsToday: 99, newChatsLastHour: 99 } }),
    ).toBeNull();
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("holds the owner-tuned values", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
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
    });
  });
});

describe("warmupStartAfterFreeze", () => {
  it("is the local calendar date of the freeze expiry", () => {
    expect(warmupStartAfterFreeze(new Date("2026-10-07T00:00:00Z"), "Asia/Karachi")).toBe("2026-10-07");
    expect(warmupStartAfterFreeze(new Date("2026-10-07T20:00:00Z"), "Asia/Karachi")).toBe("2026-10-08");
  });
});

describe("laterFreezeEnd", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  const candidate = new Date("2026-10-06T10:00:00Z");
  it("keeps a later existing freeze", () => {
    const existing = new Date("2026-10-10T10:00:00Z");
    expect(laterFreezeEnd(existing, candidate, now)).toBe(existing);
  });
  it("uses the candidate when existing is earlier, null or already past", () => {
    expect(laterFreezeEnd(new Date("2026-10-05T10:00:00Z"), candidate, now)).toBe(candidate);
    expect(laterFreezeEnd(null, candidate, now)).toBe(candidate);
    expect(laterFreezeEnd(new Date("2026-10-01T10:00:00Z"), candidate, now)).toBe(candidate);
  });
});

void NOON_PKT;

describe("isIndefinitelyFrozen", () => {
  it("is true only for frozen with no end date", () => {
    expect(isIndefinitelyFrozen("frozen", null)).toBe(true);
    expect(isIndefinitelyFrozen("frozen", "2026-10-05T00:00:00Z")).toBe(false);
    expect(isIndefinitelyFrozen("active", null)).toBe(false);
  });
});
