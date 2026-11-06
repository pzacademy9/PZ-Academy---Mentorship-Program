import { describe, it, expect } from "vitest";
import { cleanReportAudience, matchesReportAudience, describeReportAudience } from "@/lib/progress/report-audience";

describe("matchesReportAudience", () => {
  const full = ["Live - Full Course"];
  const mods = ["Live - Modules: M2, M5"];
  it("everyone matches the all choice, even with an unreadable label", () => {
    expect(matchesReportAudience([""], { kind: "all" })).toBe(true);
    expect(matchesReportAudience([], { kind: "all" })).toBe(true);
  });
  it("full course only takes full course students", () => {
    expect(matchesReportAudience(full, { kind: "full" })).toBe(true);
    expect(matchesReportAudience(mods, { kind: "full" })).toBe(false);
    expect(matchesReportAudience([""], { kind: "full" })).toBe(false);
  });
  it("modules takes only students of the chosen modules, never full course students", () => {
    const a = { kind: "modules" as const, modules: [5] };
    expect(matchesReportAudience(full, a)).toBe(false);
    expect(matchesReportAudience(mods, a)).toBe(true);
    expect(matchesReportAudience(["Live - Modules: M2, M3"], a)).toBe(false);
    expect(matchesReportAudience(["Live - Modules: M12"], { kind: "modules", modules: [1] })).toBe(false);
  });
  it("a student with several registrations matches when any one does", () => {
    expect(matchesReportAudience(["Live - Modules: M2", "Live - Full Course"], { kind: "full" })).toBe(true);
  });
});

describe("cleanReportAudience", () => {
  it("accepts the three shapes and rejects anything else", () => {
    expect(cleanReportAudience({ kind: "all" })).toEqual({ kind: "all" });
    expect(cleanReportAudience({ kind: "full" })).toEqual({ kind: "full" });
    expect(cleanReportAudience({ kind: "modules", modules: [3, 3, 1] })).toEqual({ kind: "modules", modules: [1, 3] });
    expect(cleanReportAudience({ kind: "modules", modules: [] })).toBeNull();
    expect(cleanReportAudience({ kind: "modules", modules: [0] })).toBeNull();
    expect(cleanReportAudience({ kind: "modules", modules: [13] })).toBeNull();
    expect(cleanReportAudience({ kind: "nope" })).toBeNull();
    expect(cleanReportAudience(undefined)).toEqual({ kind: "all" });
  });
});

describe("describeReportAudience", () => {
  it("says the group in plain words", () => {
    expect(describeReportAudience({ kind: "all" })).toBe("everyone in the batch");
    expect(describeReportAudience({ kind: "full" })).toBe("full course students");
    expect(describeReportAudience({ kind: "modules", modules: [2, 5] })).toBe("students of module 2, 5");
  });
});
