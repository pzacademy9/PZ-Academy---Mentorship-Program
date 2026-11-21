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
