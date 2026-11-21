import { describe, it, expect } from "vitest";
import {
  checkinWindow,
  pktToIso,
  isoToPktInput,
  formatPkt,
  attendancePercent,
  meetsMinimum,
  generateSessionCode,
  effectiveWindow,
  parseWindowMinutes,
  checkinCountdown,
  formatCountdown,
} from "@/lib/attendance/rules";

describe("PKT conversion", () => {
  it("converts PKT input to UTC ISO", () => {
    expect(pktToIso("2026-11-03T20:00")).toBe("2026-11-03T15:00:00.000Z");
  });
  it("converts UTC ISO to PKT input", () => {
    expect(isoToPktInput("2026-11-03T15:00:00.000Z")).toBe("2026-11-03T20:00");
  });
  it("rejects impossible or malformed input", () => {
    expect(pktToIso("2026-02-30T10:00")).toBeNull();
    expect(pktToIso("nonsense")).toBeNull();
  });
  it("formats for display", () => {
    expect(formatPkt("2026-11-03T15:00:00.000Z")).toBe("Tue 3 Nov, 8:00 pm PKT");
  });
});

describe("checkinWindow", () => {
  const start = "2026-11-03T15:00:00.000Z";
  const at = (t: string) => new Date(`2026-11-03T${t}Z`);
  it("auto: opens 15 min before, closes 15 min after", () => {
    expect(checkinWindow(start, "auto", at("14:45:00"))).toBe("open");
    expect(checkinWindow(start, "auto", at("14:44:59"))).toBe("before");
    expect(checkinWindow(start, "auto", at("15:15:00"))).toBe("open");
    expect(checkinWindow(start, "auto", at("15:15:01"))).toBe("closed");
  });
  it("overrides", () => {
    expect(checkinWindow(start, "open", at("18:00:00"))).toBe("open");
    expect(checkinWindow(start, "closed", at("15:00:00"))).toBe("closed");
  });
});

describe("checkinWindow with a bad start time", () => {
  it("auto mode is closed; override open still opens", () => {
    expect(checkinWindow("not a date", "auto", new Date())).toBe("closed");
    expect(checkinWindow("not a date", "open", new Date())).toBe("open");
  });
});

describe("attendancePercent / meetsMinimum", () => {
  it("rounds and caps", () => {
    expect(attendancePercent(3, 4)).toBe(75);
    expect(attendancePercent(1, 3)).toBe(33);
    expect(attendancePercent(2, 3)).toBe(67);
    expect(attendancePercent(0, 0)).toBeNull();
    expect(attendancePercent(5, 4)).toBe(100);
    expect(attendancePercent(29, 200)).toBe(15);
    expect(attendancePercent(1, 8)).toBe(13);
  });
  it("meetsMinimum", () => {
    expect(meetsMinimum(75, 75)).toBe(true);
    expect(meetsMinimum(74, 75)).toBe(false);
    expect(meetsMinimum(null, 0)).toBe(false);
  });
});

describe("generateSessionCode", () => {
  it("is 8 lowercase alphanumerics and varies", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateSessionCode();
      expect(c).toMatch(/^[a-z0-9]{8}$/);
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThanOrEqual(199);
  });
});

describe("configurable window", () => {
  const start = "2026-11-03T15:00:00.000Z";
  const at = (t: string) => new Date(`2026-11-03T${t}Z`);
  it("30 before / 5 after", () => {
    const m = { open: 30, close: 5 };
    expect(checkinWindow(start, "auto", at("14:30:00"), m)).toBe("open");
    expect(checkinWindow(start, "auto", at("14:29:59"), m)).toBe("before");
    expect(checkinWindow(start, "auto", at("15:05:00"), m)).toBe("open");
    expect(checkinWindow(start, "auto", at("15:06:00"), m)).toBe("closed");
  });
  it("0 / 0 is open only at the start", () => {
    const m = { open: 0, close: 0 };
    expect(checkinWindow(start, "auto", at("15:00:00"), m)).toBe("open");
    expect(checkinWindow(start, "auto", at("14:59:00"), m)).toBe("before");
    expect(checkinWindow(start, "auto", at("15:01:00"), m)).toBe("closed");
  });
  it("default stays 15/15", () => {
    expect(checkinWindow(start, "auto", at("14:45:00"))).toBe("open");
    expect(checkinWindow(start, "auto", at("15:15:01"))).toBe("closed");
  });
});

describe("effectiveWindow", () => {
  it("session wins", () => {
    expect(effectiveWindow({ checkin_open_minutes: 20, checkin_close_minutes: 10 }, { checkin_open_minutes: 5, checkin_close_minutes: 5 })).toEqual({ open: 20, close: 10 });
  });
  it("batch used when session null; sides separate", () => {
    expect(effectiveWindow({ checkin_open_minutes: null, checkin_close_minutes: 3 }, { checkin_open_minutes: 40, checkin_close_minutes: 50 })).toEqual({ open: 40, close: 3 });
  });
  it("15 when both missing", () => {
    expect(effectiveWindow({}, null)).toEqual({ open: 15, close: 15 });
    expect(effectiveWindow({ checkin_open_minutes: null }, undefined)).toEqual({ open: 15, close: 15 });
  });
  it("keeps 0", () => {
    expect(effectiveWindow({ checkin_open_minutes: 0, checkin_close_minutes: 0 }, { checkin_open_minutes: 9, checkin_close_minutes: 9 })).toEqual({ open: 0, close: 0 });
    expect(effectiveWindow({}, { checkin_open_minutes: 0, checkin_close_minutes: 0 })).toEqual({ open: 0, close: 0 });
  });
});

describe("parseWindowMinutes", () => {
  it("accepts whole numbers 0 to 180", () => {
    expect(parseWindowMinutes("0")).toBe(0);
    expect(parseWindowMinutes("15")).toBe(15);
    expect(parseWindowMinutes(" 180 ")).toBe(180);
  });
  it("rejects the rest", () => {
    for (const s of ["", "-1", "1.5", "181", "abc"]) expect(parseWindowMinutes(s)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(754000)).toBe("12:34");
    expect(formatCountdown(500)).toBe("00:01");
    expect(formatCountdown(0)).toBe("00:00");
  });
  it("formats hours", () => {
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
  });
  it("formats days", () => {
    expect(formatCountdown(90_000_000)).toBe("1 day 1 hour");
    expect(formatCountdown(172_800_000)).toBe("2 days");
  });
});

describe("checkinCountdown", () => {
  const start = "2026-11-03T14:00:00.000Z";
  const w = { open: 15, close: 15 };
  const at = (hm: string) => new Date(`2026-11-03T${hm}Z`);
  it("counts down to opening", () => {
    const c = checkinCountdown(start, "auto", at("13:30:00"), w);
    expect(c.state).toBe("before");
    expect(c.target).toBe("opens");
    expect(c.msLeft).toBe(15 * 60000);
    expect(c.msTotal).toBe(3_600_000);
  });
  it("counts down to closing", () => {
    const c = checkinCountdown(start, "auto", at("13:50:00"), w);
    expect(c.state).toBe("open");
    expect(c.target).toBe("closes");
    expect(c.msLeft).toBe(25 * 60000);
    expect(c.msTotal).toBe(30 * 60000);
  });
  it("has no target once closed", () => {
    const c = checkinCountdown(start, "auto", at("14:20:00"), w);
    expect(c).toEqual({ state: "closed", target: null, msLeft: 0, msTotal: 0 });
  });
  it("has no target with an override", () => {
    expect(checkinCountdown(start, "open", at("13:00:00"), w)).toEqual({ state: "open", target: null, msLeft: 0, msTotal: 0 });
    expect(checkinCountdown(start, "closed", at("13:50:00"), w)).toEqual({ state: "closed", target: null, msLeft: 0, msTotal: 0 });
  });
  it("has no target for an invalid start", () => {
    expect(checkinCountdown("nope", "auto", at("13:50:00"), w).target).toBeNull();
  });
  it("handles a 0/0 window", () => {
    const z = { open: 0, close: 0 };
    const before = checkinCountdown(start, "auto", at("13:59:30"), z);
    expect(before.target).toBe("opens");
    expect(before.msLeft).toBe(30000);
    expect(checkinCountdown(start, "auto", at("14:00:00"), z).state).toBe("open");
  });
});

describe("formatCountdown rounding boundaries", () => {
  it("rounds up to whole seconds at unit edges", () => {
    expect(formatCountdown(3_600_000)).toBe("1:00:00");
    expect(formatCountdown(3_599_001)).toBe("1:00:00");
    expect(formatCountdown(86_399_001)).toBe("1 day");
    expect(formatCountdown(59_001)).toBe("01:00");
    expect(formatCountdown(1)).toBe("00:01");
  });
});
