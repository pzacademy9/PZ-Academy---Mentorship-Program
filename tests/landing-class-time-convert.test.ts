// tests/landing-class-time-convert.test.ts
import { describe, it, expect } from "vitest";
import { convertClassTime, applyPakistanClassTime } from "@/lib/landing/registration/class-time";
import { REGION_PRESETS, addRegion } from "@/lib/landing/registration/admin-edit";
import { ppcConfig } from "./fixtures/registration-fixtures";

describe("convertClassTime", () => {
  it("converts a Pakistan range to other countries", () => {
    expect(convertClassTime("19:30", "20:30", "PK")).toBe("7:30 PM – 8:30 PM");
    expect(convertClassTime("19:30", "20:30", "UAE")).toBe("6:30 PM – 7:30 PM");
    expect(convertClassTime("19:30", "20:30", "KSA")).toBe("5:30 PM – 6:30 PM");
    expect(convertClassTime("19:30", "20:30", "PH")).toBe("10:30 PM – 11:30 PM");
    expect(convertClassTime("19:30", "20:30", "IN")).toBe("8:00 PM – 9:00 PM");
  });
  it("shows one time when there is no end", () => {
    expect(convertClassTime("19:30", "", "UAE")).toBe("6:30 PM");
  });
  it("handles noon and midnight", () => {
    expect(convertClassTime("23:30", "00:30", "PK")).toBe("11:30 PM – 12:30 AM");
    expect(convertClassTime("11:30", "12:30", "PK")).toBe("11:30 AM – 12:30 PM");
  });
  it("wraps past midnight", () => {
    expect(convertClassTime("21:00", "22:00", "PH")).toBe("12:00 AM – 1:00 AM");
  });
  it("returns null for a country with no fixed offset or bad input", () => {
    expect(convertClassTime("19:30", "20:30", "US")).toBeNull();
    expect(convertClassTime("", "", "PK")).toBeNull();
    expect(convertClassTime("25:00", "", "PK")).toBeNull();
  });
});

describe("applyPakistanClassTime", () => {
  it("fills every country and leaves the rest untouched", () => {
    let r = ppcConfig;
    for (const key of ["PK", "UAE", "KSA", "PH", "IN", "INTL"]) {
      const p = REGION_PRESETS.find((x) => x.key === key);
      if (p) r = addRegion(r, p);
    }
    const out = applyPakistanClassTime(r, "19:30", "20:30");
    const by = Object.fromEntries(out.regions.map((g) => [g.key, g.classTime]));
    expect(by.PK).toBe("7:30 PM – 8:30 PM");
    expect(by.UAE).toBe("6:30 PM – 7:30 PM");
    expect(by.INTL).toBe("7:30 PM – 8:30 PM PKT");
    expect(out.regions.length).toBe(r.regions.length);
  });
});
