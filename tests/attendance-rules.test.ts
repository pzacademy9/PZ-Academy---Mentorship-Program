import { describe, it, expect } from "vitest";
import {
  checkinWindow,
  pktToIso,
  isoToPktInput,
  formatPkt,
  attendancePercent,
  meetsMinimum,
  generateSessionCode,
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

describe("attendancePercent / meetsMinimum", () => {
  it("rounds and caps", () => {
    expect(attendancePercent(3, 4)).toBe(75);
    expect(attendancePercent(1, 3)).toBe(33);
    expect(attendancePercent(2, 3)).toBe(67);
    expect(attendancePercent(0, 0)).toBeNull();
    expect(attendancePercent(5, 4)).toBe(100);
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
