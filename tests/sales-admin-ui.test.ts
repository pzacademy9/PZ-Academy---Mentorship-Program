import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";
import {
  ADMIN_BATCH_NOTE,
  blockedReasonLabel,
  numberStatusLabel,
  pausedNumbers,
  quietSegments,
  settingsPatch,
  validateSettings,
  type NumberAdminJson,
} from "@/lib/crm/sales-admin-ui";
import type { BudgetJson } from "@/lib/crm/sales-ui";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const row = (over: Partial<NumberAdminJson> = {}): NumberAdminJson => ({
  id: "n1", label: "DMC 2", phone_e164: null, status: "active", frozen_until: null,
  warmup_started_on: "2026-01-01", daily_cap: null, hourly_cap: null, created_at: "2026-01-01T00:00:00Z", agents: [], ...over,
});
const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 0, dailyCap: 60, hourlyUsed: 0, hourlyCap: 20, hourlyWarning: false, quietHours: false,
  quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});

describe("settingsPatch", () => {
  it("sends only changed keys", () => {
    expect(settingsPatch(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, daily_cap: 40, timezone: "Asia/Karachi" })).toEqual({ daily_cap: 40 });
    expect(settingsPatch(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({});
  });
});

describe("quietSegments", () => {
  it("splits a wrapping window into night / day / night", () => {
    expect(quietSegments(21, 9)).toEqual([
      { from: 0, to: 9, quiet: true },
      { from: 9, to: 21, quiet: false },
      { from: 21, to: 24, quiet: true },
    ]);
  });
  it("handles a non-wrapping window and an empty one", () => {
    expect(quietSegments(1, 6)).toEqual([
      { from: 0, to: 1, quiet: false },
      { from: 1, to: 6, quiet: true },
      { from: 6, to: 24, quiet: false },
    ]);
    expect(quietSegments(5, 5)).toEqual([{ from: 0, to: 24, quiet: false }]);
  });
});

describe("labels", () => {
  it("explains blocked reasons", () => {
    expect(blockedReasonLabel("panic_freeze")).toBe("Agent pressed \"My WhatsApp warns or restricts me\"");
    expect(blockedReasonLabel("hourly_cap")).toBe("Hourly limit reached");
    expect(blockedReasonLabel("weird")).toBe("weird");
  });
  it("describes a number's state", () => {
    expect(numberStatusLabel(row(), budget(), 60)).toBe("Active");
    expect(numberStatusLabel(row(), budget({ dailyCap: 20 }), 60)).toBe("Warming up: 20 a day today");
    expect(numberStatusLabel(row({ daily_cap: 30 }), budget({ dailyCap: 30 }), 60)).toBe("Active");
    expect(numberStatusLabel(row({ status: "frozen" }), budget({ frozen: true }), 60)).toBe("Paused (no end date)");
    expect(numberStatusLabel(row({ status: "frozen", frozen_until: "2026-10-07T10:00:00.000Z" }), budget({ frozen: true, frozenUntil: "2026-10-07T10:00:00.000Z" }), 60)).toMatch(/^Paused until /);
  });
  it("the admin batch note says batches are not counted", () => {
    expect(ADMIN_BATCH_NOTE).toMatch(/not counted/i);
  });
});

describe("pausedNumbers", () => {
  it("lists running pauses and who pressed the panic button", () => {
    const numbers = [
      row({ id: "a", label: "A", status: "frozen", frozen_until: "2026-10-06T10:00:00.000Z" }),
      row({ id: "b", label: "B", status: "frozen", frozen_until: "2026-10-01T10:00:00.000Z" }), // expired
      row({ id: "c", label: "C", status: "frozen", frozen_until: null }),
      row({ id: "d", label: "D" }),
    ];
    const log = [{ id: "l1", reason: "panic_freeze", created_at: "2026-10-05T09:00:00.000Z", number_label: "A", agent_name: "Sara", contact_name: null }];
    expect(pausedNumbers(numbers, log, NOW)).toEqual([
      { id: "a", label: "A", until: "2026-10-06T10:00:00.000Z", byAgent: "Sara" },
      { id: "c", label: "C", until: null, byAgent: null },
    ]);
  });
});

describe("validateSettings", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([]);
  });
  it("catches the cross-field rules and empty fields", () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, spacing_min_s: 200, spacing_max_s: 100 })).toEqual(["The longest gap must be at least the shortest gap."]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, hourly_warn_at: 30 })).toEqual(["The warning must come at or before the hourly limit."]);
    expect(validateSettings({ ...DEFAULT_SETTINGS, daily_cap: NaN })).toHaveLength(1);
    expect(validateSettings({ ...DEFAULT_SETTINGS, quiet_start_hour: 24 })).toHaveLength(1);
  });
});
