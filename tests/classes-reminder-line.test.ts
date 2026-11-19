import { describe, it, expect } from "vitest";
import { reminderLine } from "@/lib/classes/reminder-line";
import type { Json } from "@/lib/supabase/database.types";
import { formatPkt } from "@/lib/attendance/rules";

const START = "2026-12-01T10:00:00.000Z";
const AUD = { mode: "live", modules: "all" };
const base = { starts_at: START, email_enabled: true, email_lead_minutes: 60, audience: AUD as Json };
const before = new Date("2026-12-01T08:00:00.000Z");

describe("reminderLine", () => {
  it("sent wins", () => {
    const r = reminderLine({ ...base, email_enabled: false }, { reminderAt: "2026-12-01T08:55:00.000Z", updateAt: null }, new Date("2026-12-02T00:00:00Z"));
    expect(r).toEqual({ text: `Reminder sent ${formatPkt("2026-12-01T08:55:00.000Z")}`, tone: "ok" });
  });
  it("started, nothing sent", () => {
    expect(reminderLine(base, undefined, new Date("2026-12-01T10:00:00Z"))).toEqual({ text: "No reminder was sent for this class", tone: "idle" });
  });
  it("switched off", () => {
    expect(reminderLine({ ...base, email_enabled: false }, undefined, before)).toEqual({ text: "Reminder is switched off", tone: "idle" });
  });
  it("no audience", () => {
    expect(reminderLine({ ...base, audience: null }, undefined, before)).toEqual({ text: "Choose who gets the reminder", tone: "warn" });
    expect(reminderLine({ ...base, audience: { bad: 1 } as Json }, undefined, before).tone).toBe("warn");
  });
  it("due", () => {
    const r = reminderLine(base, { reminderAt: null, updateAt: null }, new Date("2026-12-01T09:00:00Z"));
    expect(r).toEqual({ text: "Reminder is due and goes out within a few minutes", tone: "warn" });
  });
  it("will send", () => {
    expect(reminderLine(base, undefined, before)).toEqual({ text: `Reminder will send ${formatPkt("2026-12-01T09:00:00.000Z")}`, tone: "ok" });
  });
  it("lead 0 uses start time", () => {
    expect(reminderLine({ ...base, email_lead_minutes: 0 }, undefined, before).text).toBe(`Reminder will send ${formatPkt("2026-12-01T10:00:00.000Z")}`);
  });
});
